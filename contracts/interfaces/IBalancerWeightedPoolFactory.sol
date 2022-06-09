// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

interface IBalancerWeightedPoolFactory {
  function create(
    string memory name,
    string memory symbol,
    address[] memory tokens,
    uint256[] memory weights,
    uint256 swapFeePercentage,
    address owner
  ) external returns (address);
}
