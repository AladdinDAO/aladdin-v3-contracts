// SPDX-License-Identifier: MIT

pragma solidity ^0.7.0 || ^0.8.0;
pragma abicoder v2;

import { IConcentratorStakeDAOGaugeWrapper } from "./IConcentratorStakeDAOGaugeWrapper.sol";

interface IConcentratorSdCrvGaugeWrapper is IConcentratorStakeDAOGaugeWrapper {
  /**********
   * Errors *
   **********/

  /// @dev Thrown when the output amount is not enough.
  error ErrorInsufficientAmountOut();

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @notice Deposit some CRV to the contract.
  ///
  /// @param amount The amount of staking token to deposit.
  /// @param receiver The address of recipient who will receive the deposited staking token.
  /// @param minOut The minimum amount of sdCRV should received.
  /// @return amountOut The amount of sdCRV received.
  function depositWithCRV(
    uint256 amount,
    address receiver,
    uint256 minOut
  ) external returns (uint256 amountOut);

  /// @notice Deposit some CRV to the contract.
  ///
  /// @param amount The amount of staking token to deposit.
  /// @param receiver The address of recipient who will receive the deposited staking token.
  function depositWithSdVeCRV(uint256 amount, address receiver) external;
}
