// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { IFxTreasuryV2 } from "./IFxTreasuryV2.sol";

interface IFxUSD {
  /**********
   * Events *
   **********/

  /// @notice Emitted when a new market is added.
  /// @param baseToken The address of base token of the market.
  /// @param mintCap The mint capacity of the market.
  event AddMarket(address indexed baseToken, uint256 mintCap);

  /// @notice Emitted when the mint capacity is updated.
  /// @param baseToken The address of base token of the market.
  /// @param oldCap The value of previous mint capacity.
  /// @param newCap The value of current mint capacity.
  event UpdateMintCap(address indexed baseToken, uint256 oldCap, uint256 newCap);

  /// @notice Emitted when a new rebalance pool is added.
  /// @param baseToken The address of base token of the market.
  /// @param pool The address of the rebalance pool.
  event AddRebalancePool(address indexed baseToken, address indexed pool);

  /// @notice Emitted when a new rebalance pool is removed.
  /// @param baseToken The address of base token of the market.
  /// @param pool The address of the rebalance pool.
  event RemoveRebalancePool(address indexed baseToken, address indexed pool);

  /// @notice Emitted when someone wrap fToken as fxUSD.
  /// @param baseToken The address of base token of the market.
  /// @param owner The address of fToken owner.
  /// @param receiver The address of fxUSD recipient.
  /// @param amount The amount of fxUSD minted.
  event Wrap(address indexed baseToken, address indexed owner, address indexed receiver, uint256 amount);

  /// @notice Emitted when someone unwrap fxUSD as fToken.
  /// @param baseToken The address of base token of the market.
  /// @param owner The address of fxUSD owner.
  /// @param receiver The address of base token recipient.
  /// @param amount The amount of fxUSD burned.
  event Unwrap(address indexed baseToken, address indexed owner, address indexed receiver, uint256 amount);

  /**********
   * Errors *
   **********/

  /// @dev Thrown when someone tries to interact with unsupported market.
  error ErrorUnsupportedMarket();

  /// @dev Thrown when someone tries to interact with unsupported rebalance pool.
  error ErrorUnsupportedRebalancePool();

  /// @dev Thrown when someone tries to interact with market in stability mode.
  error ErrorMarketInStabilityMode();

  /// @dev Thrown when someone tries to interact with market has invalid price.
  error ErrorMarketWithInvalidPrice();

  /// @dev Thrown when someone tries to add a supported market.
  error ErrorMarketAlreadySupported();

  /// @dev Thrown when the total supply of fToken exceed mint capacity.
  error ErrorExceedMintCap();

  /// @dev Thrown when the amount of fToken is not enough for redeem.
  error ErrorInsufficientLiquidity();

  /// @dev Thrown when current is under collateral.
  error ErrorUnderCollateral();

  /// @dev Thrown when the length of two arrays is mismatch.
  error ErrorLengthMismatch();

  /*************************
   * Public View Functions *
   *************************/

  /// @notice Return the list of supported markets.
  function getMarkets() external view returns (address[] memory);

  /// @notice Return the list of supported rebalance pools.
  function getRebalancePools() external view returns (address[] memory);

  /// @notice Return the nav of fxUSD.
  function nav() external view returns (uint256);

  /// @notice Return whether the system is under collateral.
  function isUnderCollateral() external view returns (bool);

  /// @notice Return whether the system is under collateral.
  function isUnderCollateral(IFxTreasuryV2.Action action) external view returns (bool);

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @notice Wrap fToken to fxUSD.
  /// @param baseToken The address of corresponding base token.
  /// @param amount The amount of fToken to wrap.
  /// @param receiver The address of fxUSD recipient.
  function wrap(
    address baseToken,
    uint256 amount,
    address receiver
  ) external;

  /// @notice Wrap fToken from rebalance pool to fxUSD.
  /// @param pool The address of rebalance pool.
  /// @param amount The amount of fToken to wrap.
  /// @param receiver The address of fxUSD recipient.
  function wrapFrom(
    address pool,
    uint256 amount,
    address receiver
  ) external;

  /// @notice Mint fxUSD with base token.
  /// @param baseToken The address of the base token.
  /// @param amountIn The amount of base token to use.
  /// @param receiver The address of fxUSD recipient.
  /// @param minOut The minimum amount of fxUSD should receive.
  /// @return amountOut The amount of fxUSD received by the receiver.
  function mint(
    address baseToken,
    uint256 amountIn,
    address receiver,
    uint256 minOut
  ) external returns (uint256 amountOut);

  /// @notice Deposit fxUSD to rebalance pool.
  /// @param pool The address of rebalance pool.
  /// @param amount The amount of fxUSD to use.
  /// @param receiver The address of rebalance pool share recipient.
  function earn(
    address pool,
    uint256 amount,
    address receiver
  ) external;

  /// @notice Mint fxUSD with base token and deposit to rebalance pool.
  /// @param pool The address of rebalance pool.
  /// @param amountIn The amount of base token to use.
  /// @param receiver The address of rebalance pool recipient.
  /// @param minOut The minimum amount of rebalance pool shares should receive.
  /// @return amountOut The amount of rebalance pool shares received by the receiver.
  function mintAndEarn(
    address pool,
    uint256 amountIn,
    address receiver,
    uint256 minOut
  ) external returns (uint256 amountOut);

  /// @notice Redeem fxUSD to base token.
  /// @param baseToken The address of the base token.
  /// @param amountIn The amount of fxUSD to redeem.
  /// @param receiver The address of base token recipient.
  /// @param minOut The minimum amount of base token should receive.
  /// @return amountOut The amount of base token received by the receiver.
  /// @return bonusOut The amount of bonus base token received by the receiver.
  function redeem(
    address baseToken,
    uint256 amountIn,
    address receiver,
    uint256 minOut
  ) external returns (uint256 amountOut, uint256 bonusOut);

  /// @notice Redeem fToken from rebalance pool to base token.
  /// @param amountIn The amount of fxUSD to redeem.
  /// @param receiver The address of base token recipient.
  /// @param minOut The minimum amount of base token should receive.
  /// @return amountOut The amount of base token received by the receiver.
  /// @return bonusOut The amount of bonus base token received by the receiver.
  function redeemFrom(
    address pool,
    uint256 amountIn,
    address receiver,
    uint256 minOut
  ) external returns (uint256 amountOut, uint256 bonusOut);

  /// @notice Redeem fxUSD to base token optimally.
  /// @param amountIn The amount of fxUSD to redeem.
  /// @param receiver The address of base token recipient.
  /// @param minOuts The list of minimum amount of base token should receive.
  /// @return baseTokens The list of base token received by the receiver.
  /// @return amountOuts The list of amount of base token received by the receiver.
  /// @return bonusOuts The list of amount of bonus base token received by the receiver.
  function autoRedeem(
    uint256 amountIn,
    address receiver,
    uint256[] memory minOuts
  )
    external
    returns (
      address[] memory baseTokens,
      uint256[] memory amountOuts,
      uint256[] memory bonusOuts
    );
}
