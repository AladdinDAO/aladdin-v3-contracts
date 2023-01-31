// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;
pragma abicoder v2;

import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/SafeERC20Upgradeable.sol";

import "./AladdinCRVConvexVault.sol";

interface ICTR {
  function mint(address _to, uint256 _value) external returns (bool);
}

contract ConcentratorIFOVault is AladdinCRVConvexVault {
  using SafeMathUpgradeable for uint256;
  using SafeERC20Upgradeable for IERC20Upgradeable;

  event ClaimCTR(uint256 indexed _pid, address indexed _caller, address _recipient, uint256 _amount);
  event IFOMineCTR(uint256 _amount);
  event UpdateIFOConfig(address _ctr, uint256 _startTime, uint256 _endTime);

  /// @dev The maximum amount of CTR to mint in IFO.
  // uint256 private constant MAX_MINED_CTR = 2_500_000 ether;

  /// @dev The unlocked percentage of for CTR minted in IFO.
  // uint256 private constant UNLOCK_PERCENTAGE = 1e9; // 100% will be unlocked to IFO miner.

  /// @dev The percentage CTR for liquidity mining.
  // uint256 private constant LIQUIDITY_MINING_PERCENTAGE = 6e7;

  /// @notice Mapping from pool id to accumulated cont reward per share, with 1e18 precision.
  mapping(uint256 => uint256) public accCTRPerShare;

  /// @dev Mapping from pool id to account address to pending cont rewards.
  mapping(uint256 => mapping(address => uint256)) private userCTRRewards;

  /// @dev Mapping from pool id to account address to reward per share
  /// already paid for the user, with 1e18 precision.
  mapping(uint256 => mapping(address => uint256)) private userCTRPerSharePaid;

  /// @notice The address of $CTR token.
  address public ctr;

  /// @notice The start timestamp in seconds.
  uint64 public startTime;

  /// @notice The end timestamp in seconds.
  uint64 public endTime;

  /// @notice The amount of $CTR token mined so far.
  uint128 public ctrMined;

  /********************************** View Functions **********************************/

  /// @notice Return the amount of pending $CTR rewards for specific pool.
  /// @param _pid - The pool id.
  /// @param _account - The address of user.
  function pendingCTR(uint256 _pid, address _account) public view returns (uint256) {
    UserInfo storage _userInfo = userInfo[_pid][_account];
    return
      userCTRRewards[_pid][_account].add(
        accCTRPerShare[_pid].sub(userCTRPerSharePaid[_pid][_account]).mul(_userInfo.shares) / PRECISION
      );
  }

  /********************************** Mutated Functions **********************************/

  /// @notice Claim pending $CTR from specific pool.
  /// @param _pid - The pool id.
  /// @param _recipient The address of recipient who will recieve the token.
  /// @return claimed - The amount of $CTR sent to caller.
  function claimCTR(uint256 _pid, address _recipient) external onlyExistPool(_pid) returns (uint256) {
    _updateRewards(_pid, msg.sender);

    uint256 _rewards = userCTRRewards[_pid][msg.sender];
    userCTRRewards[_pid][msg.sender] = 0;

    IERC20Upgradeable(ctr).safeTransfer(_recipient, _rewards);
    emit ClaimCTR(_pid, msg.sender, _recipient, _rewards);

    return _rewards;
  }

  /// @notice Claim pending $CTR from all pools.
  /// @param _recipient The address of recipient who will recieve the token.
  /// @return claimed - The amount of $CTR sent to caller.
  function claimAllCTR(address _recipient) external returns (uint256) {
    uint256 _rewards = 0;
    for (uint256 _pid = 0; _pid < poolInfo.length; _pid++) {
      UserInfo storage _userInfo = userInfo[_pid][msg.sender];

      // update if user has share
      if (_userInfo.shares > 0) {
        _updateRewards(_pid, msg.sender);
      }

      // claim if user has reward
      uint256 _currentPoolRewards = userCTRRewards[_pid][msg.sender];
      if (_currentPoolRewards > 0) {
        _rewards = _rewards.add(_currentPoolRewards);
        userCTRRewards[_pid][msg.sender] = 0;

        emit ClaimCTR(_pid, msg.sender, _recipient, _currentPoolRewards);
      }
    }

    IERC20Upgradeable(ctr).safeTransfer(_recipient, _rewards);

    return _rewards;
  }

  /********************************** Restricted Functions **********************************/

  /// @notice Update IFO configuration
  /// @param _ctr The address of $CTR token.
  /// @param _startTime The start time of IFO.
  /// @param _endTime The finish time of IFO.
  function updateIFOConfig(
    address _ctr,
    uint64 _startTime,
    uint64 _endTime
  ) external onlyOwner {
    require(_startTime <= _endTime, "invalid IFO time");

    ctr = _ctr;
    startTime = _startTime;
    endTime = _endTime;

    emit UpdateIFOConfig(_ctr, _startTime, _endTime);
  }

  /********************************** Internal Functions **********************************/

  function _updateRewards(uint256 _pid, address _account) internal override {
    // 1. update aCRV rewards
    AladdinCRVConvexVault._updateRewards(_pid, _account);

    // 2. update CTR rewards
    uint256 _ctrRewards = pendingCTR(_pid, _account);
    userCTRRewards[_pid][_account] = _ctrRewards;
    userCTRPerSharePaid[_pid][_account] = accCTRPerShare[_pid];
  }
}
