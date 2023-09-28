// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { IERC4626Upgradeable } from "@openzeppelin/contracts-upgradeable-v4/interfaces/IERC4626Upgradeable.sol";

import { IRewardDistributor } from "../../common/rewards/distributor/IRewardDistributor.sol";
import { IConcentratorBase } from "./IConcentratorBase.sol";

interface IConcentratorCompounder is IERC4626Upgradeable, IConcentratorBase, IRewardDistributor {
  /**********
   * Events *
   **********/

  /// @notice Emitted when pool assets migrated.
  ///
  /// @param oldStrategy The address of old strategy.
  /// @param newStrategy The address of current strategy.
  event Migrate(address indexed oldStrategy, address indexed newStrategy);

  /// @notice Emitted when someone harvests pending rewards.
  /// @param caller The address who call the function.
  /// @param receiver The address of account to recieve the harvest bounty.
  /// @param assets The total amount of underlying asset harvested.
  /// @param performanceFee The amount of harvested assets as performance fee.
  /// @param harvesterBounty The amount of harvested assets as harvester bounty.
  event Harvest(
    address indexed caller,
    address indexed receiver,
    uint256 assets,
    uint256 performanceFee,
    uint256 harvesterBounty
  );

  /**********
   * Errors *
   **********/

  /// @dev Thrown when user try to withdraw assets more than the total assets.
  error WithdrawExceedTotalAssets();

  /// @dev Thrown when user try to redeem shares more than the total supply.
  error RedeemExceedTotalSupply();

  /// @dev Thrown when the harvested assets is not enough compared to off-chain computation.
  error InsufficientHarvestedAssets();

  /// @dev Thrown when try to migrate to a zero strategy contract.
  error StrategyIsZero();

  /*************************
   * Public View Functions *
   *************************/

  /// @notice Return the address of underlying strategy contract.
  function strategy() external view returns (address);

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @notice External function to force distribute pending reward.
  function checkpoint() external;

  /// @notice Harvest rewards and convert to underlying asset.
  ///
  /// @param receiver The address of account to recieve the harvest bounty.
  /// @param minAssets The minimum amount of underlying asset harvested.
  /// @return assets The total amount of underlying asset harvested.
  function harvest(address receiver, uint256 minAssets) external returns (uint256 assets);

  /// @notice Migrate pool assets to new strategy.
  /// @param newStrategy The address of new strategy.
  function migrateStrategy(address newStrategy) external;
}
