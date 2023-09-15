// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

interface IMultipleRewardAccumulator {
  /**********
   * Events *
   **********/

  /// @notice Emitted when user claim pending rewards.
  /// @param account The address of user.
  /// @param token The address of token claimed.
  /// @param amount The amount of token claimed.
  event Claim(address indexed account, address indexed token, uint256 amount);

  /**********
   * Errors *
   **********/

  /// @dev Thrown when caller claim others reward to another user.
  error ClaimOthersRewardToAnother();

  /*************************
   * Public View Functions *
   *************************/

  /// @notice Get the amount of pending rewards.
  /// @param account The address of user to query.
  /// @param token The address of reward token to query.
  /// @return amount The amount of pending rewards.
  function claimable(address account, address token) external view returns (uint256 amount);

  /****************************
   * Public Mutated Functions *
   ****************************/

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
