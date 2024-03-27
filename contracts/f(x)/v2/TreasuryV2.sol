// SPDX-License-Identifier: MIT

pragma solidity =0.8.20;
pragma abicoder v2;

import { AccessControlUpgradeable } from "@openzeppelin/contracts-upgradeable-v4/access/AccessControlUpgradeable.sol";
import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable-v4/token/ERC20/IERC20Upgradeable.sol";
import { SafeERC20Upgradeable } from "@openzeppelin/contracts-upgradeable-v4/token/ERC20/utils/SafeERC20Upgradeable.sol";

import { WordCodec } from "../../common/codec/WordCodec.sol";
import { ExponentialMovingAverageV8 } from "../../common/math/ExponentialMovingAverageV8.sol";

import { IFxPriceOracle } from "../../interfaces/f(x)/IFxPriceOracle.sol";
import { IAssetStrategy } from "../../interfaces/f(x)/IAssetStrategy.sol";
import { IFxFractionalTokenV2 } from "../../interfaces/f(x)/IFxFractionalTokenV2.sol";
import { IFxLeveragedTokenV2 } from "../../interfaces/f(x)/IFxLeveragedTokenV2.sol";
import { IFxMarketV2 } from "../../interfaces/f(x)/IFxMarketV2.sol";
import { IFxRateProvider } from "../../interfaces/f(x)/IFxRateProvider.sol";
import { IFxTreasuryV2 } from "../../interfaces/f(x)/IFxTreasuryV2.sol";

import { FxStableMath } from "../math/FxStableMath.sol";

// solhint-disable no-empty-blocks
// solhint-disable not-rely-on-time

