// SPDX-License-Identifier: MIT

pragma solidity ^0.7.0 || ^0.8.0;

interface IBalancerPool {
  /// @notice Returns this Pool's ID, used when interacting with the Vault (to e.g. join the Pool or swap with it).
  function getPoolId() external view returns (bytes32);

  /// @notice Returns the scaling factors of each of the Pool's tokens. This is an implementation detail that is typically
  /// not relevant for outside parties, but which might be useful for some types of Pools.
  function getScalingFactors() external view returns (uint256[] memory);

  /// @notice Returns the cached value for token's rate. Reverts if the token doesn't belong to the pool or has no rate
  /// provider.
  function getTokenRateCache(address token)
    external
    view
    returns (
      uint256 rate,
      uint256 oldRate,
      uint256 duration,
      uint256 expires
    );

  /**************************
   * WeightedPool Functions *
   **************************/

  /// @notice Returns all normalized weights, in the same order as the Pool's tokens.
  function getNormalizedWeights() external view returns (uint256[] memory);

  /**********************************
   * ComposableStablePool Functions *
   **********************************/

  function getAmplificationParameter()
    external
    view
    returns (
      uint256 value,
      bool isUpdating,
      uint256 precision
    );

  /// @notice Returns the effective BPT supply.
  ///
  /// In other pools, this would be the same as `totalSupply`, but there are two key differences here:
  ///  - this pool pre-mints BPT and holds it in the Vault as a token, and as such we need to subtract the Vault's
  ///    balance to get the total "circulating supply". This is called the 'virtualSupply'.
  ///  - the Pool owes debt to the Protocol in the form of unminted BPT, which will be minted immediately before the
  ///    next join or exit. We need to take these into account since, even if they don't yet exist, they will
  ///    effectively be included in any Pool operation that involves BPT.
  ///
  /// In the vast majority of cases, this function should be used instead of `totalSupply()`.
  function getActualSupply() external view returns (uint256);
}
