// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

// solhint-disable func-name-mixedcase

interface IVotingEscrow {
  /***********
   * Structs *
   ***********/

  struct Point {
    int128 bias;
    int128 slope;
    uint256 ts;
    uint256 blk;
  }

  /*************************
   * Public View Functions *
   *************************/

  function token() external view returns (address);

  function epoch() external view returns (uint256);

  function point_history(uint256 epoch) external view returns (Point memory);

  function user_point_epoch(address account) external view returns (uint256);

  function user_point_history(address account, uint256 epoch) external view returns (Point memory);

  /// @notice Get the timestamp for checkpoint `epoch` for `addr`
  /// @param addr User wallet address
  /// @param epoch User epoch number
  /// @return Epoch time of the checkpoint
  function user_point_history__ts(address addr, uint256 epoch) external view returns (uint256);

  /// @notice Get timestamp when `addr`'s lock finishes
  /// @param addr User wallet
  /// @return Epoch time of the lock end
  function locked__end(address addr) external view returns (uint256);

  /// @notice Calculate total voting power
  /// @dev Adheres to the ERC20 `totalSupply` interface for Aragon compatibility
  /// @return Total voting power
  function totalSupply() external view returns (uint256);

  /// @notice Get the current voting power for `msg.sender`
  /// @dev Adheres to the ERC20 `balanceOf` interface for Aragon compatibility
  /// @param addr User wallet address
  /// @return User voting power
  function balanceOf(address addr) external view returns (uint256);

  /// @notice time -> signed slope change
  function slope_changes(uint256 week) external view returns (int128);

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @notice Deposit `value` tokens for `addr` and add to the lock
  /// @dev Anyone (even a smart contract) can deposit for someone else, but
  ///      cannot extend their locktime and deposit for a brand new user
  /// @param addr User's wallet address
  /// @param value Amount to add to user's lock
  function deposit_for(address addr, uint256 value) external;

  /// @notice Deposit `value` tokens for `msg.sender` and lock until `unlock_time`
  /// @param value Amount to deposit
  /// @param unlock_time Epoch time when tokens unlock, rounded down to whole weeks
  function create_lock(uint256 value, uint256 unlock_time) external;

  /// @notice Deposit `value` additional tokens for `msg.sender`
  ///         without modifying the unlock time
  /// @param value Amount of tokens to deposit and add to the lock
  function increase_amount(uint256 value) external;

  /// @notice Extend the unlock time for `msg.sender` to `unlock_time`
  /// @param unlock_time New epoch time for unlocking
  function increase_unlock_time(uint256 unlock_time) external;

  /// @notice Withdraw all tokens for `msg.sender`
  /// @dev Only possible if the lock has expired
  function withdraw() external;

  /// @notice Record global data to checkpoint
  function checkpoint() external;
}
