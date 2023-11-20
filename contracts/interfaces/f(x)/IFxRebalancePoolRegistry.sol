// SPDX-License-Identifier: MIT

pragma solidity ^0.7.0 || ^0.8.0;

interface IFxRebalancePoolRegistry {
  /**********
   * Events *
   **********/

  /// @notice Emitted when a new rebalance pool is added.
  /// @param pool The address of the rebalance pool.
  event RegisterPool(address indexed pool);

  /// @notice Emitted when an exsited rebalance pool is removed.
  /// @param pool The address of the rebalance pool.
  event DeregisterPool(address indexed pool);

  /*************************
   * Public View Functions *
   *************************/

  /// @notice Return the address list of all registered RebalancePool.
  function getPools() external view returns (address[] memory pools);

  /// @notice Return the total amount of asset managed by all registered RebalancePool.
  function totalSupply() external view returns (uint256);
}
