// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;
pragma abicoder v2;

import { IMultipleRewardAccumulator } from "../../common/rewards/accumulator/IMultipleRewardAccumulator.sol";
import { IMultipleRewardDistributor } from "../../common/rewards/distributor/IMultipleRewardDistributor.sol";

import { IMultiMerkleStash } from "../IMultiMerkleStash.sol";
import { IConcentratorBase } from "./IConcentratorBase.sol";

interface IConcentratorStakeDAOGaugeWrapper is
  IConcentratorBase,
  IMultipleRewardDistributor,
  IMultipleRewardAccumulator
{
  /**********
   * Events *
   **********/

  /// @notice Emitted when the ratio for booster is updated.
  /// @param oldRatio The value of the previous ratio, multipled by 1e9.
  /// @param newRatio The value of the current ratio, multipled by 1e9.
  event UpdateBoosterRatio(uint256 oldRatio, uint256 newRatio);

  /// @notice Emitted when the address of burner is updated.
  event UpdateBurner(address indexed oldBurner, address indexed newBurner);

  /// @notice Emitted when user deposit staking token to the contract.
  ///
  /// @param owner The address of the owner of the staking token.
  /// @param receiver The address of the recipient of the staking token.
  /// @param amount The amount of staking token deposited.
  event Deposit(address indexed owner, address indexed receiver, uint256 amount);

  /// @notice Emitted when user withdraw staking token from the contract.
  ///
  /// @param owner The address of the owner of the staking token.
  /// @param receiver The address of the recipient of the staking token.
  /// @param amount The amount of staking token withdrawn.
  event Withdraw(address indexed owner, address indexed receiver, uint256 amount);

  /// @notice Emitted when someone harvests pending rewards.
  /// @param token The address of token harvested.
  /// @param caller The address who call the function.
  /// @param receiver The address of account to recieve the harvest bounty.
  /// @param assets The total amount of underlying asset harvested.
  /// @param performanceFee The amount of harvested assets as performance fee.
  /// @param harvesterBounty The amount of harvested assets as harvester bounty.
  /// @param boosterFee The amount SDT for veSDT delegation booster, when the token is SDT.
  event Harvest(
    address indexed token,
    address indexed caller,
    address indexed receiver,
    uint256 assets,
    uint256 performanceFee,
    uint256 harvesterBounty,
    uint256 boosterFee
  );

  /// @notice Emitted when someone harvest pending bribe rewards.
  ///
  /// @param token The address of the reward token.
  /// @param assets The amount of harvested rewards.
  /// @param performanceFee The amount of platform fee taken.
  /// @param boosterFee The amount SDT for veSDT delegation booster, when the token is SDT.
  event HarvestBribe(address indexed token, uint256 assets, uint256 performanceFee, uint256 boosterFee);

  /**********
   * Errors *
   **********/

  /// @dev Thrown when the deposit amount is zero.
  error ErrorDepositZeroAssets();

  /// @dev Thrown when the actual staked amount is not enough.
  error ErrorStakedAmountMismatch();

  /// @dev Thrown when the withdrawal amount is zero.
  error ErrorWithdrawZeroAssets();

  /// @dev Thrown when withdraw more then staked.
  error ErrorInsufficientStakedToken();

  /// @dev Thrown when the booster ratio is too large.
  error ErrorBoosterRatioTooLarge();

  /*************************
   * Public View Functions *
   *************************/

  /// @notice The address of gauge contract.
  function gauge() external view returns (address);

  /// @notice The address of staking token.
  function stakingToken() external view returns (address);

  /// @notice Return the amount of staking token staked in the contract.
  function totalSupply() external view returns (uint256);

  /// @notice Return the amount of staking token staked in the contract for some user.
  ///
  /// @param _user The address of user to query.
  function balanceOf(address _user) external view returns (uint256);

  /// @notice The fee ratio distributed to veSDT delegation booster, multipled by 1e9.
  function getBoosterRatio() external view returns (uint256);

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @notice Deposit some staking token to the contract.
  ///
  /// @param amount The amount of staking token to deposit.
  /// @param receiver The address of recipient who will receive the deposited staking token.
  function deposit(uint256 amount, address receiver) external;

  /// @notice Deposit some gauge token to the contract.
  ///
  /// @param amount The amount of gauge token to deposit.
  /// @param receiver The address of recipient who will receive the deposited gauge token.
  function depositWithGauge(uint256 amount, address receiver) external;

  /// @notice Withdraw some staking token from the contract.
  ///
  /// @param amount The amount of staking token to withdraw.
  /// @param receiver The address of recipient who will receive the withdrawn staking token.
  function withdraw(uint256 amount, address receiver) external;

  /// @notice Harvest pending reward from the contract.
  ///
  /// @param receiver The address of recipient who will receive the harvest bounty.
  function harvest(address receiver) external;

  /// @notice Harvest StakeDAO gauge bribes.
  ///
  /// @dev No harvest bounty when others call this function.
  ///
  /// @param _claims The claim parameters passing to StakeDAOMultiMerkleStash contract.
  function harvestBribes(IMultiMerkleStash.claimParam[] memory _claims) external;
}
