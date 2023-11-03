// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { SafeCastUpgradeable } from "@openzeppelin/contracts-upgradeable-v4/utils/math/SafeCastUpgradeable.sol";

// solhint-disable not-rely-on-time

library LinearReward {
  using SafeCastUpgradeable for uint256;

  /// @dev Compiler will pack this into single `uint256`.
  /// Usually, we assume the amount of rewards won't exceed `uint96.max`.
  /// In such case, the rate won't exceed `uint80.max`, since `periodLength` is at least `86400`.
  /// Also `uint40.max` is enough for timestamp, which is about 30000 years.
  struct RewardData {
    // The amount of rewards pending to distribute.
    uint96 queued;
    // The current reward rate per second.
    uint80 rate;
    // The last timestamp when the reward is distributed.
    uint40 lastUpdate;
    // The timestamp when this period will finish.
    uint40 finishAt;
  }

  /// @dev Add new rewards to current one. It is possible that the rewards will not distribute immediately.
  /// The rewards will be only distributed when current period is end or the current increase or
  /// decrease no more than 10%.
  ///
  /// @param _data The struct of reward data, will be modified inplace.
  /// @param _periodLength The length of a period, caller should make sure it is at least `86400`.
  /// @param _amount The amount of new rewards to distribute.
  function increase(
    RewardData memory _data,
    uint256 _periodLength,
    uint256 _amount
  ) internal view {
    _amount = _amount + _data.queued;
    _data.queued = 0;

    if (block.timestamp >= _data.finishAt) {
      // period finished, distribute to next period
      _data.rate = (_amount / _periodLength).toUint80();
      _data.queued = uint96(_amount - (_data.rate * _periodLength)); // keep rounding error
      _data.lastUpdate = uint40(block.timestamp);
      _data.finishAt = uint40(block.timestamp + _periodLength);
    } else {
      uint256 _elapsed = block.timestamp - (_data.finishAt - _periodLength);
      uint256 _distributed = uint256(_data.rate) * _elapsed;
      if (_distributed * 9 <= _amount * 10) {
        // APR increase or drop no more than 10%, distribute
        _amount = _amount + uint256(_data.rate) * (_data.finishAt - _data.lastUpdate);
        _data.rate = (_amount / _periodLength).toUint80();
        _data.queued = uint96(_amount - (_data.rate * _periodLength)); // keep rounding error
        _data.lastUpdate = uint40(block.timestamp);
        _data.finishAt = uint40(block.timestamp + _periodLength);
        _data.lastUpdate = uint40(block.timestamp);
      } else {
        // APR drop more than 10%, wait for more rewards
        _data.queued = _amount.toUint96();
      }
    }
  }

  /// @dev Return the amount of pending distributed rewards in current period.
  ///
  /// @param _data The struct of reward data.
  function pending(RewardData memory _data) internal view returns (uint256, uint256) {
    uint256 _elapsed;
    uint256 _left;
    if (block.timestamp > _data.finishAt) {
      // finishAt >= lastUpdate will happen, if `_notifyReward` is not called during current period.
      _elapsed = _data.finishAt >= _data.lastUpdate ? _data.finishAt - _data.lastUpdate : 0;
    } else {
      unchecked {
        _elapsed = block.timestamp - _data.lastUpdate;
        _left = uint256(_data.finishAt) - block.timestamp;
      }
    }

    return (uint256(_data.rate) * _elapsed, uint256(_data.rate) * _left);
  }
}
