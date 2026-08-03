// SPDX-License-Identifier: MIT

pragma solidity ^0.7.0 || ^0.8.0;

interface IStakeDAOVlBoost {
  /// @notice Create a boost delegation from delegator to recipient.
  /// @dev Flat boost model: exact amount delegated, expires at week-aligned endtime.
  /// @param delegator Address delegating boost (must be msg.sender or approved operator).
  /// @param amount Amount of boost to delegate.
  /// @param endtime Expiry timestamp (will be rounded down to week boundary).
  /// @param recipient Address receiving the delegated boost.
  function boost(
    address delegator,
    uint256 amount,
    uint256 endtime,
    address recipient
  ) external;

  /// @notice Checkpoint a user's delegated and received balances.
  /// @dev Updates storage with current balances after processing expirations.
  /// @param user The user address to checkpoint.
  function checkpointUser(address user) external;

  /// @notice Get delegable balance (boost minus active delegations).
  /// @param account The account to check.
  /// @return Available boost that can be delegated.
  function delegableBalance(address account) external view returns (uint256);
}
