// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

interface IMultipleRewardAccumulator {
  /**********
   * Events *
   **********/

  /// @notice Emitted when user claim pending rewards.
  /// @param account The address of user.
  /// @param token The address of token claimed.
  /// @param receiver The address of token receiver.
  /// @param amount The amount of token claimed.
  event Claim(address indexed account, address indexed token, address indexed receiver, uint256 amount);

  /// @notice Emitted when the reward receiver is updated.
  /// @param account The address of the account.
  /// @param oldReceiver The address of the previous reward receiver.
  /// @param newReceiver The address of the current reward receiver.
  event UpdateRewardReceiver(address indexed account, address indexed oldReceiver, address indexed newReceiver);

  /**********
   * Errors *
   **********/

  /// @dev Thrown when caller claim others reward to another user.
  error ClaimOthersRewardToAnother();

  /*************************
   * Public View Functions *
   *************************/

  /// @notice The address of default reward receiver for given user.
  /// @param account The address of user to query.
  function rewardReceiver(address account) external view returns (address);

  /// @notice Get the amount of pending rewards.
  /// @param account The address of user to query.
  /// @param token The address of reward token to query.
  /// @return amount The amount of pending rewards.
  function claimable(address account, address token) external view returns (uint256 amount);

  /// @notice Get the total amount of rewards claimed from this contract.
  /// @param account The address of user to query.
  /// @param token The address of reward token to query.
  /// @return amount The amount of claimed rewards.
  function claimed(address account, address token) external view returns (uint256 amount);

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @notice Set the default reward receiver for the caller.
  /// @dev When set to address(0), rewards are sent to the caller.
  /// @param _newReceiver The new receiver address for any rewards claimed via `claim`.
  function setRewardReceiver(address _newReceiver) external;

  /// @notice Update the global and user snapshot.
  /// @param account The address of user to update.
  function checkpoint(address account) external;

  /// @notice Claim pending rewards of all active tokens for the caller.
  function claim() external;

  /// @notice Claim pending rewards of all active tokens for some user.
  /// @param account The address of the user.
  function claim(address account) external;

  /// @notice Claim pending rewards of all active tokens for the user and transfer to others.
  /// @param account The address of the user.
  /// @param receiver The address of the recipient.
  function claim(address account, address receiver) external;

  /// @notice Claim pending rewards of historical reward tokens for the caller.
  /// @param tokens The address list of historical reward tokens to claim.
  function claimHistorical(address[] memory tokens) external;

  /// @notice Claim pending rewards of historical reward tokens for some user.
  /// @param account The address of the user.
  /// @param tokens The address list of historical reward tokens to claim.
  function claimHistorical(address account, address[] memory tokens) external;
}
