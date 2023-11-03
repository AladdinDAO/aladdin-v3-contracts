// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { ILiquidityGauge } from "./ILiquidityGauge.sol";

interface ISharedLiquidityGauge is ILiquidityGauge {
  /**********
   * Events *
   **********/

  /// @notice Emitted when one user share votes to another user.
  /// @param owner The address of votes owner.
  /// @param staker The address of staker to share votes.
  event ShareVote(address indexed owner, address indexed staker);

  /// @notice Emitted when the owner cancel sharing to some staker.
  /// @param owner The address of votes owner.
  /// @param staker The address of staker to cancel votes share.
  event CancelShareVote(address indexed owner, address indexed staker);

  /// @notice Emitted when staker accept the vote sharing.
  /// @param staker The address of the staker.
  /// @param oldOwner The address of the previous vote sharing owner.
  /// @param newOwner The address of the current vote sharing owner.
  event AcceptSharedVote(address indexed staker, address indexed oldOwner, address indexed newOwner);

  /**********
   * Errors *
   **********/

  /// @dev Thrown when caller shares votes to self.
  error SelfSharingIsNotAllowed();

  /// @dev Thrown when a staker with shared votes try to share its votes to others.
  error CascadedSharingIsNotAllowed();

  /// @dev Thrown when staker try to accept non-allowed vote sharing.
  error VoteShareNotAllowed();

  /// @dev Thrown when staker try to reject a non-existed vote sharing.
  error NoAcceptedSharedVote();

  /*************************
   * Public View Functions *
   *************************/

  /// @notice Return the total amount of liquidity shared.
  /// @param account The address of user to query.
  function sharedBalanceOf(address account) external view returns (uint256);

  /// @notice Return the owner of votes of some staker.
  /// @param account The address of user to query.
  function getStakerVoteOwner(address account) external view returns (address);

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @notice Owner changes the vote sharing state for some user.
  /// @param staker The address of user to change.
  function toggleVoteSharing(address staker) external;

  /// @notice Staker accepts the vote sharing.
  /// @param newOwner The address of the owner of the votes.
  function acceptSharedVote(address newOwner) external;

  /// @notice Staker reject the current vote sharing.
  function rejectSharedVote() external;
}
