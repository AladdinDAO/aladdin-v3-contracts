// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable-v4/token/ERC20/IERC20Upgradeable.sol";
import { SafeERC20Upgradeable } from "@openzeppelin/contracts-upgradeable-v4/token/ERC20/utils/SafeERC20Upgradeable.sol";
import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable-v4/security/ReentrancyGuardUpgradeable.sol";

import { IMultipleRewardAccumulator } from "./IMultipleRewardAccumulator.sol";

import { DecrementalFloatingPoint } from "../../math/DecrementalFloatingPoint.sol";
import { LinearMultipleRewardDistributor } from "../distributor/LinearMultipleRewardDistributor.sol";

// solhint-disable not-rely-on-time

/// @title MultipleRewardCompoundingAccumulator
/// @notice `MultipleRewardCompoundingAccumulator` is a reward accumulator for reward distribution in a staking pool.
/// In the staking pool, the total stakes will decrease unexpectedly and the user stakes will also decrease proportionally.
/// The contract will distribute rewards in proportion to a staker’s share of total stakes with only O(1) complexity.
///
/// Assume that there are n events e[1], e[2], ..., and e[n]. The types of events are user stake,
/// user unstake, total stakes decrease and reward distribution.
/// Right after event e[i], let the total pool stakes be s[i], the user pool stakes be u[i],
/// the total stake decrease is d[i], and the rewards distributed be r[i].
///
/// The basic assumptions are, if
///   + e[i] is user stake, r[i] = 0, u[i] > u[i-1] and s[i] - s[i-1] = u[i] - u[i-1].
///   + e[i] is user unstake, r[i] = 0, u[i] < u[i-1] and s[i] - s[i-1] = u[i] - u[i-1].
///   + e[i] is total stakes decrease, r[i] = 0, d[i] > 0, s[i] = s[i-1] - d[i] and u[i] = u[i-1] * (1 - d[i] / s[i-1])
///   + e[i] is reward distribution, r[i] > 0, u[i] = u[i-1] and s[i] = s[i-1].
///
/// So under the assumptions, if
///  + e[i] is user stake/unstake, we can maintain the value of u[i] and s[i] easily.
///  + e[i] is total stakes decrease, we can only maintain the value of s[i] easily.
///
/// To compute the value of u[i], assuming the only events are total stakes decrease. Then after n events,
///   u[n] = u[0] * (1 - d[1]/s[0]) * (1 - d[2]/s[1]) * ... * (1 - d[n]/s[n-1])
///
/// To compute the user stakes correctly, we can maintain the value of
///   p[n] = (1 - d[1]/s[0]) * (1 - d[2]/s[1]) * ... * (1 - d[n]/s[n-1])
///
/// Then the user stakes from event x to event y is u[y] = u[x] * p[y] / p[x]
///
/// As for the accumutated rewards, the total amount of rewards for the user is:
///                 u[0]          u[1]                u[n-1]
///   g[n] = r[1] * ---- + r[2] * ---- + ... + r[n] * ------
///                 s[0]          s[1]                s[n-1]
///
/// Also, u[n] = u[0] * p[n], we have
///                         p[0]          p[1]                p[n-1]
///   g[n] = u[0] * (r[1] * ---- + r[2] * ---- + ... + r[n] * ------)
///                         s[0]          s[1]                s[n-1]
///
/// And, the rewards from event x to event y (both inclusive) for the user is:
///                            p[x-1]            p[x]                p[y-1]
///   g[x->y] = u[x] * (r[x] * ------ + r[x+1] * ---- + ... + r[y] * ------)
///                            s[x-1]            s[x]                s[y-1]
///
/// To check the accumulated total user rewards, we can maintain the value of
///                p[0]          p[1]                p[n-1]
///   acc = r[1] * ---- + r[2] * ---- + ... + r[n] * ------
///                s[0]          s[1]                s[n-1]
///
/// For each event, if
///   + e[i] is user stake or unstake, new accumulated rewards is
///      gain += u[i-1] * (acc - last_user_acc) / last_user_prod,
///      and update `last_user_acc` to `acc`
///      and update `last_user_prod` to p[i].
///   + e[i] is total stakes decrease, p[i] *= (1 - d[i] / s[i-1])
///   + e[i] is reward distribution, acc += r[i] * p[i-1] / s[i-1].
///
/// Notice that total stakes decrease event will possible make s[i] be zero. We introduce epoch to handle this problem.
/// When the total supply reduces to zero, we start a new epoch.
///
/// Another problem is precision loss in solidity, the p[i] will eventually become a very small nonzero value. To solve
/// the problem, we treat p[i] as m[i] * 10^{-18 - 9 * e[i]}, where m[i] is the magnitude and e[i] is the exponent.
/// When the value of m[i] is smaller than 10^9, we will multiply m[i] by 1e9 and then increase e[i] by one.
///
/// @dev The method comes from liquity's StabilityPool, the paper is in
/// https://github.com/liquity/dev/blob/main/papers/Scalable_Reward_Distribution_with_Compounding_Stakes.pdf
abstract contract MultipleRewardCompoundingAccumulator is
  ReentrancyGuardUpgradeable,
  LinearMultipleRewardDistributor,
  IMultipleRewardAccumulator
{
  using SafeERC20Upgradeable for IERC20Upgradeable;
  using DecrementalFloatingPoint for uint112;

  /*************
   * Constants *
   *************/

  /// @dev The precision used to calculate accumulated rewards.
  uint256 internal constant REWARD_PRECISION = 1e18;

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

  /// @inheritdoc IMultipleRewardAccumulator
  mapping(address => address) public override rewardReceiver;

  /// @notice Mapping from reward token address to global reward snapshot.
  ///
  /// - The inner mapping records the `acc` at different `(epoch, exponent)`
  /// - The outer mapping records the ((epoch, exponent) => acc) mappings, for different tokens.
  ///
  /// @dev The integral is defined as 1e18 * ∫(rate(t) * prod(t) / totalPoolShare(t) dt).
  mapping(address => mapping(uint256 => RewardSnapshot)) public epochToExponentToRewardSnapshot;

  /// @notice Mapping from user address to reward token address to user reward snapshot.
  ///
  /// @dev The integral is the value of `rewardSnapshot[token].integral` when the snapshot is taken.
  mapping(address => mapping(address => UserRewardSnapshot)) public userRewardSnapshot;

  /// @dev reserved slots.
  uint256[47] private __gap;

  /***************
   * Constructor *
   ***************/

  // solhint-disable-next-line func-name-mixedcase
  function __MultipleRewardCompoundingAccumulator_init() internal onlyInitializing {
    __LinearMultipleRewardDistributor_init();
  }

  /*************************
   * Public View Functions *
   *************************/

  /// @inheritdoc IMultipleRewardAccumulator
  function claimable(address _account, address _token) public view virtual override returns (uint256) {
    return _claimable(_account, _token);
  }

  /// @inheritdoc IMultipleRewardAccumulator
  function claimed(address _account, address _token) external view returns (uint256) {
    return userRewardSnapshot[_account][_token].rewards.claimed;
  }

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @inheritdoc IMultipleRewardAccumulator
  function setRewardReceiver(address _newReceiver) external {
    address _caller = _msgSender();
    address _oldReceiver = rewardReceiver[_caller];
    rewardReceiver[_caller] = _newReceiver;

    emit UpdateRewardReceiver(_caller, _oldReceiver, _newReceiver);
  }

  /// @inheritdoc IMultipleRewardAccumulator
  function checkpoint(address _account) external virtual override nonReentrant {
    _checkpoint(_account);
  }

  /// @inheritdoc IMultipleRewardAccumulator
  function claim() external override {
    address _sender = _msgSender();
    claim(_sender, address(0));
  }

  /// @inheritdoc IMultipleRewardAccumulator
  function claim(address _account) external override {
    claim(_account, address(0));
  }

  /// @inheritdoc IMultipleRewardAccumulator
  function claim(address _account, address _receiver) public override nonReentrant {
    if (_account != _msgSender() && _receiver != address(0)) {
      revert ClaimOthersRewardToAnother();
    }

    _checkpoint(_account);
    _claim(_account, _receiver);
  }

  /// @inheritdoc IMultipleRewardAccumulator
  function claimHistorical(address[] memory _tokens) external nonReentrant {
    address _sender = _msgSender();
    _checkpoint(_sender);

    address _receiver = rewardReceiver[_sender];
    if (_receiver == address(0)) _receiver = _sender;

    for (uint256 i = 0; i < _tokens.length; i++) {
      _claimSingle(_sender, _tokens[i], _receiver);
    }
  }

  /// @inheritdoc IMultipleRewardAccumulator
  function claimHistorical(address _account, address[] memory _tokens) external nonReentrant {
    _checkpoint(_account);

    address _receiver = rewardReceiver[_account];
    if (_receiver == address(0)) _receiver = _account;

    for (uint256 i = 0; i < _tokens.length; i++) {
      _claimSingle(_account, _tokens[i], _receiver);
    }
  }

  /**********************
   * Internal Functions *
   **********************/

  function _claimable(address _account, address _token) internal view virtual returns (uint256) {
    UserRewardSnapshot memory _userSnapshot = userRewardSnapshot[_account][_token];
    (uint112 previousProd, uint256 shares) = _getUserPoolShare(_account);
    uint256 epochExponent = previousProd.epochAndExponent();
    uint256 magnitude = previousProd.magnitude();

    // Grab the sum 'S' from the epoch at which the stake was made. The gain may span up to one scale change.
    // If it does, the second portion of the gain is scaled by 1e9.
    // If the gain spans no scale change, the second portion will be 0.
    uint256 firstPortion = epochToExponentToRewardSnapshot[_token][epochExponent].integral -
      _userSnapshot.checkpoint.integral;
    uint256 secondPortion = epochToExponentToRewardSnapshot[_token][epochExponent + 1].integral /
      uint256(DecrementalFloatingPoint.HALF_PRECISION);

    return
      uint256(_userSnapshot.rewards.pending) +
      (shares * (firstPortion + secondPortion)) /
      (magnitude * REWARD_PRECISION);
  }

  /// @dev Internal function to update the global and user snapshot.
  ///
  /// @param _account The address of user to update. Use zero address
  ///        if you only want to update global snapshot.
  function _checkpoint(address _account) internal virtual {
    _distributePendingReward();

    if (_account != address(0)) {
      // checkpoint active reward tokens
      address[] memory _rewardTokens = getActiveRewardTokens();
      for (uint256 i = 0; i < _rewardTokens.length; i++) {
        _updateSnapshot(_account, _rewardTokens[i]);
      }

      // checkpoint historical reward tokens
      _rewardTokens = getHistoricalRewardTokens();
      for (uint256 i = 0; i < _rewardTokens.length; i++) {
        _updateSnapshot(_account, _rewardTokens[i]);
      }
    }
  }

  /// @notice Internal function to update snapshot for single token.
  /// @param _account The address of user to update.
  /// @param _token The address of token to update.
  function _updateSnapshot(address _account, address _token) internal virtual {
    UserRewardSnapshot memory _snapshot = userRewardSnapshot[_account][_token];
    (uint112 currentProd, ) = _getTotalPoolShare();
    uint48 epochExponent = currentProd.epochAndExponent();

    _snapshot.rewards.pending = uint128(_claimable(_account, _token));
    _snapshot.checkpoint = epochToExponentToRewardSnapshot[_token][epochExponent];
    _snapshot.checkpoint.timestamp = uint64(block.timestamp);
    userRewardSnapshot[_account][_token] = _snapshot;
  }

  /// @dev Internal function to claim active reward tokens.
  ///
  /// @param _account The address of user to claim.
  /// @param _receiver The address of recipient of the reward token.
  function _claim(address _account, address _receiver) internal virtual {
    address _receiverStored = rewardReceiver[_account];
    if (_receiverStored != address(0) && _receiver == address(0)) {
      _receiver = _receiverStored;
    }
    if (_receiver == address(0)) _receiver = _account;

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

      emit Claim(_account, _token, _receiver, _amount);
    }
    return _amount;
  }

  /// @inheritdoc LinearMultipleRewardDistributor
  function _accumulateReward(address _token, uint256 _amount) internal virtual override {
    if (_amount == 0) return;

    (uint112 currentProd, uint256 totalShare) = _getTotalPoolShare();
    if (totalShare == 0) {
      // no deposits, queue rewards
      rewardData[_token].queued += uint96(_amount);
      return;
    }

    uint48 epochExponent = currentProd.epochAndExponent();
    uint256 magnitude = currentProd.magnitude();

    RewardSnapshot memory _snapshot = epochToExponentToRewardSnapshot[_token][epochExponent];
    _snapshot.timestamp = uint64(block.timestamp);
    // @note usually `_amount <= 10^6 * 10^18` and `magnitude <= 10^18`,
    // so the value of `_amount * REWARD_PRECISION` won't exceed type(uint192).max.
    // For the other parts, we rely on the overflow check provided by solc 0.8.
    _snapshot.integral += uint192((_amount * REWARD_PRECISION) / totalShare) * uint192(magnitude);
    epochToExponentToRewardSnapshot[_token][epochExponent] = _snapshot;
  }

  /// @dev Internal function to get the total pool shares.
  function _getTotalPoolShare() internal view virtual returns (uint112 currentProd, uint256 totalShare);

  /// @dev Internal function to get the amount of user shares.
  ///
  /// @param _account The address of user to query.
  function _getUserPoolShare(address _account) internal view virtual returns (uint112 previousProd, uint256 share);
}
