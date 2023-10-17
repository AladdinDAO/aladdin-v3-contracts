// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { IConcentratorCompounder } from "./IConcentratorCompounder.sol";

interface ICvxFxnCompounder is IConcentratorCompounder {
  /**********
   * Errors *
   **********/

  /// @dev Thrown when the shares minted is not enough compared to off-chain computation.
  error InsufficientShares();

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @notice Deposit stkCvxFxn into the contract.
  ///
  /// @param assets The amount of stkCvxFxn to desposit.
  /// @param receiver The address of account who will receive the pool share.
  /// @return shares The amount of pool shares received.
  function depositWithStkCvxFxn(uint256 assets, address receiver) external returns (uint256 shares);

  /// @notice Deposit FXN into the contract.
  ///
  /// @param assets The amount of FXN to desposit.
  /// @param receiver The address of account who will receive the pool share.
  /// @param _minShares The minimum amount of share to receive.
  /// @return shares The amount of pool shares received.
  function depositWithFXN(
    uint256 assets,
    address receiver,
    uint256 _minShares
  ) external returns (uint256 shares);
}
