// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

// solhint-disable func-name-mixedcase

interface IVotingEscrow {
  /// @notice Deposit `value` tokens for `msg.sender` and lock until `unlock_time`
  ///
  /// @param value Amount to deposit
  /// @param unlock_time Epoch time when tokens unlock, rounded down to whole weeks
  function create_lock(uint256 value, uint256 unlock_time) external;

  function token() external view returns (address);

  function user_point_epoch(address addr) external view returns (uint256);

  function locked__end(address addr) external view returns (uint256);

  function user_point_history__ts(address addr, uint256 epoch) external view returns (uint256);

  function totalSupply() external view returns (uint256);

  function balanceOf(address addr) external view returns (uint256);
}
