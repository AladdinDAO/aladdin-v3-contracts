// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

interface IVoteMarketPlatform {
  /// @notice Create a new bribe.
  /// @param gauge Address of the target gauge.
  /// @param rewardToken Address of the ERC20 used or rewards.
  /// @param numberOfPeriods Number of periods.
  /// @param maxRewardPerVote Target Bias for the Gauge.
  /// @param totalRewardAmount Total Reward Added.
  /// @param blacklist Array of addresses to blacklist.
  /// @return newBribeID of the bribe created.
  function createBribe(
    address gauge,
    address manager,
    address rewardToken,
    uint8 numberOfPeriods,
    uint256 maxRewardPerVote,
    uint256 totalRewardAmount,
    address[] calldata blacklist,
    bool upgradeable
  ) external returns (uint256 newBribeID);

  /// @notice Claim rewards for a given bribe.
  /// @param bribeId ID of the bribe.
  /// @return Amount of rewards claimed.
  function claimFor(address user, uint256 bribeId) external returns (uint256);

  /// @notice Claim all rewards for multiple bribes.
  /// @param ids Array of bribe IDs to claim.
  function claimAllFor(address user, uint256[] calldata ids) external;

  /// @notice Claim rewards for a given bribe.
  /// @param bribeId ID of the bribe.
  /// @return Amount of rewards claimed.
  function claim(uint256 bribeId) external returns (uint256);

  /// @notice Claim all rewards for multiple bribes.
  /// @param ids Array of bribe IDs to claim.
  function claimAll(uint256[] calldata ids) external;

  /// @notice Update Bribe for a given id.
  /// @param bribeId ID of the bribe.
  function updateBribePeriod(uint256 bribeId) external;

  /// @notice Update multiple bribes for given ids.
  /// @param ids Array of Bribe IDs.
  function updateBribePeriods(uint256[] calldata ids) external;

  /// @notice Get an estimate of the reward amount for a given user.
  /// @param user Address of the user.
  /// @param bribeId ID of the bribe.
  /// @return amount of rewards.
  /// Mainly used for UI.
  function claimable(address user, uint256 bribeId) external view returns (uint256 amount);

  /// @notice Increase Bribe duration.
  /// @param _bribeId ID of the bribe.
  /// @param _additionnalPeriods Number of periods to add.
  /// @param _increasedAmount Total reward amount to add.
  /// @param _newMaxPricePerVote Total reward amount to add.
  function increaseBribeDuration(
    uint256 _bribeId,
    uint8 _additionnalPeriods,
    uint256 _increasedAmount,
    uint256 _newMaxPricePerVote,
    address[] calldata _addressesBlacklisted
  ) external;

  /// @notice Close Bribe if there is remaining.
  /// @param bribeId ID of the bribe to close.
  function closeBribe(uint256 bribeId) external;

  /// @notice Update Bribe Manager.
  /// @param bribeId ID of the bribe.
  /// @param newManager Address of the new manager.
  function updateManager(uint256 bribeId, address newManager) external;
}
