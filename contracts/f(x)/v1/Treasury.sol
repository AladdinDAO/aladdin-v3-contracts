// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;
pragma abicoder v2;

import { OwnableUpgradeable } from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import { SafeMathUpgradeable } from "@openzeppelin/contracts-upgradeable/math/SafeMathUpgradeable.sol";
import { SignedSafeMathUpgradeable } from "@openzeppelin/contracts-upgradeable/math/SignedSafeMathUpgradeable.sol";
import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import { SafeERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/SafeERC20Upgradeable.sol";

import { ExponentialMovingAverageV7 } from "../../common/math/ExponentialMovingAverageV7.sol";

import { IFxPriceOracle } from "../../interfaces/f(x)/IFxPriceOracle.sol";
import { IAssetStrategy } from "../../interfaces/f(x)/IAssetStrategy.sol";
import { IFxFractionalToken } from "../../interfaces/f(x)/IFxFractionalToken.sol";
import { IFxLeveragedToken } from "../../interfaces/f(x)/IFxLeveragedToken.sol";
import { IFxMarket } from "../../interfaces/f(x)/IFxMarket.sol";
import { IFxRateProvider } from "../../interfaces/f(x)/IFxRateProvider.sol";
import { IFxTreasury } from "../../interfaces/f(x)/IFxTreasury.sol";

import { FxLowVolatilityMath } from "../math/FxLowVolatilityMath.sol";

// solhint-disable no-empty-blocks
// solhint-disable not-rely-on-time

contract Treasury is OwnableUpgradeable, IFxTreasury {
  using SafeERC20Upgradeable for IERC20Upgradeable;
  using SafeMathUpgradeable for uint256;
  using SignedSafeMathUpgradeable for int256;
  using FxLowVolatilityMath for FxLowVolatilityMath.SwapState;
  using ExponentialMovingAverageV7 for ExponentialMovingAverageV7.EMAStorage;

  /**********
   * Events *
   **********/

  /// @notice Emitted when the whitelist status for settle is updated.
  /// @param account The address of account to change.
  /// @param status The new whitelist status.
  event UpdateSettleWhitelist(address account, bool status);

  /// @notice Emitted when the price oracle contract is updated.
  /// @param priceOracle The address of new price oracle.
  event UpdatePriceOracle(address priceOracle);

  /// @notice Emitted when the rate provider contract is updated.
  /// @param rateProvider The address of new rate provider.
  event UpdateRateProvider(address rateProvider);

  /// @notice Emitted when the strategy contract is updated.
  /// @param strategy The address of new strategy.
  event UpdateStrategy(address strategy);

  /// @notice Emitted when the beta for fToken is updated.
  /// @param beta The new value of beta.
  event UpdateBeta(uint256 beta);

  /// @notice Emitted when the base token cap is updated.
  /// @param baseTokenCap The new base token cap.
  event UpdateBaseTokenCap(uint256 baseTokenCap);

  /*************
   * Constants *
   *************/

  /// @dev The precision used to compute nav.
  uint256 internal constant PRECISION = 1e18;

  /// @dev The precision used to compute nav.
  int256 private constant PRECISION_I256 = 1e18;

  /// @dev The initial mint ratio for fToken.
  uint256 private immutable initialMintRatio;

  /*********
   * Enums *
   *********/

  enum SwapKind {
    None,
    MintFToken,
    MintXToken,
    RedeemFToken,
    RedeemXToken
  }

  /*************
   * Variables *
   *************/

  /// @notice The address of market contract.
  address public market;

  /// @inheritdoc IFxTreasury
  address public override baseToken;

  /// @inheritdoc IFxTreasury
  address public override fToken;

  /// @inheritdoc IFxTreasury
  address public override xToken;

  /// @notice The address of price oracle contract.
  address public priceOracle;

  /// @notice The volitality multiple of fToken compare to base token.
  uint256 public beta;

  /// @inheritdoc IFxTreasury
  uint256 public override lastPermissionedPrice;

  /// @notice The maximum amount of base token can be deposited.
  uint256 public baseTokenCap;

  /// @inheritdoc IFxTreasury
  uint256 public override totalBaseToken;

  /// @inheritdoc IFxTreasury
  address public override strategy;

  /// @inheritdoc IFxTreasury
  uint256 public override strategyUnderlying;

  /// @notice Whether the sender is allowed to do settlement.
  mapping(address => bool) public settleWhitelist;

  /// @notice The address of rate provider contract.
  address public rateProvider;

  /// @notice The ema storage of the leverage ratio.
  ExponentialMovingAverageV7.EMAStorage public emaLeverageRatio;

  /// @dev Slots for future use.
  uint256[37] private _gap;

  /************
   * Modifier *
   ************/

  modifier onlyMarket() {
    require(msg.sender == market, "Only market");
    _;
  }

  modifier onlyStrategy() {
    require(msg.sender == strategy, "Only strategy");
    _;
  }

  /***************
   * Constructor *
   ***************/

  constructor(uint256 _initialMintRatio) {
    require(0 < _initialMintRatio && _initialMintRatio < PRECISION, "invalid initial mint ratio");
    initialMintRatio = _initialMintRatio;
  }

  function initialize(
    address _market,
    address _baseToken,
    address _fToken,
    address _xToken,
    address _priceOracle,
    uint256 _beta,
    uint256 _baseTokenCap,
    address _rateProvider
  ) external initializer {
    OwnableUpgradeable.__Ownable_init();

    market = _market;
    baseToken = _baseToken;
    fToken = _fToken;
    xToken = _xToken;
    priceOracle = _priceOracle;
    beta = _beta;
    baseTokenCap = _baseTokenCap;

    if (_rateProvider != address(0)) {
      rateProvider = _rateProvider;
    }
  }

  function initializeV2(uint24 sampleInterval) external {
    ExponentialMovingAverageV7.EMAStorage memory cachedEmaLeverageRatio = emaLeverageRatio;
    require(cachedEmaLeverageRatio.lastTime == 0, "v2 initialized");

    cachedEmaLeverageRatio.lastTime = uint40(block.timestamp);
    cachedEmaLeverageRatio.sampleInterval = sampleInterval;
    cachedEmaLeverageRatio.lastValue = uint96(PRECISION);
    cachedEmaLeverageRatio.lastEmaValue = uint96(PRECISION);

    emaLeverageRatio = cachedEmaLeverageRatio;
  }

  /*************************
   * Public View Functions *
   *************************/

  /// @inheritdoc IFxTreasury
  function collateralRatio() external view override returns (uint256) {
    FxLowVolatilityMath.SwapState memory _state = _loadSwapState(SwapKind.None);

    if (_state.baseSupply == 0) return PRECISION;
    if (_state.fSupply == 0 || _state.fNav == 0) return PRECISION * PRECISION;

    return _state.baseSupply.mul(_state.baseNav).mul(PRECISION).div(_state.fSupply.mul(_state.fNav));
  }

  /// @inheritdoc IFxTreasury
  function getCurrentNav()
    external
    view
    override
    returns (
      uint256 _baseNav,
      uint256 _fNav,
      uint256 _xNav
    )
  {
    FxLowVolatilityMath.SwapState memory _state = _loadSwapState(SwapKind.None);

    _baseNav = _state.baseNav;
    _fNav = _state.fNav;
    _xNav = _state.xNav;
  }

  /// @inheritdoc IFxTreasury
  /// @dev If the current collateral ratio <= new collateral ratio, we should return 0.
  function maxMintableFToken(uint256 _newCollateralRatio)
    external
    view
    override
    returns (uint256 _maxBaseIn, uint256 _maxFTokenMintable)
  {
    require(_newCollateralRatio > PRECISION, "collateral ratio too small");

    FxLowVolatilityMath.SwapState memory _state = _loadSwapState(SwapKind.MintFToken);
    (_maxBaseIn, _maxFTokenMintable) = _state.maxMintableFToken(_newCollateralRatio);
  }

  /// @inheritdoc IFxTreasury
  /// @dev If the current collateral ratio >= new collateral ratio, we should return 0.
  function maxMintableXToken(uint256 _newCollateralRatio)
    external
    view
    override
    returns (uint256 _maxBaseIn, uint256 _maxXTokenMintable)
  {
    require(_newCollateralRatio > PRECISION, "collateral ratio too small");

    FxLowVolatilityMath.SwapState memory _state = _loadSwapState(SwapKind.MintXToken);
    (_maxBaseIn, _maxXTokenMintable) = _state.maxMintableXToken(_newCollateralRatio);
  }

  /// @inheritdoc IFxTreasury
  /// @dev If the current collateral ratio >= new collateral ratio, we should return 0.
  function maxMintableXTokenWithIncentive(uint256 _newCollateralRatio, uint256 _incentiveRatio)
    external
    view
    override
    returns (uint256 _maxBaseIn, uint256 _maxXTokenMintable)
  {
    require(_newCollateralRatio > PRECISION, "collateral ratio too small");

    FxLowVolatilityMath.SwapState memory _state = _loadSwapState(SwapKind.MintXToken);
    (_maxBaseIn, _maxXTokenMintable) = _state.maxMintableXTokenWithIncentive(_newCollateralRatio, _incentiveRatio);
  }

  /// @inheritdoc IFxTreasury
  /// @dev If the current collateral ratio >= new collateral ratio, we should return 0.
  function maxRedeemableFToken(uint256 _newCollateralRatio)
    external
    view
    override
    returns (uint256 _maxBaseOut, uint256 _maxFTokenRedeemable)
  {
    require(_newCollateralRatio > PRECISION, "collateral ratio too small");

    FxLowVolatilityMath.SwapState memory _state = _loadSwapState(SwapKind.RedeemFToken);
    (_maxBaseOut, _maxFTokenRedeemable) = _state.maxRedeemableFToken(_newCollateralRatio);
  }

  /// @inheritdoc IFxTreasury
  /// @dev If the current collateral ratio <= new collateral ratio, we should return 0.
  function maxRedeemableXToken(uint256 _newCollateralRatio)
    external
    view
    override
    returns (uint256 _maxBaseOut, uint256 _maxXTokenRedeemable)
  {
    require(_newCollateralRatio > PRECISION, "collateral ratio too small");

    FxLowVolatilityMath.SwapState memory _state = _loadSwapState(SwapKind.RedeemXToken);
    (_maxBaseOut, _maxXTokenRedeemable) = _state.maxRedeemableXToken(_newCollateralRatio);
  }

  /// @inheritdoc IFxTreasury
  /// @dev If the current collateral ratio >= new collateral ratio, we should return 0.
  function maxLiquidatable(uint256 _newCollateralRatio, uint256 _incentiveRatio)
    external
    view
    override
    returns (uint256 _maxBaseOut, uint256 _maxFTokenLiquidatable)
  {
    require(_newCollateralRatio > PRECISION, "collateral ratio too small");

    FxLowVolatilityMath.SwapState memory _state = _loadSwapState(SwapKind.RedeemFToken);
    (_maxBaseOut, _maxFTokenLiquidatable) = _state.maxLiquidatable(_newCollateralRatio, _incentiveRatio);
  }

  /// @inheritdoc IFxTreasury
  function convertToWrapped(uint256 _amount) public view override returns (uint256) {
    address _rateProvider = rateProvider;
    if (_rateProvider != address(0)) {
      _amount = _amount.mul(PRECISION).div(IFxRateProvider(_rateProvider).getRate());
    }
    return _amount;
  }

  /// @inheritdoc IFxTreasury
  function convertToUnwrapped(uint256 _amount) external view override returns (uint256) {
    address _rateProvider = rateProvider;
    if (_rateProvider != address(0)) {
      _amount = _amount.mul(IFxRateProvider(_rateProvider).getRate()).div(PRECISION);
    }
    return _amount;
  }

  /// @inheritdoc IFxTreasury
  function leverageRatio() external view override returns (uint256) {
    return emaLeverageRatio.emaValue();
  }

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @inheritdoc IFxTreasury
  function mint(
    uint256 _baseIn,
    address _recipient,
    MintOption _option
  ) external override onlyMarket returns (uint256 _fTokenOut, uint256 _xTokenOut) {
    FxLowVolatilityMath.SwapState memory _state;

    if (_option == MintOption.FToken) {
      _state = _loadSwapState(SwapKind.MintFToken);
      _updateEMALeverageRatio(_state);
    } else if (_option == MintOption.XToken) {
      _state = _loadSwapState(SwapKind.MintXToken);
      _updateEMALeverageRatio(_state);
    } else {
      _state = _loadSwapState(SwapKind.None);
    }

    if (_option == MintOption.FToken) {
      _fTokenOut = _state.mintFToken(_baseIn);
    } else if (_option == MintOption.XToken) {
      _xTokenOut = _state.mintXToken(_baseIn);
    } else {
      if (_state.baseSupply == 0) {
        uint256 _totalVal = _baseIn.mul(_state.baseNav);
        _fTokenOut = _totalVal.mul(initialMintRatio).div(PRECISION).div(PRECISION);
        _xTokenOut = _totalVal.div(PRECISION).sub(_fTokenOut);
      } else {
        (_fTokenOut, _xTokenOut) = _state.mint(_baseIn);
      }
    }

    require(_state.baseSupply + _baseIn <= baseTokenCap, "Exceed total cap");
    totalBaseToken = _state.baseSupply + _baseIn;

    if (_fTokenOut > 0) {
      IFxFractionalToken(fToken).mint(_recipient, _fTokenOut);
    }
    if (_xTokenOut > 0) {
      IFxLeveragedToken(xToken).mint(_recipient, _xTokenOut);
    }
  }

  /// @inheritdoc IFxTreasury
  function redeem(
    uint256 _fTokenIn,
    uint256 _xTokenIn,
    address _owner
  ) external override onlyMarket returns (uint256 _baseOut) {
    FxLowVolatilityMath.SwapState memory _state;

    if (_fTokenIn > 0) {
      _state = _loadSwapState(SwapKind.RedeemFToken);
    } else {
      _state = _loadSwapState(SwapKind.RedeemXToken);
    }
    _updateEMALeverageRatio(_state);

    _baseOut = _state.redeem(_fTokenIn, _xTokenIn);

    if (_fTokenIn > 0) {
      IFxFractionalToken(fToken).burn(_owner, _fTokenIn);
    }

    if (_xTokenIn > 0) {
      IFxLeveragedToken(xToken).burn(_owner, _xTokenIn);
    }

    totalBaseToken = _state.baseSupply.sub(_baseOut);

    _transferBaseToken(_baseOut, msg.sender);
  }

  /// @inheritdoc IFxTreasury
  function addBaseToken(
    uint256 _baseIn,
    uint256 _incentiveRatio,
    address _recipient
  ) external override onlyMarket returns (uint256 _xTokenOut) {
    FxLowVolatilityMath.SwapState memory _state = _loadSwapState(SwapKind.MintXToken);
    _updateEMALeverageRatio(_state);

    uint256 _fDeltaNav;
    (_xTokenOut, _fDeltaNav) = _state.mintXToken(_baseIn, _incentiveRatio);

    require(_state.baseSupply + _baseIn <= baseTokenCap, "Exceed total cap");
    totalBaseToken = _state.baseSupply + _baseIn;

    IFxFractionalToken(fToken).setNav(
      _state.fNav.sub(_fDeltaNav).mul(PRECISION).div(uint256(PRECISION_I256.add(_state.fMultiple)))
    );

    if (_xTokenOut > 0) {
      IFxLeveragedToken(xToken).mint(_recipient, _xTokenOut);
    }
  }

  /// @inheritdoc IFxTreasury
  function liquidate(
    uint256 _fTokenIn,
    uint256 _incentiveRatio,
    address _owner
  ) external override onlyMarket returns (uint256 _baseOut) {
    FxLowVolatilityMath.SwapState memory _state = _loadSwapState(SwapKind.RedeemFToken);
    _updateEMALeverageRatio(_state);

    uint256 _fDeltaNav;
    (_baseOut, _fDeltaNav) = _state.liquidateWithIncentive(_fTokenIn, _incentiveRatio);

    totalBaseToken = _state.baseSupply.sub(_baseOut);

    address _fToken = fToken;
    IFxFractionalToken(_fToken).burn(_owner, _fTokenIn);
    IFxFractionalToken(_fToken).setNav(
      _state.fNav.sub(_fDeltaNav).mul(PRECISION).div(uint256(PRECISION_I256.add(_state.fMultiple)))
    );

    if (_baseOut > 0) {
      _transferBaseToken(_baseOut, msg.sender);
    }
  }

  /// @inheritdoc IFxTreasury
  function protocolSettle() external override {
    require(settleWhitelist[msg.sender], "only settle whitelist");
    if (totalBaseToken == 0) return;

    uint256 _newPrice = _fetchTwapPrice(SwapKind.None);
    int256 _fMultiple = _computeMultiple(_newPrice);
    uint256 _fNav = IFxFractionalToken(fToken).updateNav(_fMultiple);

    emit ProtocolSettle(_newPrice, _fNav);

    lastPermissionedPrice = _newPrice;

    // update leverage ratio at the end
    FxLowVolatilityMath.SwapState memory _state = _loadSwapState(SwapKind.None);
    _updateEMALeverageRatio(_state);
  }

  /// @inheritdoc IFxTreasury
  function transferToStrategy(uint256 _amount) external override onlyStrategy {
    IERC20Upgradeable(baseToken).safeTransfer(strategy, _amount);
    strategyUnderlying += _amount;
  }

  /// @inheritdoc IFxTreasury
  /// @dev For future use.
  function notifyStrategyProfit(uint256 _amount) external override onlyStrategy {}

  /*******************************
   * Public Restricted Functions *
   *******************************/

  function initializePrice() external onlyOwner {
    require(lastPermissionedPrice == 0, "only initialize price once");
    uint256 _price = _fetchTwapPrice(SwapKind.None);

    lastPermissionedPrice = _price;

    IFxFractionalToken(fToken).setNav(PRECISION);

    emit ProtocolSettle(_price, PRECISION);
  }

  /// @notice Change address of strategy contract.
  /// @param _strategy The new address of strategy contract.
  function updateStrategy(address _strategy) external onlyOwner {
    strategy = _strategy;

    emit UpdateStrategy(_strategy);
  }

  /// @notice Change the value of fToken beta.
  /// @param _beta The new value of beta.
  function updateBeta(uint256 _beta) external onlyOwner {
    beta = _beta;

    emit UpdateBeta(_beta);
  }

  /// @notice Change address of price oracle contract.
  /// @param _priceOracle The new address of price oracle contract.
  function updatePriceOracle(address _priceOracle) external onlyOwner {
    priceOracle = _priceOracle;

    emit UpdatePriceOracle(_priceOracle);
  }

  /// @notice Change address of rate provider contract.
  /// @param _rateProvider The new address of rate provider contract.
  function updateRateProvider(address _rateProvider) external onlyOwner {
    rateProvider = _rateProvider;

    emit UpdateRateProvider(_rateProvider);
  }

  /// @notice Update the whitelist status for settle account.
  /// @param _account The address of account to update.
  /// @param _status The status of the account to update.
  function updateSettleWhitelist(address _account, bool _status) external onlyOwner {
    settleWhitelist[_account] = _status;

    emit UpdateSettleWhitelist(_account, _status);
  }

  /// @notice Update the base token cap.
  /// @param _baseTokenCap The new base token cap.
  function updateBaseTokenCap(uint256 _baseTokenCap) external onlyOwner {
    baseTokenCap = _baseTokenCap;

    emit UpdateBaseTokenCap(_baseTokenCap);
  }

  /// @notice Update the EMA sample interval.
  /// @param _sampleInterval The new EMA sample interval.
  function updateEMASampleInterval(uint24 _sampleInterval) external onlyOwner {
    require(_sampleInterval >= 1 minutes, "EMA sample interval too small");

    FxLowVolatilityMath.SwapState memory _state = _loadSwapState(SwapKind.None);
    _updateEMALeverageRatio(_state);

    emaLeverageRatio.sampleInterval = _sampleInterval;
  }

  /**********************
   * Internal Functions *
   **********************/

  /// @dev Internal function to transfer base token to receiver.
  /// @param _amount The amount of base token to transfer.
  /// @param _recipient The address of receiver.
  function _transferBaseToken(uint256 _amount, address _recipient) internal returns (uint256) {
    _amount = convertToWrapped(_amount);

    address _baseToken = baseToken;
    uint256 _balance = IERC20Upgradeable(_baseToken).balanceOf(address(this));
    if (_balance < _amount) {
      uint256 _diff = _amount - _balance;
      IAssetStrategy(strategy).withdrawToTreasury(_diff);
      strategyUnderlying = strategyUnderlying.sub(_diff);

      // consider possible slippage here.
      _balance = IERC20Upgradeable(_baseToken).balanceOf(address(this));
      if (_amount > _balance) {
        _amount = _balance;
      }
    }

    IERC20Upgradeable(_baseToken).safeTransfer(_recipient, _amount);

    return _amount;
  }

  /// @dev Internal function to load swap variable to memory
  function _loadSwapState(SwapKind _kind) internal view returns (FxLowVolatilityMath.SwapState memory _state) {
    _state.baseSupply = totalBaseToken;
    _state.baseNav = _fetchTwapPrice(_kind);

    if (_state.baseSupply == 0) {
      _state.fNav = PRECISION;
      _state.xNav = PRECISION;
    } else {
      _state.fMultiple = _computeMultiple(_state.baseNav);
      address _fToken = fToken;
      _state.fSupply = IERC20Upgradeable(_fToken).totalSupply();
      _state.fNav = IFxFractionalToken(_fToken).getNav(_state.fMultiple);

      _state.xSupply = IERC20Upgradeable(xToken).totalSupply();
      if (_state.xSupply == 0) {
        // no xToken, treat the nav of xToken as 1.0
        _state.xNav = PRECISION;
      } else {
        _state.xNav = _state.baseSupply.mul(_state.baseNav).sub(_state.fSupply.mul(_state.fNav)).div(_state.xSupply);
      }
    }
  }

  /// @dev Internal function to update ema leverage ratio.
  function _updateEMALeverageRatio(FxLowVolatilityMath.SwapState memory _state) internal {
    ExponentialMovingAverageV7.EMAStorage memory cachedEmaLeverageRatio = emaLeverageRatio;
    int256 _lastPermissionedPrice = int256(lastPermissionedPrice);
    int256 _earningRatio = int256(_state.baseNav).sub(_lastPermissionedPrice).mul(PRECISION_I256).div(
      _lastPermissionedPrice
    );
    uint256 _ratio = _state.leverageRatio(beta, _earningRatio);

    // The value is capped with 100*10^18, it is safe to cast.
    cachedEmaLeverageRatio.saveValue(uint96(_ratio));

    emaLeverageRatio = cachedEmaLeverageRatio;
  }

  /// @dev Internal function to compute latest nav multiple based on current price.
  ///
  /// Below are some important formula to do the update.
  ///                newPrice
  /// ratio = --------------------- - 1
  ///         lastPermissionedPrice
  ///
  /// lastIntermediateFTokenNav = (1 + beta * ratio) * lastFTokenNav
  ///
  /// @param _newPrice The current price of base token.
  /// @return _fMultiple The multiple for fToken.
  function _computeMultiple(uint256 _newPrice) internal view returns (int256 _fMultiple) {
    int256 _lastPermissionedPrice = int256(lastPermissionedPrice);

    int256 _ratio = int256(_newPrice).sub(_lastPermissionedPrice).mul(PRECISION_I256).div(_lastPermissionedPrice);

    _fMultiple = _ratio.mul(int256(beta)).div(PRECISION_I256);
  }

  /// @dev Internal function to fetch twap price.
  /// @return _price The twap price of the base token.
  function _fetchTwapPrice(SwapKind _kind) internal view returns (uint256 _price) {
    (bool _isValid, uint256 _safePrice, uint256 _minPrice, uint256 _maxPrice) = IFxPriceOracle(priceOracle).getPrice();

    _price = _safePrice;
    if (_kind == SwapKind.MintFToken || _kind == SwapKind.MintXToken) {
      require(_isValid, "oracle price is invalid");
    } else if (!_isValid) {
      if (_kind == SwapKind.RedeemFToken) {
        _price = _maxPrice;
      } else if (_kind == SwapKind.RedeemXToken) {
        _price = _minPrice;
      }
    }

    require(_price > 0, "invalid twap price");
  }
}
