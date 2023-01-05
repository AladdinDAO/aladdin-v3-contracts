// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

// solhint-disable func-name-mixedcase
// solhint-disable var-name-mixedcase

interface ICurveVoteEscrow {
  /// @notice Deposit `_value` tokens for `msg.sender` and lock until `_unlock_time`
  /// @param _value Amount to deposit
  /// @param _unlock_time Epoch time when tokens unlock, rounded down to whole weeks
  function create_lock(uint256 _value, uint256 _unlock_time) external;

  /// @notice Deposit `_value` additional tokens for `msg.sender` without modifying the unlock time
  /// @param _value Amount of tokens to deposit and add to the lock
  function increase_amount(uint256 _value) external;

  /// @notice Extend the unlock time for `msg.sender` to `_unlock_time`
  /// @param _unlock_time New epoch time for unlocking
  function increase_unlock_time(uint256 _unlock_time) external;

  /// @notice Withdraw all tokens for `msg.sender`
  /// @dev Only possible if the lock has expired
  function withdraw() external;
}
