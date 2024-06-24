// SPDX-License-Identifier: MIT

pragma solidity ^0.7.0 || ^0.8.0;

import { IStandardizedYield } from "../../interfaces/pendle/IStandardizedYield.sol";

interface IFxUSDCompounder is IStandardizedYield {
  /// @notice Emitted when pending rewards are harvested.
  /// @param caller The address of function caller.
  /// @param baseOut The amount of base token harvested.
  /// @param expense The amount of performance fee.
  /// @param bounty The amount of harvest bounty.
  /// @param fxUSDOut The amount of FxUSD harvested.
  event Harvest(address indexed caller, uint256 baseOut, uint256 expense, uint256 bounty, uint256 fxUSDOut);

  /// @notice Emitted when liquidated base tokens are converted back to FxUSD.
  /// @param caller The address of function caller.
  /// @param amountBaseToken The amount of base token converted.
  /// @param amountFxUSD The amount of FxUSD converted.
  event Rebalance(address indexed caller, uint256 amountBaseToken, uint256 amountFxUSD);

  /*************************
   * Public View Functions *
   *************************/

  /// @notice The amount of unconverted base token.
  function totalPendingBaseToken() external view returns (uint256);

  /// @notice The total amount of deposited yield token.
  function getTotalAssets() external view returns (uint256);

  /// @notice The address of rebalance pool.
  function getPool() external view returns (address);

  /// @notice The address of base token.
  function getBaseToken() external view returns (address);

  /// @notice Return the token converting routes.
  /// @param token The address of token to query.
  /// @return routes The converting routes.
  function getConvertRoutes(address token) external view returns (uint256[] memory routes);

  /// @notice Return the net asset value.
  function nav() external view returns (uint256);

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @notice Convert liquidated base token to FxUSD.
  /// @param minFxUSD The minimum amount of FxUSD should be rebalanced.
  /// @return fxUSDOut The amount of FxUSD harvested.
  function rebalance(uint256 minFxUSD) external returns (uint256 fxUSDOut);

  /// @notice Harvest pending rewards from FxUSDCompounder contract.
  /// @param receiver The address of harvest bounty receiver.
  /// @param minBaseOut The minimum amount of base token should be harvested.
  /// @param minFxUSD The minimum amount of FxUSD should be harvested.
  /// @return baseOut The amount of base token harvested.
  /// @return fxUSDOut The amount of FxUSD harvested.
  function harvest(
    address receiver,
    uint256 minBaseOut,
    uint256 minFxUSD
  ) external returns (uint256 baseOut, uint256 fxUSDOut);
}
