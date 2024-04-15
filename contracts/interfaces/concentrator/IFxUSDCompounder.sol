// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { IStandardizedYield } from "../../interfaces/pendle/IStandardizedYield.sol";

interface IFxUSDCompounder is IStandardizedYield {
  event Harvest(address indexed caller, uint256 baseOut, uint256 expense, uint256 bounty, uint256 fxUSDOut);

  event Rebalance(address indexed caller, uint256 amountBaseToken, uint256 amountFxUSD);

  /*************************
   * Public View Functions *
   *************************/

  /// @notice The amount of unconverted base token.
  function totalPendingBaseToken() external view returns (uint256);

  function getConvertRoutes(address token) external view returns (uint256[] memory routes);

  /****************************
   * Public Mutated Functions *
   ****************************/

  function rebalance(uint256 minFxUSD) external returns (uint256);

  function harvest(
    address receiver,
    uint256 minBaseOut,
    uint256 minFxUSD
  ) external returns (uint256 baseOut, uint256 fxUSDOut);
}
