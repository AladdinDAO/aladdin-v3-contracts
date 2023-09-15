// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

interface IFxPriceOracle {
  /// @notice Return the oracle price with 18 decimal places.
  /// @return isValid Whether the oracle is valid.
  /// @return safePrice The safe oracle price when the oracle is valid.
  /// @return minUnsafePrice The minimum unsafe oracle price when the oracle is invalid.
  /// @return maxUnsafePrice The maximum unsafe oracle price when the oracle is invalid.
  function getPrice()
    external
    view
    returns (
      bool isValid,
      uint256 safePrice,
      uint256 minUnsafePrice,
      uint256 maxUnsafePrice
    );
}
