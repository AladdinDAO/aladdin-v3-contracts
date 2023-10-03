// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

interface IMultipleRewardDistributor {
  /**********
   * Events *
   **********/

  /// @notice Emitted when new reward token is registered.
  ///
  /// @param token The address of reward token.
  /// @param distributor The address of reward distributor.
  event RegisterRewardToken(address indexed token, address indexed distributor);

  /// @notice Emitted when the reward distributor is updated.
  ///
  /// @param token The address of reward token.
  /// @param oldDistributor The address of previous reward distributor.
  /// @param newDistributor The address of current reward distributor.
  event UpdateRewardDistributor(address indexed token, address indexed oldDistributor, address indexed newDistributor);

  /// @notice Emitted when a reward token is unregistered.
  ///
  /// @param token The address of reward token.
  event UnregisterRewardToken(address indexed token);

  /// @notice Emitted when a reward token is deposited.
  ///
  /// @param token The address of reward token.
  /// @param amount The amount of reward token deposited.
  event DepositReward(address indexed token, uint256 amount);

  /**********
   * Errors *
   **********/

  /// @dev Thrown when caller access an unactive reward token.
  error NotActiveRewardToken();

  /// @dev Thrown when the address of reward distributor is `address(0)`.
  error RewardDistributorIsZero();

  /// @dev Thrown when caller is not reward distributor.
  error NotRewardDistributor();

  /// @dev Thrown when caller try to register an existing reward token.
  error DuplicatedRewardToken();

  /// @dev Thrown when caller try to unregister a reward with pending rewards.
  error RewardDistributionNotFinished();

  /*************************
   * Public View Functions *
   *************************/

  /// @notice Return the address of reward distributor.
  ///
  /// @param token The address of reward token.
  function distributors(address token) external view returns (address);

  /// @notice Return the list of active reward tokens.
  function getActiveRewardTokens() external view returns (address[] memory);

  /// @notice Return the list of historical reward tokens.
  function getHistoricalRewardTokens() external view returns (address[] memory);

  /// @notice Return the amount of pending distributed rewards in current period.
  ///
  /// @param token The address of reward token.
  /// @return distributable The amount of reward token can be distributed in current period.
  /// @return undistributed The amount of reward token still locked in current period.
  function pendingRewards(address token) external view returns (uint256 distributable, uint256 undistributed);

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @notice Deposit new rewards to this contract.
  ///
  /// @param token The address of reward token.
  /// @param amount The amount of new rewards.
  function depositReward(address token, uint256 amount) external;
}
