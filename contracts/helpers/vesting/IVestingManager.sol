// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

interface IVestingManager {
  /*************************
   * Public View Functions *
   *************************/

  /// @notice Return the address of the original token.
  function originalToken() external view returns (address);

  /// @notice Return the address of the managed token.
  function managedToken() external view returns (address);

  /// @notice Return the balance of managed token of the given proxy.
  /// @param proxy The address of proxy to query.
  function balanceOf(address proxy) external view returns (uint256);

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @notice Manage several original token. The original token will be converted to managed token.
  ///
  /// @dev This is designed to be delegatecalled and assume the original token is already in this contract.
  ///
  /// @param amount The amount of original token to manage.
  /// @param receiver The designed reward token receiver.
  function manage(uint256 amount, address receiver) external;

  /// @notice Withdraw some managed token.
  ///
  /// @dev This is designed to be delegatecalled.
  ///
  /// @param amount The amount of mananged token to withdraw.
  /// @param receiver The address of recipient of the managed token.
  function withdraw(uint256 amount, address receiver) external;

  /// @notice Claim pending rewards.
  ///
  /// @dev This is designed to be delegatecalled.
  ///
  /// @param receiver The designed reward token receiver.
  function getReward(address receiver) external;
}
