// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

interface IConvexGaugeVotePlatform {
  function getVote(uint256 _proposalId, address _user)
    external
    view
    returns (
      address[] memory gauges,
      uint256[] memory weights,
      bool voted,
      uint256 baseWeight,
      int256 adjustedWeight
    );

  function vote(
    address _account,
    address[] calldata _gauges,
    uint256[] calldata _weights
  ) external;

  function voteWithProofs(
    address _account,
    address[] calldata _gauges,
    uint256[] calldata _weights,
    bytes32[] calldata proofs,
    uint256 _baseWeight,
    int256 _adjustedWeight,
    address _delegate
  ) external;

  function supplyProofs(
    address _account,
    bytes32[] calldata proofs,
    uint256 _baseWeight,
    int256 _adjustedWeight,
    address _delegate
  ) external;
}
