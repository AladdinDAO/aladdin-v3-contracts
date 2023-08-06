// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

interface IUniswapV2Pair {
  function token0() external view returns (address);

  function token1() external view returns (address);

  function executeVirtualOrders(uint256 blockTimestamp) external;

  function getReserves()
    external
    view
    returns (
      uint112 _reserve0,
      uint112 _reserve1,
      uint32 _blockTimestampLast
    );

  function swap(
    uint256 amount0Out,
    uint256 amount1Out,
    address to,
    bytes calldata data
  ) external;
}
