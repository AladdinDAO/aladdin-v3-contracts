// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable-v4/token/ERC20/IERC20Upgradeable.sol";
import { IERC20PermitUpgradeable } from "@openzeppelin/contracts-upgradeable-v4/token/ERC20/extensions/IERC20PermitUpgradeable.sol";

import { IRewardAccumulator } from "../../common/rewards/accumulator/IRewardAccumulator.sol";
import { IRewardDistributor } from "../../common/rewards/distributor/IRewardDistributor.sol";
import { IConcentratorBase } from "./IConcentratorBase.sol";

interface IConcentratorHarvesterPool is
  IERC20Upgradeable,
  IERC20PermitUpgradeable,
  IConcentratorBase,
  IRewardDistributor,
  IRewardAccumulator
{
  /**********
   * Events *
   **********/

  /// @notice Emitted when the pool active status is updated.
  ///
  /// @param caller The address fo caller.
  /// @param status The current pool active status.
  event SetIsActive(address indexed caller, bool status);

  /// @notice Emitted when pool assets migrated.
  ///
  /// @param oldStrategy The address of old strategy.
  /// @param newStrategy The address of current strategy.
  event Migrate(address indexed oldStrategy, address indexed newStrategy);

  /// @notice Emitted when owner take withdraw fee from contract.
  ///
  /// @param caller The address fo caller.
  /// @param receiver The address fo fee recipient.
  /// @param amount The amount of fee withdrawn.
  event TakeWithdrawFee(address indexed caller, address indexed receiver, uint256 amount);

  /// @notice Emitted when someone deposits asset into this contract.
  ///
  /// @param sender The address who sends underlying asset.
  /// @param owner The address who will receive the pool shares.
  /// @param assets The amount of asset deposited.
  event Deposit(address indexed sender, address indexed owner, uint256 assets);

  /// @notice Emitted when someone withdraws asset from this contract.
  ///
  /// @param sender The address who call the function.
  /// @param receiver The address who will receive the assets.
  /// @param owner The address who owns the assets.
  /// @param assets The amount of asset withdrawn.
  /// @param fee The amount of withdraw fee.
  event Withdraw(address indexed sender, address indexed receiver, address indexed owner, uint256 assets, uint256 fee);

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

  /// @dev Thrown when deposit zero amount assets.
  error ErrorDepositZeroAssets();

  /// @dev Thrown when withdraw zero amount assets.
  error ErrorWithdrawZeroAssets();

  /// @dev Thrown when the harvested assets is not enough compared to off-chain computation.
  error ErrorInsufficientHarvestedAssets();

  /// @dev Thrown when try to migrate to a zero strategy contract.
  error ErrorStrategyIsZero();

  /// @dev Thrown when the incentive ratio exceeds `MAX_INCENTIVE_RATIO`.
  error ErrorIncentiveRatioTooLarge();

  /*************************
   * Public View Functions *
   *************************/

  /// @notice Return the address of compounder contract.
  function compounder() external view returns (address);

  /// @notice Return the address of staking token.
  function stakingToken() external view returns (address);

  /// @notice Return the address of underlying strategy contract.
  function strategy() external view returns (address);

  /// @notice The amount of staking token given as incentive.
  function incentive() external view returns (uint256);

  /// @notice Return whether the pool is active.
  function isActive() external view returns (bool);

  /// @notice Return the fee ratio distributed as incentive, multipled by 1e9.
  function getIncentiveRatio() external view returns (uint256);

  /// @notice The accumulated amount of unclaimed withdraw fee.
  function withdrawFeeAccumulated() external view returns (uint256);

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @notice Deposit assets into this contract and stake to underlying strategy.
  ///
  /// @param assets The amount of asset to deposit.
  function deposit(uint256 assets) external;

  /// @notice Deposit assets into this contract and stake to underlying strategy.
  ///
  /// @param assets The amount of asset to deposit.
  /// @param receiver The address of account who will receive the pool share.
  function deposit(uint256 assets, address receiver) external;

  /// @notice Deposit assets into this contract.
  ///
  /// @param assets The amount of asset to deposit.
  /// @param receiver The address of account who will receive the pool share.
  /// @param stake Whether to stake the assets into underlying strategy.
  function deposit(
    uint256 assets,
    address receiver,
    bool stake
  ) external;

  /// @notice Withdraw assets from this contract.
  ///
  /// @param assets The amount of assets to withdraw.
  function withdraw(uint256 assets) external;

  /// @notice Withdraw assets from this contract.
  ///
  /// @param assets The amount of assets to withdraw.
  /// @param receiver The address of account who will receive the assets.
  function withdraw(uint256 assets, address receiver) external;

  /// @notice Withdraw assets from this contract.
  ///
  /// @param assets The amount of assets to withdraw.
  /// @param receiver The address of account who will receive the assets.
  /// @param owner The address of user to withdraw from.
  function withdraw(
    uint256 assets,
    address receiver,
    address owner
  ) external;

  /// @notice Harvest rewards and convert to compounder.
  ///
  /// @param receiver The address of account to recieve the harvest bounty.
  /// @param minAssets The minimum amount of compounder harvested.
  /// @return assets The total amount of compounder harvested.
  function harvest(address receiver, uint256 minAssets) external returns (uint256 assets);

  /// @notice Migrate pool assets to new strategy.
  /// @param newStrategy The address of new strategy.
  function migrateStrategy(address newStrategy) external;
}
