// SPDX-License-Identifier: MIT

pragma solidity ^0.7.0 || ^0.8.0;
pragma abicoder v2;

interface IMultiMerkleDistributor {
  // Struct ClaimParams
  struct ClaimParams {
    uint256 questID;
    uint256 period;
    uint256 index;
    uint256 amount;
    bytes32[] merkleProof;
  }

  /** @notice Mapping listing the reward token associated to each Quest ID */
  // QuestID => reward token
  function questRewardToken(uint256 questID) external view returns (address);

  /**
   * @notice Checks if the rewards were claimed for a user on a given period
   * @dev Checks if the rewards were claimed for a user (based on the index) on a given period
   * @param questID ID of the Quest
   * @param period Amount of underlying to borrow
   * @param index Index of the claim
   * @return bool : true if already claimed
   */
  function isClaimed(
    uint256 questID,
    uint256 period,
    uint256 index
  ) external view returns (bool);

  //Basic Claim
  /**
   * @notice Claims the reward for a user for a given period of a Quest
   * @dev Claims the reward for a user for a given period of a Quest if the correct proof was given
   * @param questID ID of the Quest
   * @param period Timestamp of the period
   * @param index Index in the Merkle Tree
   * @param account Address of the user claiming the rewards
   * @param amount Amount of rewards to claim
   * @param merkleProof Proof to claim the rewards
   */
  function claim(
    uint256 questID,
    uint256 period,
    uint256 index,
    address account,
    uint256 amount,
    bytes32[] calldata merkleProof
  ) external;

  //Multi Claim
  /**
   * @notice Claims multiple rewards for a given list
   * @dev Calls the claim() method for each entry in the claims array
   * @param account Address of the user claiming the rewards
   * @param claims List of ClaimParams struct data to claim
   */
  function multiClaim(address account, ClaimParams[] calldata claims) external;

  //FullQuest Claim (form of Multi Claim but for only one Quest => only one ERC20 transfer)
  //Only works for the given periods (in ClaimParams) for the Quest. Any omitted period will be skipped
  /**
   * @notice Claims the reward for all the given periods of a Quest, and transfer all the rewards at once
   * @dev Sums up all the rewards for given periods of a Quest, and executes only one transfer
   * @param account Address of the user claiming the rewards
   * @param questID ID of the Quest
   * @param claims List of ClaimParams struct data to claim
   */
  function claimQuest(
    address account,
    uint256 questID,
    ClaimParams[] calldata claims
  ) external;
}
