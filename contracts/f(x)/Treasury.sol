// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import { OwnableUpgradeable } from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import { SafeMathUpgradeable } from "@openzeppelin/contracts-upgradeable/math/SafeMathUpgradeable.sol";
import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import { SafeERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/SafeERC20Upgradeable.sol";

import { IPriceOracle } from "../price-oracle/interfaces/IPriceOracle.sol";
import { IAssetStrategy } from "./interfaces/IAssetStrategy.sol";
import { IElasticToken } from "./interfaces/IElasticToken.sol";
import { ITreasury } from "./interfaces/ITreasury.sol";

// solhint-disable no-empty-blocks

contract Treasury is OwnableUpgradeable, ITreasury {
  using SafeERC20Upgradeable for IERC20Upgradeable;
  using SafeMathUpgradeable for uint256;

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

  /// @notice The last updated base token price.
  uint256 public lastPrice;

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
    market = _market;
    baseToken = _baseToken;
    fToken = _fToken;
    xToken = _xToken;
    priceOracle = _priceOracle;
    beta = _beta;

    lastPrice = IPriceOracle(priceOracle).price(baseToken);
  }

  /*************************
   * Public View Functions *
   *************************/

  /// @notice Return the current collateral ratio.
  function collateralRatio() external view override returns (uint256) {
    address _fToken = fToken;
    uint256 _fVal = IERC20Upgradeable(_fToken).totalSupply().mul(IElasticToken(_fToken).nav());
    uint256 _totalVal = totalUnderlying.mul(lastPrice);

    if (_totalVal == 0) return PRECISION;

    return _totalVal.mul(PRECISION).div(_fVal);
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
    if (_totalUnderlying == 0) {
      require(_option == MintOption.Both, "first mint not both");
      lastPrice = IPriceOracle(priceOracle).price(baseToken);
    }

    address _fToken = fToken;
    address _xToken = xToken;
    uint256 _fNav = IElasticToken(_fToken).nav();
    uint256 _xNav = IElasticToken(_xToken).nav();
    uint256 _fVal = IERC20Upgradeable(_fToken).totalSupply().mul(_fNav);
    uint256 _xVal = IERC20Upgradeable(_xToken).totalSupply().mul(_xNav);

    if (_option == MintOption.FToken) {
      // (n + dn) * nav = (n_f + df) * nav_f + n_x * nav_x
      _fOut = _totalUnderlying.add(_amount).mul(lastPrice);
      _fOut = _fOut.sub(_fVal).sub(_xVal).div(_fNav);
    } else if (_option == MintOption.XToken) {
      // (n + dn) * nav = n_f * nav_f + (n_x + dx) * nav_x
      _xOut = _totalUnderlying.add(_amount).mul(lastPrice);
      _xOut = _xOut.sub(_fVal).sub(_xVal).div(_xNav);
    } else {
      uint256 _totalDeltaVal = _amount.mul(lastPrice);
      if (_totalUnderlying == 0) {
        _fOut = _totalDeltaVal.mul(initialMintRatio).div(PRECISION);
        _xOut = _totalDeltaVal.sub(_fOut);
      } else {
        // (n + dn) * nav = (n_f + df) * nav_f + (n_x + dx) * nav_x
        uint256 _totalVal = _totalUnderlying.mul(lastPrice);
        _fOut = _fVal.mul(_totalDeltaVal).div(_totalVal).div(_fNav);
        _xOut = _xVal.mul(_totalDeltaVal).div(_totalVal).div(_xNav);
      }
    }

    totalUnderlying = _totalUnderlying + _amount;

    if (_fOut > 0) {
      IElasticToken(_fToken).mint(_recipient, _fOut);
    }
    if (_xOut > 0) {
      IElasticToken(_xToken).mint(_recipient, _xOut);
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

    // (n - dn) * nav = (n_f - df) * nav_f + (n_x - dx) * nav_x
    uint256 _fVal = IERC20Upgradeable(_fToken).totalSupply().mul(IElasticToken(_fToken).nav());
    uint256 _xVal = IERC20Upgradeable(_xToken).totalSupply().mul(IElasticToken(_xToken).nav());

    uint256 _price = lastPrice;
    uint256 _totalUnderlying = totalUnderlying;
    _baseOut = _totalUnderlying.sub(_fVal.add(_xVal).div(_price));

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

    address _xToken = xToken;
    uint256 _xNav = IElasticToken(_xToken).nav();

    _xOut = _amount.mul(lastPrice).mul(PRECISION + _incentiveRatio).div(PRECISION).div(_xNav);

    totalUnderlying = totalUnderlying + _amount;

    if (_xOut > 0) {
      IElasticToken(_xToken).mint(_recipient, _xOut);
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

    address _fToken = fToken;
    uint256 _fSupply = IERC20Upgradeable(_fToken).totalSupply();
    uint256 _fNav = IElasticToken(_fToken).nav();

    IElasticToken(_fToken).burn(_owner, _fAmt);

    _baseOut = _fAmt.mul(_fNav).mul(PRECISION + _incentiveRatio).div(PRECISION).div(lastPrice);
    uint256 _fDeltaNav = _incentiveRatio.mul(_fAmt).mul(_fNav).div(_fSupply.sub(_fAmt));

    IElasticToken(_fToken).setNav(_fNav.sub(_fDeltaNav));

    if (_baseOut > 0) {
      _transferBaseToken(_baseOut, _recipient);
    }
  }

  /// @inheritdoc ITreasury
  function settle() external override {
    require(settleWhitelist[msg.sender], "only settle whitelist");
    if (totalUnderlying == 0) return;

    // rho = n_f * old_nav_f / (n * old_nav)
    // ratio = new_nav / old_nav - 1
    // new_nav_f = old_nav_f * (1 + beta * ratio)
    // new_nav_x = old_nav_x * (1 + (1 - rho * beta) / (1 - rho) * ratio)

    uint256 _lastPrice = lastPrice;
    uint256 _newPrice = IPriceOracle(priceOracle).price(baseToken);

    address _fToken = fToken;
    address _xToken = xToken;

    uint256 _rho;
    {
      uint256 _rhoNum = IElasticToken(_fToken).nav().mul(IERC20Upgradeable(_fToken).totalSupply());
      uint256 _rhoDen = _lastPrice.mul(totalUnderlying);
      _rho = _rhoDen.mul(PRECISION).sub(_rhoNum.mul(beta)).div(_rhoDen.sub(_rhoNum));
    }

    int256 _ratioNum = int256(_newPrice) - int256(_lastPrice);
    int256 _fMultiple = (int256(beta) * _ratioNum) / int256(_lastPrice);
    int256 _xMultiple = (int256(_rho) * _ratioNum) / int256(_lastPrice);

    uint256 _fNav = IElasticToken(_fToken).updateNav(_fMultiple);
    uint256 _xNav = IElasticToken(_xToken).updateNav(_xMultiple);
    emit Settle(_newPrice, _fNav, _xNav);

    lastPrice = _newPrice;
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
}
