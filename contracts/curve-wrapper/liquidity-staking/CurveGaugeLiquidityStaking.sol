// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import "@openzeppelin/contracts-upgradeable/proxy/Initializable.sol";

import "../interfaces/ICurveGaugeLiquidityStaking.sol";
import "../interfaces/ICurveLockerProxy.sol";
import "../../interfaces/ICurveGauge.sol";
import "../../interfaces/IERC20Metadata.sol";

import "./BaseLiquidityStaking.sol";
import "../../common/OptimizedERC20.sol";

contract CurveGaugeLiquidityStaking is
  Initializable,
  OptimizedERC20,
  BaseLiquidityStaking,
  ICurveGaugeLiquidityStaking
{
  using SafeERC20Upgradeable for IERC20Upgradeable;

  /**********
   * Events *
   **********/

  /// @notice Emitted when the gauge is enabled.
  event EnableGauge();

  /// @notice Emitted when gauge is migrated.
  /// @param _oldGauge The address of old gauge.
  /// @param _newGauge The address of new gauge.
  event MigrateGauge(address _oldGauge, address _newGauge);

  /*************
   * Constants *
   *************/

  /// @dev The address of CRV token.
  address private constant CRV = 0xD533a949740bb3306d119CC777fa900bA034cd52;

  /// @notice The address of CurveLockerProxy contract.
  address public immutable proxy;

  /*************
   * Variables *
   *************/

  /// @notice The address of curve gauge.
  address public gauge;

  /// @inheritdoc ICurveGaugeLiquidityStaking
  address public override stakingToken;

  /// @inheritdoc ICurveGaugeLiquidityStaking
  bool public override enabled;

  /***************
   * Constructor *
   ***************/

  constructor(address _proxy) {
    proxy = _proxy;
  }

  /// @inheritdoc ICurveGaugeLiquidityStaking
  function initialize(address _gauge) external override initializer {
    BaseLiquidityStaking._initialize();

    address _stakingToken = ICurveGauge(_gauge).staking_token();

    name = string(abi.encodePacked(IERC20Metadata(_stakingToken).name(), " Aladdin Stake"));
    symbol = string(abi.encodePacked("ald-", IERC20Metadata(_stakingToken).symbol()));

    booster = msg.sender;
    stakingToken = _stakingToken;
    gauge = _gauge;
  }

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @inheritdoc ILiquidityStaking
  function deposit(uint256 _amount, address _recipient) external override {
    address _stakingToken = stakingToken;

    if (_amount == uint256(-1)) {
      _amount = IERC20Upgradeable(_stakingToken).balanceOf(msg.sender);
    }
    require(_amount > 0, "deposit zero amount");

    _checkpoint(msg.sender);

    if (enabled) {
      IERC20Upgradeable(_stakingToken).safeTransferFrom(msg.sender, proxy, _amount);
      ICurveLockerProxy(proxy).deposit(gauge, _stakingToken, _amount);
    } else {
      IERC20Upgradeable(_stakingToken).safeTransferFrom(msg.sender, address(this), _amount);
    }

    _mint(_recipient, _amount);

    emit Deposit(msg.sender, _recipient, _amount);
  }

  /// @inheritdoc ILiquidityStaking
  function withdraw(
    uint256 _amount,
    address _recipient,
    bool _claimReward
  ) external override {
    if (_amount == uint256(-1)) {
      _amount = balanceOf[msg.sender];
    }
    require(_amount > 0, "withdraw zero amount");

    _checkpoint(msg.sender);

    _burn(msg.sender, _amount);

    address _stakingToken = stakingToken;
    if (enabled) {
      ICurveLockerProxy(proxy).withdraw(gauge, _stakingToken, _amount, _recipient);
    } else {
      IERC20Upgradeable(_stakingToken).safeTransfer(_recipient, _amount);
    }

    emit Withdraw(msg.sender, _recipient, _amount);

    if (_claimReward) {
      _claim(msg.sender, _recipient);
    }
  }

  /// @inheritdoc ICurveGaugeLiquidityStaking
  function enable() external override onlyBooster {
    bool _enabled = enabled;
    require(!_enabled, "already enabled");

    address _stakingToken = stakingToken;
    uint256 _balance = IERC20Upgradeable(_stakingToken).balanceOf(address(this));
    if (_balance > 0) {
      IERC20Upgradeable(_stakingToken).safeTransfer(proxy, _balance);
      ICurveLockerProxy(proxy).deposit(gauge, _stakingToken, _balance);
    }

    emit EnableGauge();

    enabled = true;
  }

  /// @inheritdoc ICurveGaugeLiquidityStaking
  function migrateGauge(address _newGauge) external override onlyBooster {
    address _stakingToken = ICurveGauge(_newGauge).staking_token();
    require(_stakingToken == stakingToken, "stake token mismatch");

    address _oldGauge = gauge;
    uint256 _balance = ICurveLockerProxy(proxy).balanceOf(_oldGauge);
    ICurveLockerProxy(proxy).withdraw(_oldGauge, _stakingToken, _balance, proxy);
    ICurveLockerProxy(proxy).deposit(_newGauge, _stakingToken, _balance);

    emit MigrateGauge(_oldGauge, _newGauge);

    gauge = _newGauge;
  }

  /// @inheritdoc ICurveGaugeLiquidityStaking
  function claimRewards(address[] memory _tokens)
    external
    override
    onlyBooster
    returns (uint256 _amountCRV, uint256[] memory _amounts)
  {
    address _booster = booster;
    address _gauge = gauge;

    _amountCRV = ICurveLockerProxy(proxy).claimCRV(_gauge, _booster);
    if (_tokens.length != 0) {
      _amounts = ICurveLockerProxy(proxy).claimGaugeRewards(_gauge, _tokens, _booster);
    }
  }

  /**********************
   * Internal Functions *
   **********************/

  /// @inheritdoc OptimizedERC20
  function _beforeTokenTransfer(
    address _from,
    address _to,
    uint256
  ) internal override {
    // no need to checkpoint when burn/mint.
    if (_from != address(0) && _to != address(0)) {
      _checkpoint(_from);

      if (_from != _to) _checkpoint(_to);
    }
  }

  /// @inheritdoc BaseLiquidityStaking
  function _rewardToken() internal pure override returns (address) {
    return CRV;
  }

  /// @inheritdoc BaseLiquidityStaking
  function _totalSupply() internal view override returns (uint256) {
    return totalSupply;
  }

  /// @inheritdoc BaseLiquidityStaking
  function _balanceOf(address _account) internal view override returns (uint256) {
    return balanceOf[_account];
  }
}
