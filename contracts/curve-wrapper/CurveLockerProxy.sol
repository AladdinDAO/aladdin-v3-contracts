// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

import "./interfaces/ICurveFeeDistributor.sol";
import "./interfaces/ICurveGaugeController.sol";
import "./interfaces/ICurveLockerProxy.sol";
import "./interfaces/ICurveMinter.sol";
import "./interfaces/ICurveProposalVoting.sol";
import "./interfaces/ICurveVoteEscrow.sol";
import "./interfaces/ILiquidityStaking.sol";
import "../interfaces/ICurveGauge.sol";

// solhint-disable no-empty-blocks

/// @title CurveLockerProxy
/// @notice This contract is the main entry for curve lp tokens in Curve.fi.
contract CurveLockerProxy is Ownable, ICurveLockerProxy {
  using SafeERC20 for IERC20;

  /**********
   * Events *
   **********/

  /// @notice Emitted when the operator for gauge is updated.
  /// @param _gauge The address of gauge updated.
  /// @param _operator The address of operator updated.
  event UpdateOperator(address _gauge, address _operator);

  /// @notice Emitted when the status of executor is updated.
  /// @param _executor The address of executor updated.
  /// @param _status The status of executor updated.
  event UpdateExecutor(address _executor, bool _status);

  /// @notice Emitted when locker for veCRV is update.
  /// @param _locker The address of locker updated.
  event UpdateLocker(address _locker);

  /// @notice Emitted when voter for gauge weight is update.
  /// @param _voter The address of voter updated.
  event UpdateVoter(address _voter);

  /*************
   * Constants *
   *************/

  /// @dev The address of Curve Minter contract.
  address private constant CRV_MINTER = 0xd061D61a4d941c39E5453435B6345Dc261C2fcE0;

  /// @dev The address of CRV token.
  address private constant CRV = 0xD533a949740bb3306d119CC777fa900bA034cd52;

  /// @dev The address of veCRV token.
  // solhint-disable-next-line const-name-snakecase
  address private constant veCRV = 0x5f3b5DfEb7B28CDbD7FAba78963EE202a494e2A2;

  /// @dev The address of Curve Gauge Controller contract.
  address private constant GAUGE_CONTROLLER = 0x2F50D538606Fa9EDD2B11E2446BEb18C9D5846bB;

  /*************
   * Variables *
   *************/

  /// @notice The address of locker, which can lock veCRV.
  address public locker;

  /// @notice The address of voter, which can vote gauge weight.
  address public voter;

  /// @notice Mapping from gauge address to operator address.
  mapping(address => address) public operators;

  /// @notice Whether the address is an executor.
  mapping(address => bool) public executors;

  /// @notice Mapping from gauge address to reward address to rewards claimed.
  mapping(address => mapping(address => uint256)) public claimed;

  /**********************
   * Function Modifiers *
   **********************/

  modifier onlyOperator(address _gauge) {
    require(operators[_gauge] == msg.sender, "not operator");
    _;
  }

  modifier onlyOwnerOrLocker() {
    require(locker == msg.sender || msg.sender == owner(), "not owner or locker");
    _;
  }

  modifier onlyExecutor() {
    require(executors[msg.sender], "not executor");
    _;
  }

  /***************
   * Constructor *
   ***************/

  constructor() {
    IERC20(CRV).safeApprove(veCRV, uint256(-1));
  }

  /*************************
   * Public View Functions *
   *************************/

  /// @inheritdoc ICurveLockerProxy
  function balanceOf(address _gauge) external view override returns (uint256) {
    return ICurveGauge(_gauge).balanceOf(address(this));
  }

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @inheritdoc ICurveLockerProxy
  function createLock(uint256 _value, uint256 _unlockTime) external override onlyOwnerOrLocker {
    ICurveVoteEscrow(veCRV).create_lock(_value, _unlockTime);
  }

  /// @inheritdoc ICurveLockerProxy
  function increaseAmount(uint256 _value) external override onlyOwnerOrLocker {
    ICurveVoteEscrow(veCRV).increase_amount(_value);
  }

  /// @inheritdoc ICurveLockerProxy
  function increaseTime(uint256 _unlockTime) external override onlyOwnerOrLocker {
    ICurveVoteEscrow(veCRV).increase_unlock_time(_unlockTime);
  }

  /// @inheritdoc ICurveLockerProxy
  function release() external override onlyOwnerOrLocker {
    ICurveVoteEscrow(veCRV).withdraw();
  }

  /// @inheritdoc ICurveLockerProxy
  function voteGaugeWeight(address _gauge, uint256 _weight) external override {
    require(msg.sender == voter, "not voter");
    ICurveGaugeController(GAUGE_CONTROLLER).vote_for_gauge_weights(_gauge, _weight);
  }

  /// @inheritdoc ICurveLockerProxy
  function vote(
    uint256 _voteId,
    address _votingAddress,
    bool _support
  ) external override {
    require(msg.sender == voter, "not voter");
    ICurveProposalVoting(_votingAddress).vote(_voteId, _support, false);
  }

  /// @inheritdoc ICurveLockerProxy
  function deposit(
    address _gauge,
    address _token,
    uint256 _amount
  ) external override onlyOperator(_gauge) {
    uint256 _balance = IERC20(_token).balanceOf(address(this));
    require(_amount <= _balance, "balance not enough");
    if (_amount > 0) {
      IERC20(_token).safeApprove(_gauge, 0);
      IERC20(_token).safeApprove(_gauge, _amount);
      // deposit without claiming rewards
      ICurveGauge(_gauge).deposit(_amount);
    }
  }

  /// @inheritdoc ICurveLockerProxy
  function withdraw(
    address _gauge,
    address _token,
    uint256 _amount,
    address _recipient
  ) external override onlyOperator(_gauge) {
    uint256 _balance = IERC20(_token).balanceOf(address(this));
    if (_balance < _amount) {
      // withdraw without claiming rewards
      ICurveGauge(_gauge).withdraw(_amount - _balance);
    }
    if (_recipient != address(this)) {
      IERC20(_token).safeTransfer(_recipient, _amount);
    }
  }

  /// @inheritdoc ICurveLockerProxy
  function claimCRV(address _gauge, address _recipient) external override onlyOperator(_gauge) returns (uint256) {
    // only this contract can claim CRV rewards, so the amount is correct.
    uint256 _balance = IERC20(CRV).balanceOf(address(this));
    try ICurveMinter(CRV_MINTER).mint(_gauge) {
      _balance = IERC20(CRV).balanceOf(address(this)) - _balance;
      if (_balance > 0) {
        IERC20(CRV).safeTransfer(_recipient, _balance);
      }
    } catch {
      _balance = 0;
    }

    return _balance;
  }

  /// @inheritdoc ICurveLockerProxy
  function claimGaugeRewards(
    address _gauge,
    address[] calldata _tokens,
    address _recipient
  ) external override onlyOperator(_gauge) returns (uint256[] memory _amounts) {
    uint256 _length = _tokens.length;
    _amounts = new uint256[](_length);

    // This will claim all extra rewards.
    try ICurveGauge(_gauge).claim_rewards() {} catch {}

    for (uint256 i = 0; i < _length; i++) {
      address _token = _tokens[i];
      uint256 _rewards;
      uint256 _claimedBefore = claimed[_gauge][_token];
      try ICurveGauge(_gauge).claimed_reward(address(this), _token) returns (uint256 _claimedNow) {
        if (_claimedBefore == 0) {
          // first claim, use balanceOf
          _rewards = IERC20(_token).balanceOf(address(this));
        } else {
          // _claimedNow is always >= _claimedBefore
          _rewards = _claimedNow - _claimedBefore;
        }
        claimed[_gauge][_token] = _claimedNow;
      } catch {
        // use balanceOf, since others could claim rewards for the contract.
        _rewards = IERC20(_token).balanceOf(address(this));
      }
      _amounts[i] = _rewards;
      if (_rewards > 0) {
        IERC20(_token).safeTransfer(_recipient, _rewards);
      }
    }
  }

  /// @inheritdoc ICurveLockerProxy
  function claimFees(
    address _distributor,
    address _token,
    address _recipient
  ) external override returns (uint256 _amount) {
    require(locker == msg.sender, "not locker");

    ICurveFeeDistributor(_distributor).claim();

    // other guys can claim rewards for this contract, so we take all pool balance.
    uint256 _balance = IERC20(_token).balanceOf(address(this));
    IERC20(_token).safeTransfer(_recipient, _balance);
    return _balance;
  }

  /// @notice Update the operator for Curve gauge.
  /// @param _gauge The address of gauge to update.
  /// @param _operator The address of operator to update.
  function updateOperator(address _gauge, address _operator) external {
    require(msg.sender == ILiquidityStaking(_operator).booster() || msg.sender == owner(), "only booster or owner");

    operators[_gauge] = _operator;

    emit UpdateOperator(_gauge, _operator);
  }

  /// @inheritdoc ICurveLockerProxy
  function execute(
    address _to,
    uint256 _value,
    bytes calldata _data
  ) external override onlyExecutor returns (bool, bytes memory) {
    // solhint-disable avoid-low-level-calls
    (bool success, bytes memory result) = _to.call{ value: _value }(_data);
    return (success, result);
  }

  /*******************************
   * Public Restricted Functions *
   *******************************/

  /// @notice Update the executor.
  /// @param _executor The address of executor to update.
  /// @param _status The status of executor to update.
  function updateExecutor(address _executor, bool _status) external onlyOwner {
    executors[_executor] = _status;

    emit UpdateExecutor(_executor, _status);
  }

  /// @notice Update the locker for veCRV.
  /// @param _locker The address of locker to update.
  function updateLocker(address _locker) external onlyOwner {
    locker = _locker;

    emit UpdateLocker(_locker);
  }

  /// @notice Update the voter for gauge weight.
  /// @param _voter The address of voter to update.
  function updateVoter(address _voter) external onlyOwner {
    voter = _voter;

    emit UpdateVoter(_voter);
  }
}
