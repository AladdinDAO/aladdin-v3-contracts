// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

interface IVotingEscrowHelper {
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
  function checkpoint(address account) external;
}
