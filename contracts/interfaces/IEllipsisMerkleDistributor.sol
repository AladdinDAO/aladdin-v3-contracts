// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

interface IEllipsisMerkleDistributor {
  function claim(
    uint256 merkleIndex,
    uint256 index,
    uint256 amount,
    bytes32[] calldata merkleProof
  ) external;
}
