// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

interface IAnyswapRouter {
  // Swaps `amount` `token` from this chain to `toChainID` chain with recipient `to`
  function anySwapOut(
    address token,
    address to,
    uint256 amount,
    uint256 toChainID
  ) external;

  // Swaps `amount` `token` from this chain to `toChainID` chain with recipient `to` by minting with `underlying`
  function anySwapOutUnderlying(
    address token,
    address to,
    uint256 amount,
    uint256 toChainID
  ) external;

  function anySwapOut(
    address[] calldata tokens,
    address[] calldata to,
    uint256[] calldata amounts,
    uint256[] calldata toChainIDs
  ) external;

  // sets up a cross-chain trade from this chain to `toChainID` for `path` trades to `to`
  function anySwapOutExactTokensForTokens(
    uint256 amountIn,
    uint256 amountOutMin,
    address[] calldata path,
    address to,
    uint256 deadline,
    uint256 toChainID
  ) external;

  // sets up a cross-chain trade from this chain to `toChainID` for `path` trades to `to`
  function anySwapOutExactTokensForTokensUnderlying(
    uint256 amountIn,
    uint256 amountOutMin,
    address[] calldata path,
    address to,
    uint256 deadline,
    uint256 toChainID
  ) external;

  // sets up a cross-chain trade from this chain to `toChainID` for `path` trades to `to`
  function anySwapOutExactTokensForNative(
    uint256 amountIn,
    uint256 amountOutMin,
    address[] calldata path,
    address to,
    uint256 deadline,
    uint256 toChainID
  ) external;

  // sets up a cross-chain trade from this chain to `toChainID` for `path` trades to `to`
  function anySwapOutExactTokensForNativeUnderlying(
    uint256 amountIn,
    uint256 amountOutMin,
    address[] calldata path,
    address to,
    uint256 deadline,
    uint256 toChainID
  ) external;
}
