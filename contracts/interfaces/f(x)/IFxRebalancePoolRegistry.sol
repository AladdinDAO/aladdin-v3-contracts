// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

interface IFxRebalancePoolRegistry {
  /// @notice Return the address list of all registered RebalancePool.
  function getPools() external view returns (address[] memory pools);

  /// @notice Return the total amount of asset managed by all registered RebalancePool.
  function totalSupply() external view returns (uint256);
}
