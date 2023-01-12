// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;
pragma abicoder v2;

interface IPitchIncentivesStash {
  struct ClaimData {
    address token;
    uint256 index;
    uint256 amount;
    bytes32[] merkleProof;
  }

  // Stash state
  // Merkle root for each reward token
  function merkleRoot(address token) external returns (address);

  // Current claim period for each reward token
  function claimPeriod(address token) external view returns (uint256);

  function isClaimed(address _token, uint256 _index) external view returns (bool);

  function claim(
    address _token,
    uint256 _index,
    address _account,
    uint256 _amount,
    bytes32[] calldata _merkleProof
  ) external;

  function claimMulti(address _account, ClaimData[] calldata claims) external;
}
