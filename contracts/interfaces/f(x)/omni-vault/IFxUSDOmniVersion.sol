// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.25;

import { IFxUSD } from "../IFxUSD.sol";
import { IFxInternalToken } from "./IFxInternalToken.sol";

interface IFxUSDOmniVersion is IFxUSD, IFxInternalToken {
  /**********
   * Events *
   **********/

  /// @notice Emitted when someone wrap fractional token as fxUSD.
  /// @param pool The address of fx pool.
  /// @param amount The amount of fxUSD wrapped.
  event IncreasePoolSupply(address indexed pool, uint256 amount);

  /// @notice Emitted when someone unwrap fxUSD as fractional token.
  /// @param pool The address of fx pool.
  /// @param amount The amount of fxUSD unwrapped.
  event DecreasePoolSupply(address indexed pool, uint256 amount);

  /*************************
   * Public View Functions *
   *************************/

  /// @notice Return the number of fxUSD minted by the given pool.
  /// @param pool The address of pool.
  function getFxPoolSupply(address pool) external view returns (uint256);

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @notice Increase supply for the given pool.
  /// @param pool The address of pool.
  /// @param amount The amount of supply to increase.
  function increaseSupply(address pool, uint256 amount) external;

  /// @notice Decrease supply for the given pool.
  /// @param pool The address of pool.
  /// @param amount The amount of supply to decrease.
  function decreaseSupply(address pool, uint256 amount) external;
}
