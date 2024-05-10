// SPDX-License-Identifier: MIT

pragma solidity ^0.7.0 || ^0.8.0;

interface ISpotPriceOracle {
  /// @notice Return spot price with 18 decimal places.
  ///
  /// @dev encoding for single route
  /// |   8 bits  | 160 bits |  88  bits  |
  /// | pool_type |   pool   | customized |
  /// assume all base and quote token has no more than 18 decimals.
  ///
  /// + pool_type = 0: UniswapV2
  ///   customized = |   1  bit   |   8  bits   |   8 bits   | ... |
  ///                | base_index | base_scale | quote_scale | ... |
  /// + pool_type = 1: UniswapV3
  ///   customized = |   1  bit   |   8 bits   |   8  bits   | ... |
  ///                | base_index | base_scale | quote_scale | ... |
  /// + pool_type = 2: Balancer V2 Weighted
  ///   customized = |   3  bit   |    3 bit    |   8 bits   |   8  bits   | ... |
  ///                | base_index | quote_index | base_scale | quote_scale | ... |
  /// + pool_type = 3: Balancer V2 Stable
  ///   customized = |   3 bits   |   3  bits   | ... |
  ///                | base_index | quote_index | ... |
  /// + pool_type = 4: Curve Plain
  ///   customized = | 3 bits |   3 bits   |   3  bits   |     1  bits     |  8 bits  | ... |  8 bits  | ... |
  ///                | tokens | base_index | quote_index | has_amm_precise | scale[0] | ... | scale[n] | ... |
  /// + pool_type = 5: Curve Plain with oracle
  ///   customized = |   1  bit   | ... |
  ///                | base_index | ... |
  /// + pool_type = 6: Curve Plain NG
  ///   customized = |   3 bits   |   3  bits   | ... |
  ///                | base_index | quote_index | ... |
  /// + pool_type = 7: Curve Crypto
  ///   customized = |   1  bit   | ... |
  ///                | base_index | ... |
  /// + pool_type = 8: Curve TriCrypto
  ///   customized = |   2 bits   |   2  bits   | ... |
  ///                | base_index | quote_index | ... |
  /// + pool_type = 9: ERC4626
  ///   customized = |       1  bit       | ... |
  ///                | base_is_underlying | ... |
  /// + pool_type = 10: ETHLSD, wstETH, weETH, ezETH
  ///   customized = |    1 bit    | ... |
  ///                | base_is_ETH | ... |
  /// + pool_type = 11: BalancerV2CachedRate
  ///   customized = |   3 bits   | ... |
  ///                | base_index | ... |
  ///
  /// @param encoding The encoding of the price source.
  /// @return spotPrice The spot price with 18 decimal places.
  function getSpotPrice(uint256 encoding) external view returns (uint256 spotPrice);
}
