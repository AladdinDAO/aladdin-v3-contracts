// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import { OwnableUpgradeable } from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import { SafeMathUpgradeable } from "@openzeppelin/contracts-upgradeable/math/SafeMathUpgradeable.sol";
import { SignedSafeMathUpgradeable } from "@openzeppelin/contracts-upgradeable/math/SignedSafeMathUpgradeable.sol";
import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import { SafeERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/SafeERC20Upgradeable.sol";

import { ITwapOracle } from "../price-oracle/interfaces/ITwapOracle.sol";
import { IAssetStrategy } from "./interfaces/IAssetStrategy.sol";
import { IElasticToken } from "./interfaces/IElasticToken.sol";
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

  /// @notice The last updated permissioned base token price.
  uint256 public lastPermissionedPrice;

  /// @notice The last intermediate base token price.
  uint256 public lastIntermediatePrice;

  /// @notice The last intermediate nav of fToken.
  uint256 public lastIntermediateFTokenNav;

  /// @notice The last intermediate nav of xToken.
  uint256 public lastIntermediateXTokenNav;

  /// @inheritdoc ITreasury
  uint256 public override totalUnderlying;

  /// @inheritdoc ITreasury
  address public override strategy;

  /// @inheritdoc ITreasury
  uint256 public override strategyUnderlying;

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
    uint256 _newPrice = ITwapOracle(priceOracle).getTwap(block.timestamp);

    uint256 _fVal = IERC20Upgradeable(fToken).totalSupply().mul(lastIntermediateFTokenNav);
    uint256 _totalVal = totalUnderlying.mul(_newPrice);

    if (_totalVal == 0) return PRECISION;
    if (_fVal == 0) return PRECISION * PRECISION;

    return _totalVal.mul(PRECISION).div(_fVal);
  }

  /// @inheritdoc ITreasury
  /// @dev If the current collateral ratio <= new collateral ratio, we should return 0.
  function tryMintFTokenTo(uint256 _newCollateralRatio) external view override returns (uint256) {
    require(_newCollateralRatio > PRECISION, "collateral ratio too small");
    // (n + dn) * nav = (n_f + df) * nav_f + n_x * nav_x
    // (n + dn) * nav / ((n_f + df) * nav_f) = ncr
    // => dn = ncr * n_x * nav_x / (nav * (ncr - 1)) - n

    uint256 _newPrice = ITwapOracle(priceOracle).getTwap(block.timestamp);
    uint256 _xVal = IERC20Upgradeable(xToken).totalSupply().mul(lastIntermediateXTokenNav);
    uint256 _totalUnderlying = totalUnderlying;
    uint256 _dn = _newCollateralRatio.mul(_xVal).div(_newPrice.mul(_newCollateralRatio - PRECISION));

    if (_dn >= _totalUnderlying) return _dn - _totalUnderlying;
    else return 0;
  }

  /// @inheritdoc ITreasury
  /// @dev If the current collateral ratio >= new collateral ratio, we should return 0.
  function tryMintXTokenTo(uint256 _newCollateralRatio) external view override returns (uint256) {
    require(_newCollateralRatio > PRECISION, "collateral ratio too small");
    // (n + dn) * nav = n_f * nav_f + (n_x + dx) * nav_x
    // (n + dn) * nav / (n_f * nav_f) = ncr
    // => dn = ncr * n_f * nav_f / nav - n

    uint256 _newPrice = ITwapOracle(priceOracle).getTwap(block.timestamp);
    uint256 _fVal = IERC20Upgradeable(fToken).totalSupply().mul(lastIntermediateFTokenNav);
    uint256 _totalUnderlying = totalUnderlying;
    uint256 _dn = _newCollateralRatio.mul(_fVal).div(_newPrice * PRECISION);

    if (_dn >= _totalUnderlying) return _dn - _totalUnderlying;
    else return 0;
  }

  /// @inheritdoc ITreasury
  /// @dev If the current collateral ratio >= new collateral ratio, we should return 0.
  function tryRedeemFTokenTo(uint256 _newCollateralRatio) external view override returns (uint256) {
    require(_newCollateralRatio > PRECISION, "collateral ratio too small");
    // (n - dn) * nav = (n_f - df) * nav_f + n_x * nav_x
    // (n - dn) * nav / ((n_f - df) * nav_f) = ncr
    // => df = n_f - n_x * nav_x / ((ncr - 1) * nav_f)

    uint256 _xVal = IERC20Upgradeable(xToken).totalSupply().mul(lastIntermediateXTokenNav);
    uint256 _fSupply = IERC20Upgradeable(fToken).totalSupply();

    uint256 _df = _xVal.mul(PRECISION).div(lastIntermediateFTokenNav.mul(_newCollateralRatio - PRECISION));

    if (_fSupply >= _df) return _fSupply - _df;
    else return 0;
  }

  /// @inheritdoc ITreasury
  /// @dev If the current collateral ratio <= new collateral ratio, we should return 0.
  function tryRedeemXTokenTo(uint256 _newCollateralRatio) external view override returns (uint256) {
    require(_newCollateralRatio > PRECISION, "collateral ratio too small");
    // (n - dn) * nav = n_f * nav_f + (n_x - dx) * nav_x
    // (n - dn) * nav / (n_f * nav_f) = ncr
    // => df = n_x - (ncr - 1) * n_f * nav_f / nav_x

    uint256 _fVal = IERC20Upgradeable(fToken).totalSupply().mul(lastIntermediateFTokenNav);
    uint256 _xSupply = IERC20Upgradeable(xToken).totalSupply();

    uint256 _dx = (_newCollateralRatio - PRECISION).mul(_fVal).div(lastIntermediateXTokenNav.mul(PRECISION));

    if (_xSupply >= _dx) return _xSupply - _dx;
    else return 0;
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
    uint256 _totalUnderlying = totalUnderlying;

    uint256 _newPrice = ITwapOracle(priceOracle).getTwap(block.timestamp);
    uint256 _fNav = lastIntermediateFTokenNav;
    uint256 _xNav = lastIntermediateXTokenNav;
    uint256 _fVal = IERC20Upgradeable(fToken).totalSupply().mul(_fNav);
    uint256 _xVal = IERC20Upgradeable(xToken).totalSupply().mul(_xNav);

    if (_option == MintOption.FToken) {
      // (n + dn) * nav = (n_f + df) * nav_f + n_x * nav_x
      _fOut = _totalUnderlying.add(_amount).mul(_newPrice);
      _fOut = _fOut.sub(_fVal).sub(_xVal).div(_fNav);
    } else if (_option == MintOption.XToken) {
      // (n + dn) * nav = n_f * nav_f + (n_x + dx) * nav_x
      _xOut = _totalUnderlying.add(_amount).mul(_newPrice);
      _xOut = _xOut.sub(_fVal).sub(_xVal).div(_xNav);
    } else {
      uint256 _totalDeltaVal;
      if (_totalUnderlying == 0) {
        _totalDeltaVal = _amount.mul(lastIntermediatePrice);
        _fOut = _totalDeltaVal.mul(initialMintRatio).div(PRECISION);
        _xOut = _totalDeltaVal.sub(_fOut);
      } else {
        _totalDeltaVal = _amount.mul(_newPrice);
        // (n + dn) * nav = (n_f + df) * nav_f + (n_x + dx) * nav_x
        uint256 _totalVal = _totalUnderlying.mul(_newPrice);
        _fOut = _fVal.mul(_totalDeltaVal).div(_totalVal).div(_fNav);
        _xOut = _xVal.mul(_totalDeltaVal).div(_totalVal).div(_xNav);
      }
    }

    totalUnderlying = _totalUnderlying + _amount;

    if (_fOut > 0) {
      IElasticToken(fToken).mint(_recipient, _fOut);
    }
    if (_xOut > 0) {
      IElasticToken(xToken).mint(_recipient, _xOut);
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

    if (_fAmt > 0) {
      IElasticToken(_fToken).burn(_owner, _fAmt);
    }
    if (_xAmt > 0) {
      IElasticToken(xToken).burn(_owner, _xAmt);
    }

    uint256 _newPrice = ITwapOracle(priceOracle).getTwap(block.timestamp);
    uint256 _fNav = lastIntermediateFTokenNav;
    uint256 _xNav = lastIntermediateXTokenNav;

    // (n - dn) * nav = (n_f - df) * nav_f + (n_x - dx) * nav_x
    uint256 _fVal = IERC20Upgradeable(_fToken).totalSupply().mul(_fNav);
    uint256 _xVal = IERC20Upgradeable(_xToken).totalSupply().mul(_xNav);

    uint256 _totalUnderlying = totalUnderlying;
    _baseOut = _totalUnderlying.sub(_fVal.add(_xVal).div(_newPrice));

    totalUnderlying = _totalUnderlying - _baseOut;

    _transferBaseToken(_baseOut, msg.sender);
  }

  /// @inheritdoc ITreasury
  function addBaseToken(
    uint256 _amount,
    uint256 _incentiveRatio,
    address _recipient
  ) external override onlyMarket returns (uint256 _xOut) {
    // 1. n * nav = n_f * nav_f + n_x * nav_x
    // 2. (n + dn) * nav = n_f * (nav_f - d_nav_f) + (n_x + dx) * nav_x
    // =>
    //  dn * nav = dx * nav_x - n_f * d_nav_f
    //  n_f * d_nav_f = lambda * dn * nav
    // =>
    //  dx * nav_x = (1 + lambda) * dn * nav

    uint256 _newPrice = ITwapOracle(priceOracle).getTwap(block.timestamp);
    uint256 _xNav = lastIntermediateXTokenNav;

    _xOut = _amount.mul(_newPrice).mul(PRECISION + _incentiveRatio).div(PRECISION).div(_xNav);

    totalUnderlying = totalUnderlying + _amount;

    if (_xOut > 0) {
      IElasticToken(xToken).mint(_recipient, _xOut);
    }
  }

  /// @inheritdoc ITreasury
  function liquidate(
    uint256 _fAmt,
    uint256 _incentiveRatio,
    address _owner,
    address _recipient
  ) external override onlyMarket returns (uint256 _baseOut) {
    // 1. n * nav = n_f * nav_f + n_x * nav_x
    // 2. (n - dn) * nav = (n_f - df) * (nav_f - d_nav_f) + n_x * nav_x
    // =>
    //  dn * nav = n_f * d_nav_f + df * (nav_f - d_nav_f)
    //  dn * nav = df * nav_f * (1 + lambda)
    // =>
    //  dn = df * nav_f * (1 + lambda) / nav
    //  d_nav_f = lambda * (df * nav_f) / (n_f - df)

    uint256 _fSupply = IERC20Upgradeable(fToken).totalSupply();
    uint256 _newPrice = ITwapOracle(priceOracle).getTwap(block.timestamp);
    uint256 _fNav = lastIntermediateFTokenNav;

    _baseOut = _fAmt.mul(_fNav).mul(PRECISION + _incentiveRatio).div(PRECISION).div(_newPrice);
    uint256 _fDeltaNav = _incentiveRatio.mul(_fAmt).mul(_fNav).div(_fSupply.sub(_fAmt));

    IElasticToken(fToken).burn(_owner, _fAmt);

    // @note be careful that the nav and price is updated.
    IElasticToken(fToken).setNav(_fNav.sub(_fDeltaNav));
    lastIntermediatePrice = _newPrice;

    if (_baseOut > 0) {
      _transferBaseToken(_baseOut, _recipient);
    }
  }

  /// @inheritdoc ITreasury
  function marketSettle() public override onlyMarket {
    uint256 _newPrice = ITwapOracle(priceOracle).getTwap(block.timestamp);
    require(_newPrice > 0, "zero price");

    (int256 _fMultiple, int256 _xMultiple) = _computeMultiple(_newPrice);

    uint256 _fNav = IElasticToken(fToken).getNav(_fMultiple);
    uint256 _xNav = IElasticToken(xToken).getNav(_xMultiple);

    emit MarketSettle(_newPrice, _fNav, _xNav);

    lastIntermediateFTokenNav = _fNav;
    lastIntermediateXTokenNav = _xNav;
    lastIntermediatePrice = _newPrice;
  }

  /// @inheritdoc ITreasury
  function protocolSettle() external override {
    require(settleWhitelist[msg.sender], "only settle whitelist");
    if (totalUnderlying == 0) return;

    uint256 _newPrice = ITwapOracle(priceOracle).getTwap(block.timestamp);
    (int256 _fMultiple, int256 _xMultiple) = _computeMultiple(_newPrice);

    uint256 _fNav = IElasticToken(fToken).updateNav(_fMultiple);
    uint256 _xNav = IElasticToken(xToken).updateNav(_xMultiple);

    emit ProtocolSettle(_newPrice, _fNav, _xNav);

    lastIntermediateFTokenNav = _fNav;
    lastIntermediateXTokenNav = _xNav;
    lastIntermediatePrice = _newPrice;
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
    uint256 _price = ITwapOracle(priceOracle).getTwap(block.timestamp);

    lastPermissionedPrice = _price;
    lastIntermediatePrice = _price;

    lastIntermediateFTokenNav = PRECISION;
    lastIntermediateXTokenNav = PRECISION;

    emit ProtocolSettle(_price, PRECISION, PRECISION);
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
  ///         lastIntermediateFTokenNav * fSupply
  /// rho = ---------------------------------------
  ///       lastIntermediatePrice * totalUnderlying
  ///
  /// lastIntermediateFTokenNav = (1 + beta * ratio) * lastFTokenNav
  ///
  ///                              /    1 - rho * beta           1 + ratio     lastPermissionedPrice      \
  /// lastIntermediateXTokenNav = | 1 + -------------- * ratio + --------- * ( --------------------- - 1 ) | * lastXTokenNav
  ///                              \       1 - rho                1 - rho      lastIntermediatePrice      /
  ///
  /// @param _newPrice The current price of base token.
  /// @return _fMultiple The multiple for fToken.
  /// @return _xMultiple The multiple for xToken.
  function _computeMultiple(uint256 _newPrice) internal view returns (int256 _fMultiple, int256 _xMultiple) {
    uint256 _lastPermissionedPrice = lastPermissionedPrice;
    uint256 _lastIntermediatePrice = lastIntermediatePrice;

    int256 rho;
    {
      // solhint-disable-next-line var-name-mixedcase
      uint256 rho_d = IERC20Upgradeable(fToken).totalSupply().mul(lastIntermediateFTokenNav);
      // solhint-disable-next-line var-name-mixedcase
      uint256 rho_n = totalUnderlying.mul(_lastIntermediatePrice);
      rho = int256(rho_d.mul(PRECISION).div(rho_n));
    }

    int256 ratio = int256(_newPrice).sub(int256(_lastPermissionedPrice)).mul(PRECISION_I256).div(
      int256(_lastPermissionedPrice)
    );
    int256 _beta = int256(beta);

    _fMultiple = ratio.mul(_beta).div(PRECISION_I256);

    _xMultiple = (PRECISION_I256 * PRECISION_I256).sub(rho * _beta).div(PRECISION_I256.sub(rho)).mul(ratio).div(
      PRECISION_I256
    );
    _xMultiple = _xMultiple.add(
      (PRECISION_I256 + ratio)
        .mul(int256(_lastPermissionedPrice) - int256(_lastIntermediatePrice))
        .mul(PRECISION_I256)
        .div(PRECISION_I256 - rho)
        .div(int256(_lastIntermediatePrice))
    );
  }
}
