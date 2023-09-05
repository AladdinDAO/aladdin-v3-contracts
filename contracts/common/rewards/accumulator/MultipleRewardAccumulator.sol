// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable-v4/token/ERC20/IERC20Upgradeable.sol";
import { SafeERC20Upgradeable } from "@openzeppelin/contracts-upgradeable-v4/token/ERC20/utils/SafeERC20Upgradeable.sol";
import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable-v4/security/ReentrancyGuardUpgradeable.sol";

import { IMultipleRewardAccumulator } from "./IMultipleRewardAccumulator.sol";

import { LinearMultipleRewardDistributor } from "../distributor/LinearMultipleRewardDistributor.sol";

// solhint-disable not-rely-on-time

abstract contract MultipleRewardAccumulator is
  ReentrancyGuardUpgradeable,
  LinearMultipleRewardDistributor,
  IMultipleRewardAccumulator
{
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

  /// @notice Mapping from reward token address to global reward snapshot.
  ///
  /// @dev The integral is defined as 1e18 * ∫(rate(t) / totalPoolShare(t) dt).
  mapping(address => RewardSnapshot) public rewardSnapshot;

  /// @notice Mapping from user address to reward token address to user reward snapshot.
  ///
  /// @dev The integral is the value of `rewardSnapshot[token].integral` when the snapshot is taken.
  mapping(address => mapping(address => UserRewardSnapshot)) public userRewardSnapshot;

  /// @dev reserved slots.
  uint256[48] private __gap;

  /***************
   * Constructor *
   ***************/

  // solhint-disable-next-line func-name-mixedcase
  function __MultipleRewardAccumulator_init() internal onlyInitializing {
    __LinearMultipleRewardDistributor_init();
  }

  /*************************
   * Public View Functions *
   *************************/

  /// @inheritdoc IMultipleRewardAccumulator
  function claimable(address _account, address _token) public view returns (uint256) {
    UserRewardSnapshot memory _userSnapshot = userRewardSnapshot[_account][_token];
    uint256 _shares = _getUserPoolShare(_account);
    return
      uint256(_userSnapshot.rewards.pending) +
      ((rewardSnapshot[_token].integral - _userSnapshot.checkpoint.integral) * _shares) /
      REWARD_PRECISION;
  }

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @inheritdoc IMultipleRewardAccumulator
  function checkpoint(address _account) external nonReentrant {
    _checkpoint(_account);
  }

  /// @inheritdoc IMultipleRewardAccumulator
  function claim() external nonReentrant {
    address _sender = _msgSender();
    _checkpoint(_sender);
    _claim(_sender, _sender);
  }

  /// @inheritdoc IMultipleRewardAccumulator
  function claim(address _account) external nonReentrant {
    _checkpoint(_account);
    _claim(_account, _account);
  }

  /// @inheritdoc IMultipleRewardAccumulator
  function claim(address _account, address _receiver) external nonReentrant {
    if (_account != _msgSender()) {
      require(_account == _receiver, "claim to other");
    }

    _checkpoint(_account);
    _claim(_account, _receiver);
  }

  /// @inheritdoc IMultipleRewardAccumulator
  function claimHistorical(address[] memory _tokens) external nonReentrant {
    address _sender = _msgSender();
    _checkpoint(_sender);

    for (uint256 i = 0; i < _tokens.length; i++) {
      _claimSingle(_sender, _tokens[i], _sender);
    }
  }

  /// @inheritdoc IMultipleRewardAccumulator
  function claimHistorical(address _account, address[] memory _tokens) external nonReentrant {
    _checkpoint(_account);

    for (uint256 i = 0; i < _tokens.length; i++) {
      _claimSingle(_account, _tokens[i], _account);
    }
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
      address[] memory _rewardTokens = getActiveRewardTokens();
      for (uint256 i = 0; i < _rewardTokens.length; i++) {
        address _token = _rewardTokens[i];
        UserRewardSnapshot memory _snapshot = userRewardSnapshot[_account][_token];
        _snapshot.rewards.pending = uint128(claimable(_account, _token));
        _snapshot.checkpoint = rewardSnapshot[_token];
        _snapshot.checkpoint.timestamp = uint64(block.timestamp);
        userRewardSnapshot[_account][_token] = _snapshot;
      }
    }
  }

  /// @dev Internal function to claim active reward tokens.
  ///
  /// @param _account The address of user to claim.
  /// @param _receiver The address of recipient of the reward token.
  function _claim(address _account, address _receiver) internal virtual {
    address[] memory _activeRewardTokens = getActiveRewardTokens();

    for (uint256 i = 0; i < _activeRewardTokens.length; i++) {
      _claimSingle(_account, _activeRewardTokens[i], _receiver);
    }
  }

  /// @dev Internal function to claim single reward token.
  /// Caller should make sure `_checkpoint` is called before this function.
  ///
  /// @param _account The address of user to claim.
  /// @param _token The address of reward token.
  /// @param _receiver The address of recipient of the reward token.
  function _claimSingle(
    address _account,
    address _token,
    address _receiver
  ) internal virtual returns (uint256) {
    ClaimData memory _rewards = userRewardSnapshot[_account][_token].rewards;
    uint256 _amount = _rewards.pending;
    if (_amount > 0) {
      _rewards.claimed += _rewards.pending;
      _rewards.pending = 0;
      userRewardSnapshot[_account][_token].rewards = _rewards;

      IERC20Upgradeable(_token).safeTransfer(_receiver, _amount);

      emit Claim(_account, _token, _amount);
    }
    return _amount;
  }

  /// @inheritdoc LinearMultipleRewardDistributor
  function _accumulateReward(address _token, uint256 _amount) internal virtual override {
    if (_amount == 0) return;

    RewardSnapshot memory _snapshot = rewardSnapshot[_token];
    _snapshot.timestamp = uint64(block.timestamp);
    _snapshot.integral = uint192(uint256(_snapshot.integral) + (_amount * REWARD_PRECISION) / _getTotalPoolShare());
    rewardSnapshot[_token] = _snapshot;
  }

  /// @dev Internal function to get the total pool shares.
  function _getTotalPoolShare() internal view virtual returns (uint256);

  /// @dev Internal function to get the amount of user shares.
  ///
  /// @param _account The address of user to query.
  function _getUserPoolShare(address _account) internal view virtual returns (uint256);
}