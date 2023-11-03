// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { EnumerableSet } from "@openzeppelin/contracts/utils/EnumerableSet.sol";

import { IRebalancePool } from "./interfaces/IRebalancePool.sol";
import { IRebalancePoolRegistry } from "./interfaces/IRebalancePoolRegistry.sol";

contract RebalancePoolRegistry is Ownable, IRebalancePoolRegistry {
  using EnumerableSet for EnumerableSet.AddressSet;

  /// @dev The list of registered RebalancePool.
  EnumerableSet.AddressSet private pools;

  /// @inheritdoc IRebalancePoolRegistry
  function getPools() external view override returns (address[] memory _pools) {
    uint256 _length = pools.length();
    _pools = new address[](_length);
    for (uint256 i = 0; i < _length; i++) {
      _pools[i] = pools.at(i);
    }
  }

  /// @inheritdoc IRebalancePoolRegistry
  function totalSupply() external view override returns (uint256) {
    uint256 _length = pools.length();
    uint256 _totalSupply;
    for (uint256 i = 0; i < _length; i++) {
      address _pool = pools.at(i);
      _totalSupply += IRebalancePool(_pool).totalSupply();
    }
    return _totalSupply;
  }

  /************************
   * Restricted Functions *
   ************************/

  /// @notice Add a RebalancePool to the list.
  /// @param _pool The address of RebalancePool to add.
  function registerRebalancePool(address _pool) external onlyOwner {
    require(pools.add(_pool), "pool already registered");
  }

  /// @notice Remove an exsiting RebalancePool.
  /// @param _pool The address of RebalancePool to remove.
  function deregisterRebalancePool(address _pool) external onlyOwner {
    require(pools.remove(_pool), "pool not registered before");
  }
}
