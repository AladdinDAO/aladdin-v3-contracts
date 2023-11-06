// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

interface IVotingEscrowProxy {
  /**********
   * Events *
   **********/

  /// @notice Emitted when the address of VotingEscrowBoost contract is updated.
  /// @param oldVeBoost The address of previous VotingEscrowBoost contract.
  /// @param newVeBoost The address of current VotingEscrowBoost contract.
  event UpdateVeBoost(address indexed oldVeBoost, address indexed newVeBoost);

  /*************************
   * Public View Functions *
   *************************/

  /// @notice The address of VotingEscrowBoost contract.
  function veBoost() external view returns (address);

  /// @notice Return the ve balance considering delegating.
  /// @param account The address of user to query.
  function adjustedVeBalance(address account) external view returns (uint256);
}
