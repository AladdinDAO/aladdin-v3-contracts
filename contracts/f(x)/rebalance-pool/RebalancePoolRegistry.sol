// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import { Ownable2Step } from "@openzeppelin/contracts-v4/access/Ownable2Step.sol";
import { EnumerableSet } from "@openzeppelin/contracts-v4/utils/structs/EnumerableSet.sol";

import { IFxRebalancePool } from "../../interfaces/f(x)/IFxRebalancePool.sol";
import { IFxRebalancePoolRegistry } from "../../interfaces/f(x)/IFxRebalancePoolRegistry.sol";

contract RebalancePoolRegistry is Ownable2Step, IFxRebalancePoolRegistry {
  using EnumerableSet for EnumerableSet.AddressSet;

  /**********
   * Errors *
   **********/

  /// @dev Thrown when add an already added pool.
  error ErrorPoolAlreadyAdded();

  /// @dev Thrown when remove an unkown pool.
  error ErrorPoolNotAdded();

  /*************
   * Variables *
   *************/

  /// @dev The list of registered RebalancePool.
  EnumerableSet.AddressSet private pools;

  /*************************
   * Public View Functions *
   *************************/

  /// @inheritdoc IFxRebalancePoolRegistry
  function getPools() external view override returns (address[] memory _pools) {
    uint256 _length = pools.length();
    _pools = new address[](_length);
    for (uint256 i = 0; i < _length; i++) {
      _pools[i] = pools.at(i);
    }
  }

  /// @inheritdoc IFxRebalancePoolRegistry
  function totalSupply() external view override returns (uint256) {
    uint256 _length = pools.length();
    uint256 _totalSupply;
    for (uint256 i = 0; i < _length; i++) {
      address _pool = pools.at(i);
      _totalSupply += IFxRebalancePool(_pool).totalSupply();
    }
    return _totalSupply;
  }

  /************************
   * Restricted Functions *
   ************************/

  /// @notice Add a RebalancePool to the list.
  /// @param _pool The address of RebalancePool to add.
  function registerRebalancePool(address _pool) external onlyOwner {
    if (!pools.add(_pool)) revert ErrorPoolAlreadyAdded();

    emit RegisterPool(_pool);
  }

  /// @notice Remove an exsiting RebalancePool.
  /// @param _pool The address of RebalancePool to remove.
  function deregisterRebalancePool(address _pool) external onlyOwner {
    if (!pools.remove(_pool)) revert ErrorPoolNotAdded();

    emit DeregisterPool(_pool);
  }
}
