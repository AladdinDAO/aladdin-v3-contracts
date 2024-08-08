// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { IMultiMerkleStash } from "../../interfaces/IMultiMerkleStash.sol";
import { IConcentratorCompounder } from "./IConcentratorCompounder.sol";

interface ISdPendleCompounder is IConcentratorCompounder {
  /**********
   * Events *
   **********/

  /// @notice Emitted when the ratio for veSDT booster is updated.
  /// @param oldRatio The value of the previous ratio, multiplied by 1e9.
  /// @param newRatio The value of the current ratio, multiplied by 1e9.
  event UpdateBoosterRatio(uint256 oldRatio, uint256 newRatio);

  /// @notice Emitted when the bribe burner contract is updated.
  ///
  /// @param oldBurner The address of the previous bribe burner contract.
  /// @param newBurner The address of the current bribe burner contract.
  event UpdateBribeBurner(address indexed oldBurner, address indexed newBurner);

  /// @notice Emitted when someone harvest pending bribe rewards.
  ///
  /// @param token The address of the reward token.
  /// @param assets The amount of harvested rewards.
  /// @param performanceFee The amount of platform fee taken.
  /// @param boosterFee The amount SDT for veSDT delegation booster, when the token is SDT.
  ///        Or the amount of tokens should be converted to SDT for booster, when the token is not SDT.
  event HarvestBribe(address indexed token, uint256 assets, uint256 performanceFee, uint256 boosterFee);

  /**********
   * Errors *
   **********/

  /// @dev Thrown when the shares minted is not enough compared to off-chain computation.
  error InsufficientShares();

  /*************************
   * Public View Functions *
   *************************/

  /// @notice Return the fee ratio distributed to veSDT booster, multiplied by 1e9.
  function getBoosterRatio() external view returns (uint256);

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @notice Deposit sdPENDLE-gauge into the contract.
  /// @dev Use `assets=uint256(-1)` if you want to deposit all sdPENDLE-gauge.
  /// @param assets The amount of sdPENDLE-gauge to deposit.
  /// @param receiver The address of account who will receive the pool share.
  /// @return shares The amount of pool shares received.
  function depositWithGauge(uint256 assets, address receiver) external returns (uint256 shares);

  /// @notice Deposit PENDLE into the contract.
  ///
  /// @param assets The amount of PENDLE to deposit.
  /// @param receiver The address of account who will receive the pool share.
  /// @param _minShares The minimum amount of share to receive.
  /// @return shares The amount of pool shares received.
  function depositWithPENDLE(
    uint256 assets,
    address receiver,
    uint256 _minShares
  ) external returns (uint256 shares);

  /// @notice Harvest StakeDAO gauge bribe.
  ///
  /// @dev No harvest bounty when others call this function.
  ///
  /// @param claim The claim parameter passing to StakeDAOMultiMerkleStash contract.
  function harvestBribe(IMultiMerkleStash.claimParam memory claim) external;
}
