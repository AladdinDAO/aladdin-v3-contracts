// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

interface IRewardDistributor {
  /**********
   * Events *
   **********/

  /// @notice Emitted when a reward token is deposited.
  ///
  /// @param amount The amount of reward token deposited.
  event DepositReward(uint256 amount);

  /*************************
   * Public View Functions *
   *************************/

  /// @notice Return the address of reward token.
  function rewardToken() external view returns (address);

  /// @notice Return the amount of pending distributed rewards in current period.
  /// @return distributable The amount of reward token can be distributed in current period.
  /// @return undistributed The amount of reward token still locked in current period.
  function pendingRewards() external view returns (uint256 distributable, uint256 undistributed);

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @notice Deposit new rewards to this contract.
  ///
  /// @param amount The amount of new rewards.
  function depositReward(uint256 amount) external;
}
