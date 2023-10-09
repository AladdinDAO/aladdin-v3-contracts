// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

interface IUniswapV3Pool {
  /// @notice The contract that deployed the pool, which must adhere to the IUniswapV3Factory interface
  /// @return The contract address
  function factory() external view returns (address);

  /// @notice The first of the two tokens of the pool, sorted by address
  /// @return The token contract address
  function token0() external view returns (address);

  /// @notice The second of the two tokens of the pool, sorted by address
  /// @return The token contract address
  function token1() external view returns (address);

  /// @notice The pool's fee in hundredths of a bip, i.e. 1e-6
  /// @return The fee
  function fee() external view returns (uint24);

  /// @notice Swap token0 for token1, or token1 for token0
  /// @dev The caller of this method receives a callback in the form of IUniswapV3SwapCallback#uniswapV3SwapCallback
  /// @param recipient The address to receive the output of the swap
  /// @param zeroForOne The direction of the swap, true for token0 to token1, false for token1 to token0
  /// @param amountSpecified The amount of the swap, which implicitly configures the swap as exact input (positive), or exact output (negative)
  /// @param sqrtPriceLimitX96 The Q64.96 sqrt price limit. If zero for one, the price cannot be less than this
  /// value after the swap. If one for zero, the price cannot be greater than this value after the swap
  /// @param data Any data to be passed through to the callback
  /// @return amount0 The delta of the balance of token0 of the pool, exact when negative, minimum when positive
  /// @return amount1 The delta of the balance of token1 of the pool, exact when negative, minimum when positive
  function swap(
    address recipient,
    bool zeroForOne,
    int256 amountSpecified,
    uint160 sqrtPriceLimitX96,
    bytes calldata data
  ) external returns (int256 amount0, int256 amount1);
}
