// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable-v4/token/ERC20/IERC20Upgradeable.sol";
import { SafeERC20Upgradeable } from "@openzeppelin/contracts-upgradeable-v4/token/ERC20/utils/SafeERC20Upgradeable.sol";
import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable-v4/security/ReentrancyGuardUpgradeable.sol";

import { IRewardAccumulator } from "./IRewardAccumulator.sol";

import { LinearRewardDistributor } from "../distributor/LinearRewardDistributor.sol";

// solhint-disable not-rely-on-time

abstract contract RewardAccumulator is ReentrancyGuardUpgradeable, LinearRewardDistributor, IRewardAccumulator {
  using SafeERC20Upgradeable for IERC20Upgradeable;

  /*************
   * Constants *
   *************/

  /// @dev The precision used to calculate accumulated rewards.
  uint256 internal constant REWARD_PRECISION = 1e18;

  /***********
   * Structs *
   ***********/

  /// @dev Compiler will pack this into single `uint256`.
  struct RewardSnapshot {
    // The timestamp when the snapshot is updated.
    uint64 timestamp;
    // The reward integral until now.
    uint192 integral;
  }

  /// @dev Compiler will pack this into single `uint256`.
  struct ClaimData {
    // The number of pending rewards.
    uint128 pending;
    // The number of claimed rewards.
    uint128 claimed;
  }

  /// @dev Compiler will pack this into two `uint256`.
  struct UserRewardSnapshot {
    // The claim data for the user.
    ClaimData rewards;
    // The reward snapshot for user.
    RewardSnapshot checkpoint;
  }

  /*************
   * Variables *
   *************/

  /// @inheritdoc IRewardAccumulator
  mapping(address => address) public override rewardReceiver;

  /// @notice The global reward snapshot.
  ///
  /// @dev The integral is defined as 1e18 * ∫(rate(t) / totalPoolShare(t) dt).
  RewardSnapshot public rewardSnapshot;

  /// @notice Mapping from user address to user reward snapshot.
  ///
  /// @dev The integral is the value of `rewardSnapshot.integral` when the snapshot is taken.
  mapping(address => UserRewardSnapshot) public userRewardSnapshot;

  /// @dev reserved slots.
  uint256[47] private __gap;

  /***************
   * Constructor *
   ***************/

  // solhint-disable-next-line func-name-mixedcase
  function __RewardAccumulator_init(address _rewardToken) internal onlyInitializing {
    __LinearRewardDistributor_init(_rewardToken);
  }

  /*************************
   * Public View Functions *
   *************************/

  /// @inheritdoc IRewardAccumulator
  function claimable(address _account) public view override returns (uint256) {
    UserRewardSnapshot memory _userSnapshot = userRewardSnapshot[_account];
    uint256 _shares = _getUserPoolShare(_account);
    return
      uint256(_userSnapshot.rewards.pending) +
      ((rewardSnapshot.integral - _userSnapshot.checkpoint.integral) * _shares) /
      REWARD_PRECISION;
  }

  /// @inheritdoc IRewardAccumulator
  function claimed(address _account) external view returns (uint256) {
    return userRewardSnapshot[_account].rewards.claimed;
  }

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @inheritdoc IRewardAccumulator
  function setRewardReceiver(address _newReceiver) external {
    address _caller = _msgSender();
    address _oldReceiver = rewardReceiver[_caller];
    rewardReceiver[_caller] = _newReceiver;

    emit UpdateRewardReceiver(_caller, _oldReceiver, _newReceiver);
  }

  /// @inheritdoc IRewardAccumulator
  function checkpoint(address _account) external override nonReentrant {
    _checkpoint(_account);
  }

  /// @inheritdoc IRewardAccumulator
  function claim() external override {
    address _sender = _msgSender();
    claim(_sender, address(0));
  }

  /// @inheritdoc IRewardAccumulator
  function claim(address _account) external override {
    claim(_account, address(0));
  }

  /// @inheritdoc IRewardAccumulator
  function claim(address _account, address _receiver) public override nonReentrant {
    if (_account != _msgSender() && _receiver != address(0)) {
      revert ClaimOthersRewardToAnother();
    }

    _checkpoint(_account);
    _claim(_account, _receiver);
  }

  /**********************
   * Internal Functions *
   **********************/

  /// @dev Internal function to update the global and user snapshot.
  ///
  /// @param _account The address of user to update. Use zero address
  ///        if you only want to update global snapshot.
  function _checkpoint(address _account) internal virtual {
    _distributePendingReward();

    if (_account != address(0)) {
      // checkpoint active reward tokens
      UserRewardSnapshot memory _snapshot = userRewardSnapshot[_account];
      _snapshot.rewards.pending = uint128(claimable(_account));
      _snapshot.checkpoint = rewardSnapshot;
      _snapshot.checkpoint.timestamp = uint64(block.timestamp);
      userRewardSnapshot[_account] = _snapshot;
    }
  }

  /// @dev Internal function to claim active reward tokens.
  ///
  /// @param _account The address of user to claim.
  /// @param _receiver The address of recipient of the reward token.
  function _claim(address _account, address _receiver) internal virtual returns (uint256) {
    address _receiverStored = rewardReceiver[_account];
    if (_receiverStored != address(0) && _receiver == address(0)) {
      _receiver = _receiverStored;
    }
    if (_receiver == address(0)) _receiver = _account;

    ClaimData memory _rewards = userRewardSnapshot[_account].rewards;
    uint256 _amount = _rewards.pending;
    if (_amount > 0) {
      _rewards.claimed += _rewards.pending;
      _rewards.pending = 0;
      userRewardSnapshot[_account].rewards = _rewards;

      IERC20Upgradeable(rewardToken).safeTransfer(_receiver, _amount);

      emit Claim(_account, _receiver, _amount);
    }
    return _amount;
  }

  /// @inheritdoc LinearRewardDistributor
  function _accumulateReward(uint256 _amount) internal virtual override {
    if (_amount == 0) return;

    RewardSnapshot memory _snapshot = rewardSnapshot;
    _snapshot.timestamp = uint64(block.timestamp);
    _snapshot.integral = uint192(uint256(_snapshot.integral) + (_amount * REWARD_PRECISION) / _getTotalPoolShare());
    rewardSnapshot = _snapshot;
  }

  /// @dev Internal function to get the total pool shares.
  function _getTotalPoolShare() internal view virtual returns (uint256);

  /// @dev Internal function to get the amount of user shares.
  ///
  /// @param _account The address of user to query.
  function _getUserPoolShare(address _account) internal view virtual returns (uint256);
}
