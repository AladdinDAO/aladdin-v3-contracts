// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.7.0 || ^0.8.0;

import { IFxInternalToken } from "./IFxInternalToken.sol";

interface IFxFractionalToken is IFxInternalToken {
  /*************************
   * Public View Functions *
   *************************/

  /// @notice Return the address of corresponding pool.
  function getPool() external view returns (address);

  /// @notice Return the net asset value for the token, multiplied by 1e18.
  function nav() external view returns (uint256);
}
