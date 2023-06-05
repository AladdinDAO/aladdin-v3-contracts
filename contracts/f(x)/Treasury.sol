// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;
pragma abicoder v2;

import { OwnableUpgradeable } from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import { SafeMathUpgradeable } from "@openzeppelin/contracts-upgradeable/math/SafeMathUpgradeable.sol";
import { SignedSafeMathUpgradeable } from "@openzeppelin/contracts-upgradeable/math/SignedSafeMathUpgradeable.sol";
import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import { SafeERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/SafeERC20Upgradeable.sol";

import { ITwapOracle } from "../price-oracle/interfaces/ITwapOracle.sol";
import { IAssetStrategy } from "./interfaces/IAssetStrategy.sol";
import { IFractionalToken } from "./interfaces/IFractionalToken.sol";
import { ILeveragedToken } from "./interfaces/ILeveragedToken.sol";
import { IMarket } from "./interfaces/IMarket.sol";
import { ITreasury } from "./interfaces/ITreasury.sol";

import { StableCoinMath } from "./StableCoinMath.sol";

// solhint-disable no-empty-blocks
// solhint-disable not-rely-on-time

contract Treasury is OwnableUpgradeable, ITreasury {
  using SafeERC20Upgradeable for IERC20Upgradeable;
  using SafeMathUpgradeable for uint256;
  using SignedSafeMathUpgradeable for int256;
  using StableCoinMath for StableCoinMath.SwapState;

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

  /// @notice Emitted when the strategy contract is updated.
  /// @param strategy The address of new strategy.
  event UpdateStrategy(address strategy);

  /// @notice Emitted when the beta for fToken is updated.
  /// @param beta The new value of beta.
  event UpdateBeta(uint256 beta);

  /*************
   * Constants *
   *************/

  /// @dev The precision used to compute nav.
  uint256 private constant PRECISION = 1e18;

  /// @dev The precision used to compute nav.
  int256 private constant PRECISION_I256 = 1e18;

  /// @dev The initial mint ratio for fToken.
  uint256 private immutable initialMintRatio;

  /***********
   * Structs *
   ***********/

  struct TwapCache {
    uint128 price;
    uint128 timestamp;
  }

  /*************
   * Variables *
   *************/

  /// @notice The address of market contract.
  address public market;

  /// @inheritdoc ITreasury
  address public override baseToken;

  /// @inheritdoc ITreasury
  address public override fToken;

  /// @inheritdoc ITreasury
  address public override xToken;

  /// @notice The address of price oracle contract.
  address public priceOracle;

  /// @notice The volitality multiple of fToken compare to base token.
  uint256 public beta;

  /// @inheritdoc ITreasury
  uint256 public override lastPermissionedPrice;

  /// @inheritdoc ITreasury
  uint256 public override totalBaseToken;

  /// @inheritdoc ITreasury
  address public override strategy;

  /// @inheritdoc ITreasury
  uint256 public override strategyUnderlying;

  TwapCache public twapCache;

  /// @notice Whether the sender is allowed to do settlement.
  mapping(address => bool) public settleWhitelist;

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
    uint256 _beta
  ) external initializer {
    OwnableUpgradeable.__Ownable_init();

    market = _market;
    baseToken = _baseToken;
    fToken = _fToken;
    xToken = _xToken;
    priceOracle = _priceOracle;
    beta = _beta;
  }

  /*************************
   * Public View Functions *
   *************************/

  /// @inheritdoc ITreasury
  function collateralRatio() external view override returns (uint256) {
    StableCoinMath.SwapState memory _state = _loadSwapState();

    if (_state.baseSupply == 0) return PRECISION;
    if (_state.fSupply == 0 || _state.fNav == 0) return PRECISION * PRECISION;

    return _state.baseSupply.mul(_state.baseNav).mul(PRECISION).div(_state.fSupply.mul(_state.fNav));
  }

  /// @inheritdoc ITreasury
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
    StableCoinMath.SwapState memory _state = _loadSwapState();

    _baseNav = _state.baseNav;
    _fNav = _state.fNav;
    _xNav = _state.xNav;
  }

  /// @inheritdoc ITreasury
  /// @dev If the current collateral ratio <= new collateral ratio, we should return 0.
  function maxMintableFToken(uint256 _newCollateralRatio)
    external
    view
    override
    returns (uint256 _maxBaseIn, uint256 _maxFTokenMintable)
  {
    require(_newCollateralRatio > PRECISION, "collateral ratio too small");

    StableCoinMath.SwapState memory _state = _loadSwapState();
    (_maxBaseIn, _maxFTokenMintable) = _state.maxMintableFToken(_newCollateralRatio);
  }

  /// @inheritdoc ITreasury
  /// @dev If the current collateral ratio >= new collateral ratio, we should return 0.
  function maxMintableXToken(uint256 _newCollateralRatio)
    external
    view
    override
    returns (uint256 _maxBaseIn, uint256 _maxXTokenMintable)
  {
    require(_newCollateralRatio > PRECISION, "collateral ratio too small");

    StableCoinMath.SwapState memory _state = _loadSwapState();
    (_maxBaseIn, _maxXTokenMintable) = _state.maxMintableXToken(_newCollateralRatio);
  }

  /// @inheritdoc ITreasury
  /// @dev If the current collateral ratio >= new collateral ratio, we should return 0.
  function maxMintableXTokenWithIncentive(uint256 _newCollateralRatio, uint256 _incentiveRatio)
    external
    view
    override
    returns (uint256 _maxBaseIn, uint256 _maxXTokenMintable)
  {
    require(_newCollateralRatio > PRECISION, "collateral ratio too small");

    StableCoinMath.SwapState memory _state = _loadSwapState();
    (_maxBaseIn, _maxXTokenMintable) = _state.maxMintableXTokenWithIncentive(_newCollateralRatio, _incentiveRatio);
  }

  /// @inheritdoc ITreasury
  /// @dev If the current collateral ratio >= new collateral ratio, we should return 0.
  function maxRedeemableFToken(uint256 _newCollateralRatio)
    external
    view
    override
    returns (uint256 _maxBaseOut, uint256 _maxFTokenRedeemable)
  {
    require(_newCollateralRatio > PRECISION, "collateral ratio too small");

    StableCoinMath.SwapState memory _state = _loadSwapState();
    (_maxBaseOut, _maxFTokenRedeemable) = _state.maxRedeemableFToken(_newCollateralRatio);
  }

  /// @inheritdoc ITreasury
  /// @dev If the current collateral ratio <= new collateral ratio, we should return 0.
  function maxRedeemableXToken(uint256 _newCollateralRatio)
    external
    view
    override
    returns (uint256 _maxBaseOut, uint256 _maxXTokenRedeemable)
  {
    require(_newCollateralRatio > PRECISION, "collateral ratio too small");

    StableCoinMath.SwapState memory _state = _loadSwapState();
    (_maxBaseOut, _maxXTokenRedeemable) = _state.maxRedeemableXToken(_newCollateralRatio);
  }

  /// @inheritdoc ITreasury
  /// @dev If the current collateral ratio >= new collateral ratio, we should return 0.
  function maxLiquidatable(uint256 _newCollateralRatio, uint256 _incentiveRatio)
    external
    view
    override
    returns (uint256 _maxBaseOut, uint256 _maxFTokenLiquidatable)
  {
    require(_newCollateralRatio > PRECISION, "collateral ratio too small");

    StableCoinMath.SwapState memory _state = _loadSwapState();
    (_maxBaseOut, _maxFTokenLiquidatable) = _state.maxLiquidatable(_newCollateralRatio, _incentiveRatio);
  }

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @inheritdoc ITreasury
  function mint(
    uint256 _baseIn,
    address _recipient,
    MintOption _option
  ) external override onlyMarket returns (uint256 _fTokenOut, uint256 _xTokenOut) {
    StableCoinMath.SwapState memory _state = _loadSwapState();

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

    totalBaseToken = _state.baseSupply + _baseIn;

    if (_fTokenOut > 0) {
      IFractionalToken(fToken).mint(_recipient, _fTokenOut);
    }
    if (_xTokenOut > 0) {
      ILeveragedToken(xToken).mint(_recipient, _xTokenOut);
    }
  }

  /// @inheritdoc ITreasury
  function redeem(
    uint256 _fTokenIn,
    uint256 _xTokenIn,
    address _owner
  ) external override onlyMarket returns (uint256 _baseOut) {
    StableCoinMath.SwapState memory _state = _loadSwapState();

    _baseOut = _state.redeem(_fTokenIn, _xTokenIn);

    if (_fTokenIn > 0) {
      IFractionalToken(fToken).burn(_owner, _fTokenIn);
    }

    if (_xTokenIn > 0) {
      ILeveragedToken(xToken).burn(_owner, _xTokenIn);
    }

    totalBaseToken = _state.baseSupply.sub(_baseOut);

    _transferBaseToken(_baseOut, msg.sender);
  }

  /// @inheritdoc ITreasury
  function addBaseToken(
    uint256 _baseIn,
    uint256 _incentiveRatio,
    address _recipient
  ) external override onlyMarket returns (uint256 _xTokenOut) {
    StableCoinMath.SwapState memory _state = _loadSwapState();

    uint256 _fDeltaNav;
    (_xTokenOut, _fDeltaNav) = _state.mintXToken(_baseIn, _incentiveRatio);

    totalBaseToken = _state.baseSupply + _baseIn;
    IFractionalToken(fToken).setNav(
      _state.fNav.sub(_fDeltaNav).mul(PRECISION).div(uint256(PRECISION_I256.add(_state.fMultiple)))
    );

    if (_xTokenOut > 0) {
      ILeveragedToken(xToken).mint(_recipient, _xTokenOut);
    }
  }

  /// @inheritdoc ITreasury
  function liquidate(
    uint256 _fTokenIn,
    uint256 _incentiveRatio,
    address _owner
  ) external override onlyMarket returns (uint256 _baseOut) {
    StableCoinMath.SwapState memory _state = _loadSwapState();

    uint256 _fDeltaNav;
    (_baseOut, _fDeltaNav) = _state.liquidateWithIncentive(_fTokenIn, _incentiveRatio);

    totalBaseToken = _state.baseSupply.sub(_baseOut);

    address _fToken = fToken;
    IFractionalToken(_fToken).burn(_owner, _fTokenIn);
    IFractionalToken(_fToken).setNav(
      _state.fNav.sub(_fDeltaNav).mul(PRECISION).div(uint256(PRECISION_I256.add(_state.fMultiple)))
    );

    if (_baseOut > 0) {
      _transferBaseToken(_baseOut, msg.sender);
    }
  }

  /// @inheritdoc ITreasury
  function selfLiquidate(
    uint256 _baseAmt,
    uint256 _incentiveRatio,
    address _recipient,
    bytes calldata _data
  ) external override onlyMarket returns (uint256 _baseOut, uint256 _fAmt) {
    // The supply are locked, so it is safe to use this memory variable.
    StableCoinMath.SwapState memory _state = _loadSwapState();

    _transferBaseToken(_baseAmt, msg.sender);
    _fAmt = IMarket(msg.sender).onSelfLiquidate(_baseAmt, _data);

    uint256 _fDeltaNav;
    (_baseOut, _fDeltaNav) = _state.liquidateWithIncentive(_fAmt, _incentiveRatio);
    require(_baseOut >= _baseAmt, "self liquidate with loss");

    address _fToken = fToken;
    IFractionalToken(_fToken).burn(address(this), _fAmt);
    totalBaseToken = _state.baseSupply.sub(_baseOut);

    IFractionalToken(_fToken).setNav(
      _state.fNav.sub(_fDeltaNav).mul(PRECISION).div(uint256(PRECISION_I256.add(_state.fMultiple)))
    );

    if (_baseOut > _baseAmt) {
      _transferBaseToken(_baseOut - _baseAmt, _recipient);
    }
  }

  /// @inheritdoc ITreasury
  function cacheTwap() external override {
    TwapCache memory _cache = twapCache;
    if (_cache.timestamp != block.timestamp) {
      _cache.price = uint128(ITwapOracle(priceOracle).getTwap(block.timestamp));
      _cache.timestamp = uint128(block.timestamp);

      twapCache = _cache;
    }
  }

  /// @inheritdoc ITreasury
  function protocolSettle() external override {
    require(settleWhitelist[msg.sender], "only settle whitelist");
    if (totalBaseToken == 0) return;

    uint256 _newPrice = _fetchTwapPrice();
    int256 _fMultiple = _computeMultiple(_newPrice);
    uint256 _fNav = IFractionalToken(fToken).updateNav(_fMultiple);

    emit ProtocolSettle(_newPrice, _fNav);

    lastPermissionedPrice = _newPrice;
  }

  /// @inheritdoc ITreasury
  function transferToStrategy(uint256 _amount) external override onlyStrategy {
    IERC20Upgradeable(baseToken).safeTransfer(strategy, _amount);
    strategyUnderlying += _amount;
  }

  /// @inheritdoc ITreasury
  /// @dev For future use.
  function notifyStrategyProfit(uint256 _amount) external override onlyStrategy {}

  /*******************************
   * Public Restricted Functions *
   *******************************/

  function initializePrice() external onlyOwner {
    require(lastPermissionedPrice == 0, "only initialize price once");
    uint256 _price = _fetchTwapPrice();

    lastPermissionedPrice = _price;

    IFractionalToken(fToken).setNav(PRECISION);

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

  /// @notice Update the whitelist status for settle account.
  /// @param _account The address of account to update.
  /// @param _status The status of the account to update.
  function updateSettleWhitelist(address _account, bool _status) external onlyOwner {
    settleWhitelist[_account] = _status;

    emit UpdateSettleWhitelist(_account, _status);
  }

  /**********************
   * Internal Functions *
   **********************/

  /// @dev Internal function to transfer base token to receiver.
  /// @param _amount The amount of base token to transfer.
  /// @param _recipient The address of receiver.
  function _transferBaseToken(uint256 _amount, address _recipient) internal {
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
  }

  /// @dev Internal function to load swap variable to memory
  function _loadSwapState() internal view returns (StableCoinMath.SwapState memory _state) {
    _state.baseSupply = totalBaseToken;
    _state.baseNav = _fetchTwapPrice();

    if (_state.baseSupply == 0) {
      _state.fNav = PRECISION;
      _state.xNav = PRECISION;
    } else {
      _state.fMultiple = _computeMultiple(_state.baseNav);
      address _fToken = fToken;
      _state.fSupply = IERC20Upgradeable(_fToken).totalSupply();
      _state.fNav = IFractionalToken(_fToken).getNav(_state.fMultiple);

      _state.xSupply = IERC20Upgradeable(xToken).totalSupply();
      if (_state.xSupply == 0) {
        // no xToken, treat the nav of xToken as 1.0
        _state.xNav = PRECISION;
      } else {
        _state.xNav = _state.baseSupply.mul(_state.baseNav).sub(_state.fSupply.mul(_state.fNav)).div(_state.xSupply);
      }
    }
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
  function _fetchTwapPrice() internal view returns (uint256 _price) {
    TwapCache memory _cache = twapCache;
    if (_cache.timestamp != block.timestamp) {
      _price = ITwapOracle(priceOracle).getTwap(block.timestamp);
    } else {
      _price = _cache.price;
    }

    require(_price > 0, "invalid twap price");
  }
}
