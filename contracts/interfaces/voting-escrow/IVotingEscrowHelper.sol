// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

interface IVotingEscrowHelper {
  /**********
   * Errors *
   **********/

  /// @dev Thrown when try to checkpoint a future timestamp.
  error ErrorCheckpointFutureTime();

  /// @dev Thrown when try to checkpoint a timestamp before start.
  error ErrorCheckpointInvalidPastTime();

  /*************************
   * Public View Functions *
   *************************/

  /// @notice Return the ve total supply at some specific time point.
  /// @param timestamp The time point in second to query.
  function totalSupply(uint256 timestamp) external view returns (uint256);

  /// @notice Return the ve balance of some user at some specific time point.
  /// @param account The address of user to query.
  /// @param timestamp The time point in second to query.
  function balanceOf(address account, uint256 timestamp) external view returns (uint256);

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @notice Snapshot the state of some user.
  /// @param account The address of user to checkpoint.
  function checkpoint(address account) external;

  /// @notice Snapshot the state of some user.
  /// @param account The address of user to checkpoint.
  /// @param timestamp The timestamp to checkpoint, should not less than current timestamp.
  function checkpoint(address account, uint256 timestamp) external;
}
