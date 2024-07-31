// SPDX-License-Identifier: MIT

pragma solidity ^0.7.0 || ^0.8.0;

interface IFxReservePool {
  /// @notice Request bonus token from Reserve Pool.
  /// @param token The address of token to request.
  /// @param receiver The address recipient for the bonus token.
  /// @param originalAmount The original amount of token used.
  /// @param bonus The amount of bonus token received.
  function requestBonus(
    address token,
    address receiver,
    uint256 originalAmount
  ) external returns (uint256 bonus);
}

interface IFxReservePoolV3 {
  /**********
   * Events *
   **********/

  /// @notice Emitted when the bonus ratio is updated.
  /// @param token The address of the token updated.
  /// @param oldRatio The value of previous bonus ratio, multiplied by 1e18.
  /// @param newRatio The value of current bonus ratio, multiplied by 1e18.
  event UpdateBonusRatio(address indexed token, uint256 oldRatio, uint256 newRatio);

  /// @notice Emitted when the market request bonus.
  /// @param market The address of market contract.
  /// @param token The address of the token requested.
  /// @param receiver The address of token receiver.
  /// @param eligibleAmount The amount of token eligible for bonus.
  /// @param bonus The amount of bonus token.
  event RequestBonus(
    address indexed market,
    address indexed token,
    address indexed receiver,
    uint256 eligibleAmount,
    uint256 bonus
  );

  /// @notice Emitted when a new rebalance pool is added.
  /// @param market The address of market.
  /// @param pool The address of the rebalance pool.
  event RegisterRebalancePool(address indexed market, address indexed pool);

  /// @notice Emitted when an existed rebalance pool is removed.
  /// @param market The address of market.
  /// @param pool The address of the rebalance pool.
  event DeregisterRebalancePool(address indexed market, address indexed pool);

  /*************************
   * Public View Functions *
   *************************/

  /// @notice Return the list of rebalance pools under given `market`.
  function getPools(address market) external view returns (address[] memory pools);

  /// @notice Return whether the given `pool` is registered in the given `market`.
  function isPoolRegistered(address market, address pool) external view returns (bool);

  /// @notice Return the bonus ratio for the given `market`, multiplied by 1e18.
  function getMarketBonusRatio(address market) external view returns (uint256 ratio);

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @notice Request bonus token from Reserve Pool.
  /// @param market The address of fx market to request.
  /// @param receiver The address recipient for the bonus token.
  /// @param eligibleAmount The amount of token eligible for bonus.
  /// @param bonus The amount of bonus token received.
  function requestBonus(
    address market,
    address receiver,
    uint256 eligibleAmount
  ) external returns (uint256 bonus);
}
