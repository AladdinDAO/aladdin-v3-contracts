// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

interface IPriceOracle {
  /*************************
   * Public View Functions *
   *************************/

  /// @notice Return the price in USD of `token`, with precision 1e18.
  /// @param token The address of token to query.
  function price(address token) external view returns (uint256);
}