abstract contract TreasuryV2 is AccessControlUpgradeable, IFxTreasuryV2 {
  using SafeERC20Upgradeable for IERC20Upgradeable;

  using ExponentialMovingAverageV8 for ExponentialMovingAverageV8.EMAStorage;
  using FxStableMath for FxStableMath.SwapState;
  using WordCodec for bytes32;

  /*************
   * Constants *
   *************/

  /// @inheritdoc IFxTreasuryV2
  address public immutable override baseToken;

  /// @inheritdoc IFxTreasuryV2
  address public immutable override fToken;

  /// @inheritdoc IFxTreasuryV2
  address public immutable override xToken;

  /// @notice The role for f(x) market contract.
  bytes32 public constant FX_MARKET_ROLE = keccak256("FX_MARKET_ROLE");

  /// @notice The role for f(x) settle whitelist.
  bytes32 public constant SETTLE_WHITELIST_ROLE = keccak256("SETTLE_WHITELIST_ROLE");

  /// @notice The role for f(x) settle whitelist.
  bytes32 public constant PROTOCOL_INITIALIZER_ROLE = keccak256("PROTOCOL_INITIALIZER_ROLE");

  /// @dev The precision used to compute fees.
  uint256 internal constant FEE_PRECISION = 1e9;

  /// @dev The precision used to compute nav.
  uint256 internal constant PRECISION = 1e18;

  /// @dev The precision used to compute nav.
  int256 private constant PRECISION_I256 = 1e18;

  /// @dev The offset of expense ratio in `_miscData`.
  uint256 private constant REBALANCE_POOL_RATIO_OFFSET = 0;

  /// @dev The offset of harvester ratio in `_miscData`.
  uint256 private constant HARVESTER_RATIO_OFFSET = 30;

  /// @dev The maximum expense ratio.
  uint256 private constant MAX_REBALANCE_POOL_RATIO = 1e9; // 100%

  /// @dev The maximum harvester ratio.
  uint256 private constant MAX_HARVESTER_RATIO = 1e8; // 10%

  /*************
   * Variables *
   *************/

  /// @notice The address of price oracle contract.
  address public priceOracle;

  /// @inheritdoc IFxTreasuryV2
  uint256 public override referenceBaseTokenPrice;

  /// @inheritdoc IFxTreasuryV2
  uint256 public override totalBaseToken;

  /// @notice The maximum amount of base token can be deposited.
  uint256 public baseTokenCap;

  /// @inheritdoc IFxTreasuryV2
  address public override strategy;

  /// @inheritdoc IFxTreasuryV2
  uint256 public override strategyUnderlying;

  /// @notice The ema storage of the leverage ratio.
  ExponentialMovingAverageV8.EMAStorage public emaLeverageRatio;

  /// @notice The address platform contract.
  address public platform;

  /// @notice The address of RebalancePoolSplitter contract.
  address public rebalancePoolSplitter;

  /// @dev `_miscData` is a storage slot that can be used to store unrelated pieces of information.
  /// All pools store the *expense ratio* and *harvester ratio*, but the `miscData`can be extended
  /// to store more pieces of information.
  ///
  /// The *expense ratio* is stored in the first most significant 32 bits, and the *harvester ratio* is
  /// stored in the next most significant 32 bits leaving the remaining 196 bits free to store any
  /// other information derived pools might need.
  ///
  /// - The *expense ratio* and *harvester ratio* are charged each time when harvester harvest the pool revenue.
  ///
  /// [ expense ratio | harvester ratio | available ]
  /// [    30 bits    |     30 bits     |  196 bits ]
  /// [ MSB                                     LSB ]
  bytes32 internal _miscData;

  /// @dev Slots for future use.
  uint256[40] private _gap;

  /************
   * Modifier *
   ************/

  modifier onlyStrategy() {
    require(msg.sender == strategy, "Only strategy");
    _;
  }

  /***************
   * Constructor *
   ***************/

  constructor(
    address _baseToken,
    address _fToken,
    address _xToken
  ) {
    baseToken = _baseToken;
    fToken = _fToken;
    xToken = _xToken;
  }

  function __TreasuryV2_init(
    address _platform,
    address _rebalancePoolSplitter,
    address _priceOracle,
    uint256 _baseTokenCap,
    uint24 sampleInterval
  ) internal onlyInitializing {
    _updatePlatform(_platform);
    _updateRebalancePoolSplitter(_rebalancePoolSplitter);
    _updatePriceOracle(_priceOracle);
    _updateBaseTokenCap(_baseTokenCap);
    _updateEMASampleInterval(sampleInterval);
  }

  /*************************
   * Public View Functions *
   *************************/

  /// @inheritdoc IFxTreasuryV2
  function getRebalancePoolRatio() public view override returns (uint256) {
    return _miscData.decodeUint(REBALANCE_POOL_RATIO_OFFSET, 30);
  }

  /// @inheritdoc IFxTreasuryV2
  function getHarvesterRatio() public view override returns (uint256) {
    return _miscData.decodeUint(HARVESTER_RATIO_OFFSET, 30);
  }

  /// @inheritdoc IFxTreasuryV2
  function collateralRatio() public view override returns (uint256) {
    FxStableMath.SwapState memory _state = _loadSwapState(Action.None);

    if (_state.baseSupply == 0) return PRECISION;
    if (_state.fSupply == 0) return PRECISION * PRECISION;

    return (_state.baseSupply * _state.baseNav) / _state.fSupply;
  }

  /// @inheritdoc IFxTreasuryV2
  function isUnderCollateral() public view returns (bool) {
    FxStableMath.SwapState memory _state = _loadSwapState(Action.None);
    return _state.xNav == 0;
  }

  /// @inheritdoc IFxTreasuryV2
  /// @dev If the current collateral ratio <= new collateral ratio, we should return 0.
  function maxMintableFToken(uint256 _newCollateralRatio)
    external
    view
    override
    returns (uint256 _maxBaseIn, uint256 _maxFTokenMintable)
  {
    if (_newCollateralRatio <= PRECISION) revert ErrorCollateralRatioTooSmall();

    FxStableMath.SwapState memory _state = _loadSwapState(Action.MintFToken);
    (_maxBaseIn, _maxFTokenMintable) = _state.maxMintableFToken(_newCollateralRatio);
  }

  /// @inheritdoc IFxTreasuryV2
  /// @dev If the current collateral ratio >= new collateral ratio, we should return 0.
  function maxMintableXToken(uint256 _newCollateralRatio)
    external
    view
    override
    returns (uint256 _maxBaseIn, uint256 _maxXTokenMintable)
  {
    if (_newCollateralRatio <= PRECISION) revert ErrorCollateralRatioTooSmall();

    FxStableMath.SwapState memory _state = _loadSwapState(Action.MintXToken);
    (_maxBaseIn, _maxXTokenMintable) = _state.maxMintableXToken(_newCollateralRatio);
  }

  /// @inheritdoc IFxTreasuryV2
  /// @dev If the current collateral ratio >= new collateral ratio, we should return 0.
  function maxRedeemableFToken(uint256 _newCollateralRatio)
    external
    view
    override
    returns (uint256 _maxBaseOut, uint256 _maxFTokenRedeemable)
  {
    if (_newCollateralRatio <= PRECISION) revert ErrorCollateralRatioTooSmall();

    FxStableMath.SwapState memory _state = _loadSwapState(Action.RedeemFToken);
    (_maxBaseOut, _maxFTokenRedeemable) = _state.maxRedeemableFToken(_newCollateralRatio);
  }

  /// @inheritdoc IFxTreasuryV2
  /// @dev If the current collateral ratio <= new collateral ratio, we should return 0.
  function maxRedeemableXToken(uint256 _newCollateralRatio)
    external
    view
    override
    returns (uint256 _maxBaseOut, uint256 _maxXTokenRedeemable)
  {
    if (_newCollateralRatio <= PRECISION) revert ErrorCollateralRatioTooSmall();

    FxStableMath.SwapState memory _state = _loadSwapState(Action.RedeemXToken);
    (_maxBaseOut, _maxXTokenRedeemable) = _state.maxRedeemableXToken(_newCollateralRatio);
  }

  /// @inheritdoc IFxTreasuryV2
  function currentBaseTokenPrice() external view override returns (uint256) {
    return _fetchTwapPrice(Action.None);
  }

  /// @inheritdoc IFxTreasuryV2
  function isBaseTokenPriceValid() external view returns (bool _isValid) {
    (_isValid, , , ) = IFxPriceOracle(priceOracle).getPrice();
  }

  /// @inheritdoc IFxTreasuryV2
  function leverageRatio() external view override returns (uint256) {
    return emaLeverageRatio.emaValue();
  }

  /// @inheritdoc IFxTreasuryV2
  function getWrapppedValue(uint256 amount) public view virtual returns (uint256) {
    return amount;
  }

  /// @inheritdoc IFxTreasuryV2
  function getUnderlyingValue(uint256 amount) public view virtual returns (uint256) {
    return amount;
  }

  /// @notice Return then amount of base token can be harvested.
  function harvestable() public view returns (uint256) {
    uint256 balance = IERC20Upgradeable(baseToken).balanceOf(address(this));
    uint256 managed = getWrapppedValue(totalBaseToken);
    if (balance < managed) return 0;
    else return balance - managed;
  }

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @inheritdoc IFxTreasuryV2
  function mintFToken(uint256 _baseIn, address _recipient)
    external
    override
    onlyRole(FX_MARKET_ROLE)
    returns (uint256 _fTokenOut)
  {
    FxStableMath.SwapState memory _state = _loadSwapState(Action.MintFToken);
    if (_state.xNav == 0) revert ErrorUnderCollateral();
    if (_state.baseSupply + _baseIn > baseTokenCap) revert ErrorExceedTotalCap();

    _updateEMALeverageRatio(_state);

    _fTokenOut = _state.mintFToken(_baseIn);
    totalBaseToken = _state.baseSupply + _baseIn;

    IFxFractionalTokenV2(fToken).mint(_recipient, _fTokenOut);
  }

  /// @inheritdoc IFxTreasuryV2
  function mintXToken(uint256 _baseIn, address _recipient)
    external
    override
    onlyRole(FX_MARKET_ROLE)
    returns (uint256 _xTokenOut)
  {
    FxStableMath.SwapState memory _state = _loadSwapState(Action.MintXToken);
    if (_state.xNav == 0) revert ErrorUnderCollateral();
    if (_state.baseSupply + _baseIn > baseTokenCap) revert ErrorExceedTotalCap();

    _updateEMALeverageRatio(_state);

    _xTokenOut = _state.mintXToken(_baseIn);
    totalBaseToken = _state.baseSupply + _baseIn;

    IFxLeveragedTokenV2(xToken).mint(_recipient, _xTokenOut);
  }

  /// @inheritdoc IFxTreasuryV2
  function redeem(
    uint256 _fTokenIn,
    uint256 _xTokenIn,
    address _owner
  ) external override onlyRole(FX_MARKET_ROLE) returns (uint256 _baseOut) {
    FxStableMath.SwapState memory _state;

    if (_fTokenIn > 0) {
      _state = _loadSwapState(Action.RedeemFToken);
    } else {
      _state = _loadSwapState(Action.RedeemXToken);
    }
    _updateEMALeverageRatio(_state);

    if (_state.xNav == 0) {
      if (_xTokenIn > 0) revert ErrorUnderCollateral();
      // only redeem fToken proportionallly when under collateral.
      _baseOut = (_fTokenIn * _state.baseSupply) / _state.fSupply;
    } else {
      _baseOut = _state.redeem(_fTokenIn, _xTokenIn);
    }

    if (_fTokenIn > 0) {
      IFxFractionalTokenV2(fToken).burn(_owner, _fTokenIn);
    }

    if (_xTokenIn > 0) {
      IFxLeveragedTokenV2(xToken).burn(_owner, _xTokenIn);
    }

    totalBaseToken = _state.baseSupply - _baseOut;

    _transferBaseToken(_baseOut, msg.sender);
  }

  /// @inheritdoc IFxTreasuryV2
  function settle() external override onlyRole(SETTLE_WHITELIST_ROLE) {
    if (totalBaseToken == 0) return;

    uint256 _oldPrice = referenceBaseTokenPrice;
    uint256 _newPrice = _fetchTwapPrice(Action.None);
    referenceBaseTokenPrice = _newPrice;

    emit Settle(_oldPrice, _newPrice);

    // update leverage ratio at the end
    FxStableMath.SwapState memory _state = _loadSwapState(Action.None);
    _updateEMALeverageRatio(_state);
  }

  /// @inheritdoc IFxTreasuryV2
  function transferToStrategy(uint256 _amount) external override onlyStrategy {
    IERC20Upgradeable(baseToken).safeTransfer(strategy, _amount);
    strategyUnderlying += _amount;
  }

  /// @inheritdoc IFxTreasuryV2
  /// @dev For future use.
  function notifyStrategyProfit(uint256 _amount) external override onlyStrategy {}

  /// @notice Harvest pending rewards to stability pool.
  function harvest() external {
    if (isUnderCollateral()) revert ErrorUnderCollateral();

    FxStableMath.SwapState memory _state = _loadSwapState(Action.None);
    _updateEMALeverageRatio(_state);

    uint256 _totalRewards = harvestable();
    uint256 _harvestBounty = (getHarvesterRatio() * _totalRewards) / FEE_PRECISION;
    uint256 _rebalancePoolRewards = (getRebalancePoolRatio() * _totalRewards) / FEE_PRECISION;

    emit Harvest(msg.sender, _totalRewards, _rebalancePoolRewards, _harvestBounty);

    if (_harvestBounty > 0) {
      IERC20Upgradeable(baseToken).safeTransfer(_msgSender(), _harvestBounty);
      unchecked {
        _totalRewards = _totalRewards - _harvestBounty;
      }
    }

    if (_rebalancePoolRewards > 0) {
      _distributeRebalancePoolRewards(baseToken, _rebalancePoolRewards);
      unchecked {
        _totalRewards = _totalRewards - _rebalancePoolRewards;
      }
    }

    if (_totalRewards > 0) {
      IERC20Upgradeable(baseToken).safeTransfer(platform, _totalRewards);
    }
  }

  /************************
   * Restricted Functions *
   ************************/

  /// @inheritdoc IFxTreasuryV2
  function initializeProtocol(uint256 _baseIn)
    external
    onlyRole(PROTOCOL_INITIALIZER_ROLE)
    returns (uint256 fTokenOut, uint256 xTokenOut)
  {
    if (referenceBaseTokenPrice > 0) revert ErrorProtocolInitialized();
    if (getUnderlyingValue(IERC20Upgradeable(baseToken).balanceOf(address(this))) < _baseIn) {
      revert ErrorInsufficientInitialBaseToken();
    }

    // initialize reference price
    address _sender = _msgSender();
    uint256 _price = _fetchTwapPrice(Action.None);
    referenceBaseTokenPrice = _price;
    emit Settle(0, _price);

    // mint fToken and xToken
    totalBaseToken = _baseIn;
    fTokenOut = (_baseIn * _price) / (2 * PRECISION);
    xTokenOut = fTokenOut;
    IFxFractionalTokenV2(fToken).mint(_sender, fTokenOut);
    IFxLeveragedTokenV2(xToken).mint(_sender, xTokenOut);

    // initialize EMA leverage
    ExponentialMovingAverageV8.EMAStorage memory cachedEmaLeverageRatio = emaLeverageRatio;
    cachedEmaLeverageRatio.lastTime = uint40(block.timestamp);
    cachedEmaLeverageRatio.lastValue = uint96(PRECISION * 2);
    cachedEmaLeverageRatio.lastEmaValue = uint96(PRECISION * 2);
    emaLeverageRatio = cachedEmaLeverageRatio;
  }

  /// @notice Change address of strategy contract.
  /// @param _strategy The new address of strategy contract.
  function updateStrategy(address _strategy) external onlyRole(DEFAULT_ADMIN_ROLE) {
    _updateStrategy(_strategy);
  }

  /// @notice Change address of price oracle contract.
  /// @param _priceOracle The new address of price oracle contract.
  function updatePriceOracle(address _priceOracle) external onlyRole(DEFAULT_ADMIN_ROLE) {
    _updatePriceOracle(_priceOracle);
  }

  /// @notice Update the base token cap.
  /// @param _baseTokenCap The new base token cap.
  function updateBaseTokenCap(uint256 _baseTokenCap) external onlyRole(DEFAULT_ADMIN_ROLE) {
    _updateBaseTokenCap(_baseTokenCap);
  }

  /// @notice Update the EMA sample interval.
  /// @param _sampleInterval The new EMA sample interval.
  function updateEMASampleInterval(uint24 _sampleInterval) external onlyRole(DEFAULT_ADMIN_ROLE) {
    FxStableMath.SwapState memory _state = _loadSwapState(Action.None);
    _updateEMALeverageRatio(_state);

    _updateEMASampleInterval(_sampleInterval);
  }

  /// @notice Change address of platform contract.
  /// @param _platform The new address of platform contract.
  function updatePlatform(address _platform) external onlyRole(DEFAULT_ADMIN_ROLE) {
    _updatePlatform(_platform);
  }

  /// @notice Change address of RebalancePoolSplitter contract.
  /// @param _splitter The new address of RebalancePoolSplitter contract.
  function updateRebalancePoolSplitter(address _splitter) external onlyRole(DEFAULT_ADMIN_ROLE) {
    _updateRebalancePoolSplitter(_splitter);
  }

  /// @notice Update the fee ratio distributed to treasury.
  /// @param _newRatio The new ratio to update, multipled by 1e9.
  function updateRebalancePoolRatio(uint32 _newRatio) external onlyRole(DEFAULT_ADMIN_ROLE) {
    if (uint256(_newRatio) > MAX_REBALANCE_POOL_RATIO) {
      revert ErrorRebalancePoolRatioTooLarge();
    }

    bytes32 _data = _miscData;
    uint256 _oldRatio = _miscData.decodeUint(REBALANCE_POOL_RATIO_OFFSET, 30);
    _miscData = _data.insertUint(_newRatio, REBALANCE_POOL_RATIO_OFFSET, 30);

    emit UpdateRebalancePoolRatio(_oldRatio, _newRatio);
  }

  /// @notice Update the fee ratio distributed to harvester.
  /// @param _newRatio The new ratio to update, multipled by 1e9.
  function updateHarvesterRatio(uint32 _newRatio) external onlyRole(DEFAULT_ADMIN_ROLE) {
    if (uint256(_newRatio) > MAX_HARVESTER_RATIO) {
      revert ErrorHarvesterRatioTooLarge();
    }

    bytes32 _data = _miscData;
    uint256 _oldRatio = _miscData.decodeUint(HARVESTER_RATIO_OFFSET, 30);
    _miscData = _data.insertUint(_newRatio, HARVESTER_RATIO_OFFSET, 30);

    emit UpdateHarvesterRatio(_oldRatio, _newRatio);
  }

  /**********************
   * Internal Functions *
   **********************/

  /// @dev Internal function to change the address of strategy contract.
  /// @param _newStrategy The new address of strategy contract.
  function _updateStrategy(address _newStrategy) internal {
    address _oldStrategy = strategy;
    strategy = _newStrategy;

    emit UpdateStrategy(_oldStrategy, _newStrategy);
  }

  /// @dev Internal function to change the address of price oracle contract.
  /// @param _newPriceOracle The new address of price oracle contract.
  function _updatePriceOracle(address _newPriceOracle) internal {
    if (_newPriceOracle == address(0)) revert ErrorZeroAddress();

    address _oldPriceOracle = priceOracle;
    priceOracle = _newPriceOracle;

    emit UpdatePriceOracle(_oldPriceOracle, _newPriceOracle);
  }

  /// @dev Internal function to update the base token cap.
  /// @param _newBaseTokenCap The new base token cap.
  function _updateBaseTokenCap(uint256 _newBaseTokenCap) internal {
    uint256 _oldBaseTokenCap = baseTokenCap;
    baseTokenCap = _newBaseTokenCap;

    emit UpdateBaseTokenCap(_oldBaseTokenCap, _newBaseTokenCap);
  }

  /// @dev Internal function to update the EMA sample interval.
  /// @param _newSampleInterval The new EMA sample interval.
  function _updateEMASampleInterval(uint24 _newSampleInterval) internal {
    if (_newSampleInterval < 1 minutes) revert ErrorEMASampleIntervalTooSmall();

    uint256 _oldSampleInterval = emaLeverageRatio.sampleInterval;
    emaLeverageRatio.sampleInterval = _newSampleInterval;

    emit UpdateEMASampleInterval(_oldSampleInterval, _newSampleInterval);
  }

  /// @dev Internal function to change the address of platform contract.
  /// @param _newPlatform The new address of platform contract.
  function _updatePlatform(address _newPlatform) internal {
    if (_newPlatform == address(0)) revert ErrorZeroAddress();

    address _oldPlatform = platform;
    platform = _newPlatform;

    emit UpdatePlatform(_oldPlatform, _newPlatform);
  }

  /// @dev Internal function to change the address of RebalancePoolSplitter contract.
  /// @param _newRebalancePoolSplitter The new address of RebalancePoolSplitter contract.
  function _updateRebalancePoolSplitter(address _newRebalancePoolSplitter) internal {
    if (_newRebalancePoolSplitter == address(0)) revert ErrorZeroAddress();
    address _oldRebalancePoolSplitter = rebalancePoolSplitter;
    rebalancePoolSplitter = _newRebalancePoolSplitter;

    emit UpdateRebalancePoolSplitter(_oldRebalancePoolSplitter, _newRebalancePoolSplitter);
  }

  /// @dev Internal function to transfer base token to receiver.
  /// @param _amount The amount of base token to transfer.
  /// @param _recipient The address of receiver.
  function _transferBaseToken(uint256 _amount, address _recipient) internal returns (uint256) {
    _amount = getWrapppedValue(_amount);

    uint256 _balance = IERC20Upgradeable(baseToken).balanceOf(address(this));
    if (_balance < _amount) {
      uint256 _diff = _amount - _balance;
      IAssetStrategy(strategy).withdrawToTreasury(_diff);
      strategyUnderlying = strategyUnderlying - _diff;

      // consider possible slippage here.
      _balance = IERC20Upgradeable(baseToken).balanceOf(address(this));
      if (_amount > _balance) {
        _amount = _balance;
      }
    }

    IERC20Upgradeable(baseToken).safeTransfer(_recipient, _amount);

    return _amount;
  }

  /// @dev Internal function to load swap variable to memory
  function _loadSwapState(Action _action) internal view returns (FxStableMath.SwapState memory _state) {
    _state.baseSupply = totalBaseToken;
    _state.baseNav = _fetchTwapPrice(_action);

    if (_state.baseSupply == 0) {
      _state.xNav = PRECISION;
    } else {
      _state.fSupply = IERC20Upgradeable(fToken).totalSupply();
      _state.xSupply = IERC20Upgradeable(xToken).totalSupply();
      if (_state.xSupply == 0) {
        // no xToken, treat the nav of xToken as 1.0
        _state.xNav = PRECISION;
      } else {
        uint256 _baseVal = _state.baseSupply * _state.baseNav;
        uint256 _fVal = _state.fSupply * PRECISION;
        if (_baseVal >= _fVal) {
          _state.xNav = (_baseVal - _fVal) / _state.xSupply;
        } else {
          // under collateral
          _state.xNav = 0;
        }
      }
    }
  }

  /// @dev Internal function to update ema leverage ratio.
  function _updateEMALeverageRatio(FxStableMath.SwapState memory _state) internal {
    uint256 _ratio = _state.leverageRatio();

    ExponentialMovingAverageV8.EMAStorage memory cachedEmaLeverageRatio = emaLeverageRatio;
    // The value is capped with 100*10^18, it is safe to cast.
    cachedEmaLeverageRatio.saveValue(uint96(_ratio));
    emaLeverageRatio = cachedEmaLeverageRatio;
  }

  /// @dev Internal function to fetch twap price.
  /// @return _twapPrice The twap price of the base token.
  function _fetchTwapPrice(Action _action) internal view returns (uint256 _twapPrice) {
    (bool _isValid, uint256 _safePrice, uint256 _minPrice, uint256 _maxPrice) = IFxPriceOracle(priceOracle).getPrice();

    _twapPrice = _safePrice;
    if (_action == Action.MintFToken || _action == Action.MintXToken) {
      if (!_isValid) revert ErrorInvalidOraclePrice();
    } else if (!_isValid) {
      if (_action == Action.RedeemFToken) {
        _twapPrice = _maxPrice;
      } else if (_action == Action.RedeemXToken) {
        _twapPrice = _minPrice;
      }
    }

    if (_twapPrice == 0) revert ErrorInvalidTwapPrice();
  }

  /// @dev Internal function to distribute rewards to rebalance pool.
  /// @param _token The address of token to distribute.
  /// @param _amount The amount of token to distribute.
  function _distributeRebalancePoolRewards(address _token, uint256 _amount) internal virtual;
}
