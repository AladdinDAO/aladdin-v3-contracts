// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

// solhint-disable func-name-mixedcase
// solhint-disable var-name-mixedcase

interface ICurveProposalVoting {
  /**
   * @notice Vote a percentage value in favor of a vote
   * @dev Initialization check is implicitly provided by `voteExists()` as new votes can only be
   *      created via `newVote(),` which requires initialization
   * @param _voteData Packed vote data containing both voteId and the vote in favor percentage (where 0 is no, and 1e18 is yes)
   *          Vote data packing
   * |  yeaPct  |  nayPct  |   voteId  |
   * |  64b     |  64b     |   128b    |
   * @param _supports Whether voter supports the vote (preserved for backward compatibility purposes)
   * @param _executesIfDecided Whether the vote should execute its action if it becomes decided
   */
  function vote(
    uint256 _voteData,
    bool _supports,
    bool _executesIfDecided
  ) external;

  /**
   * @dev Return all information for a vote by its ID
   * @param _voteId Vote identifier
   * @return open open status
   * @return executed executed status
   * @return startDate start date
   * @return snapshotBlock snapshot block
   * @return supportRequired support required
   * @return minAcceptQuorum minimum acceptance quorum
   * @return yea yeas amount
   * @return nay nays amount
   * @return votingPower power
   * @return script script
   */
  function getVote(uint256 _voteId)
    external
    view
    returns (
      bool open,
      bool executed,
      uint64 startDate,
      uint64 snapshotBlock,
      uint64 supportRequired,
      uint64 minAcceptQuorum,
      uint256 yea,
      uint256 nay,
      uint256 votingPower,
      bytes memory script
    );
}
