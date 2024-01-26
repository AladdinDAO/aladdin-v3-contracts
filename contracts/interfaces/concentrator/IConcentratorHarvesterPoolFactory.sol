// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

interface IConcentratorHarvesterPoolFactory {
  /**********
   * Events *
   **********/

  /// @notice Emitted when a new pool is created.
  /// @param index The index of the new pool.
  /// @param asset The address of asset managed by the pool.
  /// @param pool The address of the new pool.
  event NewPool(uint256 indexed index, address indexed asset, address indexed pool);

  /**********
   * Errors *
   **********/

  /// @dev Thrown when try to create a pool with the same asset.
  error ErrorPoolForAssetExisted();

  /// @dev Thrown when the given address if zero.
  error ErrorZeroAddress();

  /*************************
   * Public View Functions *
   *************************/

  /// @notice Return the name of the factory.
  function name() external view returns (string memory);

  /// @notice Return all the pools created by the factory.
  function getAllPools() external view returns (address[] memory pools);

  /// @notice Return the address of pool by the given index.
  function getPoolByIndex(uint256 index) external view returns (address pool);

  /// @notice Return the address of pool by the given asset.
  function getPoolByAsset(address asset) external view returns (address pool);
}
