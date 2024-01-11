// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { IFxBoostableRebalancePool } from "./IFxBoostableRebalancePool.sol";

interface IFxShareableRebalancePool is IFxBoostableRebalancePool {
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
  error ErrorSelfSharingIsNotAllowed();

  /// @dev Thrown when a staker with shared votes try to share its votes to others.
  error ErrorCascadedSharingIsNotAllowed();

  /// @dev Thrown when staker try to accept non-allowed vote sharing.
  error ErrorVoteShareNotAllowed();

  /// @dev Thrown when staker try to reject a non-existed vote sharing.
  error ErrorNoAcceptedSharedVote();

  /// @dev Thrown when the staker has ability to share ve balance.
  error ErrorVoteOwnerCannotStake();

  /// @dev Thrown when staker try to accept twice.
  error ErrorRepeatAcceptSharedVote();

  /*************************
   * Public View Functions *
   *************************/

  /// @notice Return the owner of votes of some staker.
  /// @param account The address of user to query.
  function getStakerVoteOwner(address account) external view returns (address);

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @notice Withdraw asset from this contract on behalf of someone
  function withdrawFrom(
    address owner,
    uint256 amount,
    address receiver
  ) external;

  /// @notice Owner changes the vote sharing state for some user.
  /// @param staker The address of user to change.
  function toggleVoteSharing(address staker) external;

  /// @notice Staker accepts the vote sharing.
  /// @param newOwner The address of the owner of the votes.
  function acceptSharedVote(address newOwner) external;

  /// @notice Staker reject the current vote sharing.
  function rejectSharedVote() external;
}
