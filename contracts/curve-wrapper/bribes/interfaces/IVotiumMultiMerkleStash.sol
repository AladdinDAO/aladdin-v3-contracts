// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;
pragma abicoder v2;

interface IVotiumMultiMerkleStash {
  struct ClaimParam {
    address token;
    uint256 index;
    uint256 amount;
    bytes32[] merkleProof;
  }

  function merkleRoot(address token) external returns (address);

  function update(address token) external view returns (uint256);

  function isClaimed(address token, uint256 index) external view returns (bool);

  function claim(
    address token,
    uint256 index,
    address account,
    uint256 amount,
    bytes32[] calldata merkleProof
  ) external;

  function claimMulti(address account, ClaimParam[] calldata claims) external;
}
