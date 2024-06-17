// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.7.0 || ^0.8.0;

import { IFxInternalToken } from "./IFxInternalToken.sol";

interface IFxLeveragedToken is IFxInternalToken {
  /**********
   * Events *
   **********/

  /// @notice Emitted when the cooling-off period is updated.
  /// @param oldValue The value of the previous cooling-off period.
  /// @param newValue The value of the current cooling-off period.
  event UpdateCoolingOffPeriod(uint256 oldValue, uint256 newValue);

  /*************************
   * Public View Functions *
   *************************/

  /// @notice Return the address of corresponding pool.
  function getPool() external view returns (address);

  /// @notice Return the net asset value for the token, multiplied by 1e18.
  function nav() external view returns (uint256);
}
