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
  function pendingRewards() external view returns (uint256);

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @notice Deposit new rewards to this contract.
  ///
  /// @param amount The amount of new rewards.
  function depositReward(uint256 amount) external;
}
