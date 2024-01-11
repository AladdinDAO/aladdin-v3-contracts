// SPDX-License-Identifier: MIT

pragma solidity ^0.7.0 || ^0.8.0;

interface IFxRateProvider {
  /// @notice Return the exchange rate from wrapped token to underlying rate,
  /// multiplied by 1e18.
  function getRate() external view returns (uint256);
}
