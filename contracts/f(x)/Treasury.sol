// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

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

// solhint-disable no-empty-blocks
// solhint-disable not-rely-on-time

contract Treasury is OwnableUpgradeable, ITreasury {
  using SafeERC20Upgradeable for IERC20Upgradeable;
  using SafeMathUpgradeable for uint256;
  using SignedSafeMathUpgradeable for int256;

  /**********
   * Events *
   **********/

  /// @notice Emitted when the whitelist status for settle is changed.
  /// @param account The address of account to change.
  /// @param status The new whitelist status.
  event UpdateSettleWhitelist(address account, bool status);

  /// @notice Emitted when the price oracle contract is changed.
  /// @param priceOracle The address of new price oracle.
  event UpdatePriceOracle(address priceOracle);

  /// @notice Emitted when the strategy contract is changed.
  /// @param strategy The address of new strategy.
  event UpdateStrategy(address strategy);

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
  uint256 public override totalUnderlying;

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
    uint256 _newPrice = _fetchTwapPrice();

    address _fToken = fToken;
    uint256 _fNav = IFractionalToken(_fToken).getNav(_computeMultiple(_newPrice));
    uint256 _fSupply = IERC20Upgradeable(_fToken).totalSupply();

    uint256 _baseSupply = totalUnderlying;

    if (_baseSupply == 0) return PRECISION;
    if (_fSupply == 0 || _fNav == 0) return PRECISION * PRECISION;

    return _baseSupply.mul(_newPrice).mul(PRECISION).div(_fSupply.mul(_fNav));
  }

  /// @inheritdoc ITreasury
  /// @dev If the current collateral ratio <= new collateral ratio, we should return 0.
  function tryMintFTokenTo(uint256 _newCollateralRatio) external view override returns (uint256) {
    require(_newCollateralRatio > PRECISION, "collateral ratio too small");
    // n * v = n_f * v_f + n_x * v_x
    // (n + dn) * v = (n_f + df) * v_f + n_x * v_x
    // (n + dn) * v / ((n_f + df) * v_f) = ncr
    // => n * v - ncr * n_f * v_f = (ncr - 1) * dn * v
    // => dn = (n * v - ncr * n_f * v_f) / ((ncr - 1) * v)

    uint256 _newPrice = _fetchTwapPrice();
    address _fToken = fToken;
    uint256 _fNav = IFractionalToken(_fToken).getNav(_computeMultiple(_newPrice));
    uint256 _fSupply = IERC20Upgradeable(_fToken).totalSupply();

    uint256 _baseVal = totalUnderlying.mul(_newPrice).mul(PRECISION);
    uint256 _fVal = _newCollateralRatio.mul(_fSupply).mul(_fNav);

    if (_baseVal <= _fVal) return 0;
    else {
      return (_baseVal - _fVal).div(_newPrice.mul(_newCollateralRatio - PRECISION));
    }
  }

  /// @inheritdoc ITreasury
  /// @dev If the current collateral ratio >= new collateral ratio, we should return 0.
  function tryMintXTokenTo(uint256 _newCollateralRatio) external view override returns (uint256) {
    require(_newCollateralRatio > PRECISION, "collateral ratio too small");
    // n * v = n_f * v_f + n_x * v_x
    // (n + dn) * v = n_f * v_f + (n_x + dx) * v_x
    // (n + dn) * v / (n_f * v_f) = ncr
    // => dn = ncr * n_f * v_f / v - n

    uint256 _newPrice = _fetchTwapPrice();
    address _fToken = fToken;
    uint256 _fNav = IFractionalToken(_fToken).getNav(_computeMultiple(_newPrice));
    uint256 _fSupply = IERC20Upgradeable(_fToken).totalSupply();

    uint256 _baseSupply = totalUnderlying;
    uint256 _dn = _newCollateralRatio.mul(_fSupply).mul(_fNav).div(_newPrice * PRECISION);

    if (_dn >= _baseSupply) return _dn - _baseSupply;
    else return 0;
  }

  /// @inheritdoc ITreasury
  /// @dev If the current collateral ratio >= new collateral ratio, we should return 0.
  function tryRedeemFTokenTo(uint256 _newCollateralRatio) external view override returns (uint256) {
    require(_newCollateralRatio > PRECISION, "collateral ratio too small");
    // n * v = n_f * v_f + n_x * v_x
    // (n - dn) * v = (n_f - df) * v_f + n_x * v_x
    // (n - dn) * v / ((n_f - df) * v_f) = ncr
    // => df = (ncr * n_f * v_f - n * v) / ((ncr - 1) * v_f)

    uint256 _newPrice = _fetchTwapPrice();
    address _fToken = fToken;
    uint256 _fNav = IFractionalToken(_fToken).getNav(_computeMultiple(_newPrice));
    uint256 _fSupply = IERC20Upgradeable(_fToken).totalSupply();

    uint256 _baseVal = totalUnderlying.mul(_newPrice).mul(PRECISION);
    uint256 _fVal = _newCollateralRatio.mul(_fSupply).mul(_fNav);

    if (_fVal <= _baseVal) return 0;
    else {
      return (_fVal - _baseVal).div((_newCollateralRatio - PRECISION).mul(_fNav));
    }
  }

  /// @inheritdoc ITreasury
  /// @dev If the current collateral ratio <= new collateral ratio, we should return 0.
  function tryRedeemXTokenTo(uint256 _newCollateralRatio) external view override returns (uint256) {
    require(_newCollateralRatio > PRECISION, "collateral ratio too small");
    // n * v = n_f * v_f + n_x * v_x
    // (n - dn) * v = n_f * v_f + (n_x - dx) * v_x
    // (n - dn) * v / (n_f * v_f) = ncr
    // => dx = n_x * (n * v - ncr * n_f * v_f) / (n * v - n_f * v_f)

    uint256 _newPrice = _fetchTwapPrice();
    address _fToken = fToken;
    uint256 _fNav = IFractionalToken(_fToken).getNav(_computeMultiple(_newPrice));
    uint256 _fSupply = IERC20Upgradeable(_fToken).totalSupply();
    uint256 _xSupply = IERC20Upgradeable(xToken).totalSupply();

    uint256 _baseVal = totalUnderlying.mul(_newPrice).mul(PRECISION);
    uint256 _fVal = _newCollateralRatio.mul(_fSupply).mul(_fNav);

    if (_baseVal <= _fVal) return 0;
    else {
      return _xSupply.mul((_baseVal - _fVal).div(PRECISION)).div(_baseVal.div(PRECISION).sub(_fSupply.mul(_fNav)));
    }
  }

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @inheritdoc ITreasury
  function mint(
    uint256 _amount,
    address _recipient,
    MintOption _option
  ) external override onlyMarket returns (uint256 _fOut, uint256 _xOut) {
    uint256 _baseSupply = totalUnderlying;

    uint256 _newPrice = _fetchTwapPrice();
    address _fToken = fToken;
    uint256 _fNav = IFractionalToken(_fToken).getNav(_computeMultiple(_newPrice));
    uint256 _fSupply = IERC20Upgradeable(fToken).totalSupply();
    uint256 _xSupply = IERC20Upgradeable(xToken).totalSupply();

    if (_option == MintOption.FToken) {
      // n * v = n_f * v_f + n_x * v_x
      // (n + dn) * v = (n_f + df) * v_f + n_x * v_x
      // => df = dn * v / v_f
      _fOut = _amount.mul(_newPrice).div(_fNav);
    } else if (_option == MintOption.XToken) {
      // n * v = n_f * v_f + n_x * v_x
      // (n + dn) * v = n_f * v_f + (n_x + dx) * v_x
      // => dx = (dn * v * n_x) / (n * v - n_f * v_f)
      _xOut = _amount.mul(_newPrice).mul(_xSupply);
      _xOut = _xOut.div(_baseSupply.mul(_newPrice).sub(_fSupply.mul(_fNav)));
    } else {
      if (_baseSupply == 0) {
        uint256 _totalDeltaVal = _amount.mul(_newPrice);
        _fOut = _totalDeltaVal.mul(initialMintRatio).div(PRECISION);
        _xOut = _totalDeltaVal.sub(_fOut);
      } else {
        // n * v = n_f * v_f + n_x * v_x
        // (n + dn) * v = (n_f + df) * v_f + (n_x + dx) * v_x
        // => df = n_f * dn / n, dx = n_x * dn / n
        _fOut = _fSupply.mul(_amount).div(_baseSupply);
        _xOut = _xSupply.mul(_amount).div(_baseSupply);
      }
    }

    totalUnderlying = _baseSupply + _amount;

    if (_fOut > 0) {
      IFractionalToken(fToken).mint(_recipient, _fOut);
    }
    if (_xOut > 0) {
      ILeveragedToken(xToken).mint(_recipient, _xOut);
    }
  }

  /// @inheritdoc ITreasury
  function redeem(
    uint256 _fAmt,
    uint256 _xAmt,
    address _owner
  ) external override onlyMarket returns (uint256 _baseOut) {
    address _fToken = fToken;
    address _xToken = xToken;

    uint256 _newPrice = _fetchTwapPrice();
    uint256 _fSupply = IERC20Upgradeable(_fToken).totalSupply();
    uint256 _fNav = IFractionalToken(_fToken).getNav(_computeMultiple(_newPrice));
    uint256 _xSupply = IERC20Upgradeable(_xToken).totalSupply();
    uint256 _baseSupply = totalUnderlying;
    uint256 _xVal = totalUnderlying.mul(_newPrice).sub(_fSupply.mul(_fNav));

    if (_fAmt > 0) {
      IFractionalToken(_fToken).burn(_owner, _fAmt);
    }
    if (_xAmt > 0) {
      ILeveragedToken(xToken).burn(_owner, _xAmt);
    }

    // n * v = n_f * v_f + n_x * v_x
    // (n - dn) * v = (n_f - df) * v_f + (n_x - dx) * v_x
    // => dn = (df * v_f + dx * (n * v - n_f * v_f) / n_x) / v

    if (_xSupply == 0) {
      _baseOut = _fAmt.mul(_fNav).div(_newPrice);
    } else {
      _baseOut = _fAmt.mul(_fNav);
      _baseOut = _baseOut.add(_xAmt.mul(_xVal).div(_xSupply));
      _baseOut = _baseOut.div(_newPrice);
    }

    totalUnderlying = _baseSupply - _baseOut;

    _transferBaseToken(_baseOut, msg.sender);
  }

  /// @inheritdoc ITreasury
  function addBaseToken(
    uint256 _amount,
    uint256 _incentiveRatio,
    address _recipient
  ) external override onlyMarket returns (uint256 _xOut) {
    // 1. n * v = n_f * v_f + n_x * v_x
    // 2. (n + dn) * v = n_f * (v_f - d_v_f) + (n_x + dx) * v_x
    // =>
    //  dn * v = dx * v_x - n_f * d_v_f
    //  n_f * d_v_f = lambda * dn * v
    // =>
    //  dx * v_x = (1 + lambda) * dn * v
    //  d_v_f = lambda * dn * v / n_f

    address _fToken = fToken;
    address _xToken = xToken;

    uint256 _newPrice = _fetchTwapPrice();
    uint256 _baseSupply = totalUnderlying;
    uint256 _fSupply = IERC20Upgradeable(_fToken).totalSupply();
    int256 _fMultiple = _computeMultiple(_newPrice);
    uint256 _fNav = IFractionalToken(_fToken).getNav(_fMultiple);

    uint256 _xNav;
    {
      uint256 _xSupply = IERC20Upgradeable(_xToken).totalSupply();
      _xNav = _baseSupply.mul(_newPrice).sub(_fSupply.mul(_fNav)).div(_xSupply);
    }

    _xOut = _amount.mul(_newPrice);
    _xOut = _xOut.mul(PRECISION + _incentiveRatio);
    _xOut = _xOut.div(PRECISION);
    _xOut = _xOut.div(_xNav);

    uint256 _fDeltaNav = _incentiveRatio.mul(_amount);
    _fDeltaNav = _fDeltaNav.mul(_newPrice);
    _fDeltaNav = _fDeltaNav.div(_fSupply);
    _fDeltaNav = _fDeltaNav.div(PRECISION);

    totalUnderlying = _baseSupply + _amount;

    IFractionalToken(_fToken).setNav(_fNav.sub(_fDeltaNav).mul(PRECISION).div(uint256(PRECISION_I256.add(_fMultiple))));

    if (_xOut > 0) {
      ILeveragedToken(_xToken).mint(_recipient, _xOut);
    }
  }

  /// @inheritdoc ITreasury
  function liquidate(
    uint256 _fAmt,
    uint256 _incentiveRatio,
    address _owner,
    address _recipient
  ) external override onlyMarket returns (uint256 _baseOut) {
    // 1. n * v = n_f * v_f + n_x * v_x
    // 2. (n - dn) * v = (n_f - df) * (v_f - d_v_f) + n_x * v_x
    // =>
    //  dn * v = n_f * d_v_f + df * (v_f - d_v_f)
    //  dn * v = df * v_f * (1 + lambda)
    // =>
    //  dn = df * v_f * (1 + lambda) / v
    //  d_v_f = lambda * (df * v_f) / (n_f - df)

    address _fToken = fToken;
    uint256 _newPrice = _fetchTwapPrice();
    uint256 _baseSupply = totalUnderlying;
    uint256 _fSupply = IERC20Upgradeable(_fToken).totalSupply();
    int256 _fMultiple = _computeMultiple(_newPrice);
    uint256 _fNav = IFractionalToken(_fToken).getNav(_fMultiple);

    _baseOut = _fAmt.mul(_fNav);
    _baseOut = _baseOut.mul(PRECISION + _incentiveRatio);
    _baseOut = _baseOut.div(PRECISION);
    _baseOut = _baseOut.div(_newPrice);

    uint256 _fDeltaNav = _incentiveRatio.mul(_fAmt);
    _fDeltaNav = _fDeltaNav.mul(_fNav);
    _fDeltaNav = _fDeltaNav.div(_fSupply.sub(_fAmt));

    IFractionalToken(_fToken).burn(_owner, _fAmt);
    totalUnderlying = _baseSupply.sub(_baseOut);

    IFractionalToken(_fToken).setNav(_fNav.sub(_fDeltaNav).mul(PRECISION).div(uint256(PRECISION_I256.add(_fMultiple))));

    if (_baseOut > 0) {
      _transferBaseToken(_baseOut, _recipient);
    }
  }

  /// @inheritdoc ITreasury
  function selfLiquidate(
    uint256 _baseAmt,
    uint256 _incentiveRatio,
    address _recipient,
    bytes calldata _data
  ) external override onlyMarket returns (uint256 _baseOut, uint256 _fAmt) {
    uint256 _baseSupply = totalUnderlying;

    IERC20Upgradeable(baseToken).safeTransfer(msg.sender, _baseAmt);
    _fAmt = IMarket(msg.sender).onSelfLiquidate(_baseAmt, _data);

    address _fToken = fToken;
    uint256 _newPrice = _fetchTwapPrice();
    uint256 _fSupply = IERC20Upgradeable(_fToken).totalSupply();
    int256 _fMultiple = _computeMultiple(_newPrice);
    uint256 _fNav = IFractionalToken(_fToken).getNav(_fMultiple);

    _baseOut = _fAmt.mul(_fNav);
    _baseOut = _baseOut.mul(PRECISION + _incentiveRatio);
    _baseOut = _baseOut.div(PRECISION);
    _baseOut = _baseOut.div(_newPrice);

    require(_baseOut >= _baseAmt, "self liquidate with loss");

    uint256 _fDeltaNav = _incentiveRatio.mul(_fAmt);
    _fDeltaNav = _fDeltaNav.mul(_fNav);
    _fDeltaNav = _fDeltaNav.div(_fSupply.sub(_fAmt));

    IFractionalToken(_fToken).burn(address(this), _fAmt);
    totalUnderlying = _baseSupply.sub(_baseOut);

    IFractionalToken(_fToken).setNav(_fNav.sub(_fDeltaNav).mul(PRECISION).div(uint256(PRECISION_I256.add(_fMultiple))));

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
    if (totalUnderlying == 0) return;

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

    emit ProtocolSettle(_price, PRECISION);
  }

  /// @notice Change address of strategy contract.
  /// @param _strategy The new address of strategy contract.
  function updateStrategy(address _strategy) external onlyOwner {
    strategy = _strategy;
  }

  /// @notice Change the value of fToken beta.
  /// @param _beta The new value of beta.
  function updateBeta(uint256 _beta) external onlyOwner {
    beta = _beta;
  }

  /// @notice Change address of price oracle contract.
  /// @param _priceOracle The new address of price oracle contract.
  function updatePriceOracle(address _priceOracle) external onlyOwner {
    priceOracle = _priceOracle;
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

      _balance = IERC20Upgradeable(_baseToken).balanceOf(address(this));
      if (_amount > _balance) {
        _balance = _balance;
      }
    }

    IERC20Upgradeable(_baseToken).safeTransfer(_recipient, _amount);
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
