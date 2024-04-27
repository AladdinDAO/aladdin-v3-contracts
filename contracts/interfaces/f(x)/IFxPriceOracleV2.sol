// SPDX-License-Identifier: MIT

pragma solidity ^0.7.0 || ^0.8.0;

interface IFxPriceOracleV2 {
  /// @notice Return the oracle price with 18 decimal places.
  /// @return isValid Whether the oracle price is valid -- the difference between `minPrice` and `maxPrice` is reasonable.
  /// @return twap The time-weighted average price. It should be the anchor price for this asset, which is hard to manipulate.
  /// @return minPrice The minimum oracle price among all available price sources (including twap).
  /// @return maxPrice The maximum oracle price among all available price sources (including twap).
  function getPrice()
    external
    view
    returns (
      bool isValid,
      uint256 twap,
      uint256 minPrice,
      uint256 maxPrice
    );
}
