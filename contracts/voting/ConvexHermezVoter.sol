// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import { AccessControl } from "@openzeppelin/contracts/access/AccessControl.sol";

import { IConvexGaugeVotePlatform } from "../interfaces/convex/IConvexGaugeVotePlatform.sol";

contract ConvexHermezVoter is AccessControl {
  /*************
   * Constants *
   *************/

  /// @notice The role for voter.
  bytes32 public constant VOTER_ROLE = keccak256("VOTER_ROLE");

  /// @notice The address of CLeverCVXLocker contract in Ethereum.
  address public immutable locker;

  /// @notice The address of Convex GaugeVotePlatform contract in L2.
  address public immutable votePlatform;

  /*************
   * Modifiers *
   *************/

  modifier onlyVoterRole() {
    require(hasRole(VOTER_ROLE, msg.sender), "not voter");
    _;
  }

  /***************
   * Constructor *
   ***************/

  constructor(address _locker, address _votePlatform) {
    locker = _locker;
    votePlatform = _votePlatform;

    _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
  }

  /*************************
   * Public View Functions *
   *************************/

  function getVote(uint256 _proposalId)
    external
    view
    returns (
      address[] memory gauges,
      uint256[] memory weights,
      bool voted,
      uint256 baseWeight,
      int256 adjustedWeight
    )
  {
    (gauges, weights, voted, baseWeight, adjustedWeight) = IConvexGaugeVotePlatform(votePlatform).getVote(
      _proposalId,
      locker
    );
  }

  /****************************
   * Public Mutated Functions *
   ****************************/

  function vote(address[] calldata _gauges, uint256[] calldata _weights) external onlyVoterRole {
    IConvexGaugeVotePlatform(votePlatform).vote(locker, _gauges, _weights);
  }

  function voteWithProofs(
    address[] calldata _gauges,
    uint256[] calldata _weights,
    bytes32[] calldata proofs,
    uint256 _baseWeight,
    int256 _adjustedWeight,
    address _delegate
  ) external onlyVoterRole {
    IConvexGaugeVotePlatform(votePlatform).voteWithProofs(
      locker,
      _gauges,
      _weights,
      proofs,
      _baseWeight,
      _adjustedWeight,
      _delegate
    );
  }

  function supplyProofs(
    bytes32[] calldata proofs,
    uint256 _baseWeight,
    int256 _adjustedWeight,
    address _delegate
  ) external onlyVoterRole {
    IConvexGaugeVotePlatform(votePlatform).supplyProofs(locker, proofs, _baseWeight, _adjustedWeight, _delegate);
  }

  /************************
   * Restricted Functions *
   ************************/

  /// @notice Emergency function
  function execute(
    address _to,
    uint256 _value,
    bytes calldata _data
  ) external returns (bool, bytes memory) {
    require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "only admin");

    (bool success, bytes memory result) = _to.call{ value: _value }(_data);
    return (success, result);
  }
}
