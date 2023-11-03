// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { AccessControlUpgradeable } from "@openzeppelin/contracts-upgradeable-v4/access/AccessControlUpgradeable.sol";
import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable-v4/token/ERC20/IERC20Upgradeable.sol";
import { SafeERC20Upgradeable } from "@openzeppelin/contracts-upgradeable-v4/token/ERC20/utils/SafeERC20Upgradeable.sol";

import { IRewardDistributor } from "./IRewardDistributor.sol";
import { LinearReward } from "./LinearReward.sol";

// solhint-disable not-rely-on-time

abstract contract LinearRewardDistributor is AccessControlUpgradeable, IRewardDistributor {
  using SafeERC20Upgradeable for IERC20Upgradeable;

  using LinearReward for LinearReward.RewardData;

  /*************
   * Constants *
   *************/

  /// @notice The role used to deposit rewards.
  bytes32 public constant REWARD_DEPOSITOR_ROLE = keccak256("REWARD_DEPOSITOR_ROLE");

  /// @notice The length of reward period in seconds.
  /// @dev If the value is zero, the reward will be distributed immediately.
  /// It is either zero or at least 1 day (which is 86400).
  uint40 public immutable periodLength;

  /*************
   * Variables *
   *************/

  /// @notice The linear distribution reward data.
  LinearReward.RewardData public rewardData;

  /// @inheritdoc IRewardDistributor
  address public override rewardToken;

  /// @dev reserved slots.
  uint256[48] private __gap;

  /***************
   * Constructor *
   ***************/

  constructor(uint40 _periodLength) {
    require(_periodLength == 0 || (_periodLength >= 1 days && _periodLength <= 28 days), "invalid period length");

    periodLength = _periodLength;
  }

  // solhint-disable-next-line func-name-mixedcase
  function __LinearRewardDistributor_init(address _rewardToken) internal onlyInitializing {
    rewardToken = _rewardToken;
  }

  /*************************
   * Public View Functions *
   *************************/

  /// @inheritdoc IRewardDistributor
  function pendingRewards() external view override returns (uint256, uint256) {
    return rewardData.pending();
  }

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @inheritdoc IRewardDistributor
  function depositReward(uint256 _amount) external override onlyRole(REWARD_DEPOSITOR_ROLE) {
    if (_amount > 0) {
      IERC20Upgradeable(rewardToken).safeTransferFrom(msg.sender, address(this), _amount);
    }

    _distributePendingReward();

    _notifyReward(_amount);

    emit DepositReward(_amount);
  }

  /**********************
   * Internal Functions *
   **********************/

  /// @dev Internal function to notify new rewards.
  ///
  /// @param _amount The amount of new rewards.
  function _notifyReward(uint256 _amount) internal {
    if (periodLength == 0) {
      _accumulateReward(_amount);
    } else {
      LinearReward.RewardData memory _data = rewardData;
      _data.increase(periodLength, _amount);
      rewardData = _data;
    }
  }

  /// @dev Internal function to distribute all pending reward tokens.
  function _distributePendingReward() internal {
    if (periodLength == 0) return;

    (uint256 _pending, ) = rewardData.pending();
    rewardData.lastUpdate = uint40(block.timestamp);

    if (_pending > 0) {
      _accumulateReward(_pending);
    }
  }

  /// @dev Internal function to accumulate distributed rewards.
  ///
  /// @param _amount The amount of rewards to accumulate.
  function _accumulateReward(uint256 _amount) internal virtual;
}
