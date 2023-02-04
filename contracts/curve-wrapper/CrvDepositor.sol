// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

import "./interfaces/ICrvDepositor.sol";
import "./interfaces/ICurveLockerProxy.sol";
import "./interfaces/ILiquidityStaking.sol";

import "./CLeverVeCRV.sol";

// solhint-disable not-rely-on-time

contract CrvDepositor is ICrvDepositor {
  using SafeERC20 for IERC20;
  using SafeMath for uint256;

  /*************
   * Constants *
   *************/

  /// @dev The address of CRV token.
  address private constant CRV = 0xD533a949740bb3306d119CC777fa900bA034cd52;

  /// @dev The maximum time to lock CRV.
  uint256 private constant MAXTIME = 4 * 365 * 86400;

  /// @dev The number of seconds in one week.
  uint256 private constant WEEK = 7 * 86400;

  /// @notice The address of CurveLockerProxy contract.
  address public immutable proxy;

  /// @notice The address of cveCRV token.
  address public immutable cveCRV;

  /*************
   * Variables *
   *************/

  /// @notice The current unlock timestamp for CRV in CurveLockerProxy contract.
  uint256 public unlockTime;

  /***************
   * Constructor *
   ***************/

  constructor(address _proxy, address _cveCRV) {
    proxy = _proxy;
    cveCRV = _cveCRV;
  }

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @notice Initialize veCRV lock.
  function initialize() external {
    if (unlockTime == 0) {
      uint256 _unlockAt = block.timestamp + MAXTIME;
      uint256 _unlockInWeeks = (_unlockAt / WEEK) * WEEK;

      //create new lock
      uint256 crvBalanceStaker = IERC20(CRV).balanceOf(proxy);
      ICurveLockerProxy(proxy).createLock(crvBalanceStaker, _unlockAt);
      unlockTime = _unlockInWeeks;

      // mint initial token
      CLeverVeCRV(cveCRV).mint(msg.sender, crvBalanceStaker);
    }
  }

  /// @inheritdoc ICrvDepositor
  function deposit(
    uint256 _amount,
    address _recipient,
    address _staking
  ) public override {
    if (_amount == uint256(-1)) {
      _amount = IERC20(CRV).balanceOf(msg.sender);
    }
    require(_amount > 0, "deposit zero amount");

    IERC20(CRV).safeTransferFrom(msg.sender, proxy, _amount);
    _lockCurve();

    if (_staking == address(0)) {
      CLeverVeCRV(cveCRV).mint(_recipient, _amount);
    } else {
      CLeverVeCRV(cveCRV).mint(address(this), _amount);

      IERC20(cveCRV).safeApprove(_staking, 0);
      IERC20(cveCRV).safeApprove(_staking, _amount);
      ILiquidityStaking(_staking).deposit(_amount, _recipient);
    }

    emit Deposit(msg.sender, _recipient, _amount);
  }

  /// @inheritdoc ICrvDepositor
  function deposit(uint256 _amount, address _recipient) external override {
    deposit(_amount, _recipient, address(0));
  }

  /// @notice Lock additional CRV or increase lock time.
  function lockCurve() external {
    _lockCurve();
  }

  /**********************
   * Internal Functions *
   **********************/

  /// @dev Internal function to lock CRV as veCRV.
  function _lockCurve() internal {
    // transfer pool CRV to proxy.
    uint256 _balance = IERC20(CRV).balanceOf(address(this));
    if (_balance > 0) {
      IERC20(CRV).safeTransfer(proxy, _balance);
    }

    // increase ammount if there are some CRV in proxy.
    _balance = IERC20(CRV).balanceOf(proxy);
    if (_balance > 0) {
      ICurveLockerProxy(proxy).increaseAmount(_balance);
    }

    //increase time if over 2 week buffer
    uint256 _unlockAt = block.timestamp + MAXTIME;
    uint256 _unlockInWeeks = (_unlockAt / WEEK) * WEEK;
    if (_unlockInWeeks.sub(unlockTime) > 2 * WEEK) {
      ICurveLockerProxy(proxy).increaseTime(_unlockInWeeks);
      unlockTime = _unlockInWeeks;
    }
  }
}
