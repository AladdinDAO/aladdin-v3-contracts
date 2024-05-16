// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

// solhint-disable func-name-mixedcase

interface IFeeDistributor {
  /// @notice Update the token checkpoint
  /// @dev Calculates the total number of tokens to be distributed in a given week.
  ///      During setup for the initial distribution this function is only callable
  ///      by the contract owner. Beyond initial distro, it can be enabled for anyone
  ///      to call.
  function checkpoint_token() external;

  /// @notice Commit transfer of ownership
  /// @param _addr New admin address
  function commit_admin(address _addr) external;

  /// @notice Apply transfer of ownership
  function apply_admin() external;

  /// @notice Toggle permission for checkpointing by any account
  function toggle_allow_checkpoint_token() external;

  /// @notice Kill the contract
  /// @dev Killing transfers the entire 3CRV balance to the emergency return address
  ///      and blocks the ability to claim or burn. The contract cannot be unkilled.
  function kill_me() external;

  /// @notice Recover ERC20 tokens from this contract
  /// @dev Tokens are sent to the emergency return address.
  /// @param _coin Token address
  /// @return bool success
  function recover_balance(address _coin) external returns (bool);
}
