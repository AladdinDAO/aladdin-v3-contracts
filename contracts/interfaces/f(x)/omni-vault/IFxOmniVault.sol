// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.7.0 || ^0.8.0;

interface IFxOmniVault {
  /**********
   * Events *
   **********/

  /// @notice Emitted when the reserve pool contract is updated.
  /// @param oldReservePool The address of previous reserve pool.
  /// @param newReservePool The address of current reserve pool.
  event UpdateReservePool(address indexed oldReservePool, address indexed newReservePool);

  /// @notice Emitted when the platform contract is updated.
  /// @param oldPlatform The address of previous platform contract.
  /// @param newPlatform The address of current platform contract.
  event UpdatePlatform(address indexed oldPlatform, address indexed newPlatform);

  /// @notice Emitted when the RebalancePoolSplitter contract is updated.
  /// @param pool The address of fx pool.
  /// @param oldRebalancePoolSplitter The address of previous RebalancePoolSplitter contract.
  /// @param newRebalancePoolSplitter The address of current RebalancePoolSplitter.
  event UpdateRebalancePoolSplitter(
    address indexed pool,
    address indexed oldRebalancePoolSplitter,
    address indexed newRebalancePoolSplitter
  );

  /// @notice Emitted when the ratio for treasury is updated.
  /// @param oldRatio The value of the previous ratio, multiplied by 1e9.
  /// @param newRatio The value of the current ratio, multiplied by 1e9.
  event UpdateExpenseRatio(uint256 oldRatio, uint256 newRatio);

  /// @notice Emitted when the ratio for harvester is updated.
  /// @param oldRatio The value of the previous ratio, multiplied by 1e9.
  /// @param newRatio The value of the current ratio, multiplied by 1e9.
  event UpdateHarvesterRatio(uint256 oldRatio, uint256 newRatio);

  /// @notice Emitted when the flash loan fee ratio is updated.
  /// @param oldRatio The value of the previous ratio, multiplied by 1e9.
  /// @param newRatio The value of the current ratio, multiplied by 1e9.
  event UpdateFlashLoanFeeRatio(uint256 oldRatio, uint256 newRatio);

  event Swap(
    address indexed pool,
    address indexed tokenIn,
    address indexed tokenOut,
    uint256 amountIn,
    uint256 amountOut
  );

  /// @notice Emitted when someone harvest pending rewards.
  /// @param caller The address of caller.
  /// @param amountRewards The amount of total harvested rewards.
  /// @param performanceFee The amount of harvested rewards distributed to protocol revenue.
  /// @param harvestBounty The amount of harvested rewards distributed to caller as harvest bounty.
  event Harvest(
    address indexed caller,
    address indexed pool,
    uint256 amountRewards,
    uint256 performanceFee,
    uint256 harvestBounty
  );

  /***********
   * Structs *
   ***********/

  struct SingleSwap {
    address pool;
    address assetIn;
    address assetOut;
    uint256 amount;
    bytes userData;
  }

  struct BatchSwapStep {
    address pool;
    uint256 assetInIndex;
    uint256 assetOutIndex;
    uint256 amount;
    bytes userData;
  }

  /// @notice Return the fee ratio distributed as protocol revenue, multiplied by 1e9.
  function getExpenseRatio() external view returns (uint256);

  /// @notice Return the fee ratio distributed ad harvester bounty, multiplied by 1e9.
  function getHarvesterRatio() external view returns (uint256);

  /// @notice Return the fee ratio distributed to rebalance pool, multiplied by 1e9.
  function getRebalancePoolRatio() external view returns (uint256);

  /// @notice Return the flash loan fee ratio, multiplied by 1e9.
  function getFlashLoanFeeRatio() external view returns (uint256);

  function getReservePool() external view returns (address);

  function getPlatform() external view returns (address);

  function getRebalancePoolSplitter(address pool) external view returns (address splitter);

  function getPoolTokens(address pool) external view returns (address[] memory tokens);

  function getPoolBalances(address pool) external view returns (uint256[] memory balances);

  function getFxUSDPools(address fxUSD) external view returns (address[] memory pools);

  function joinPool(
    address pool,
    address recipient,
    bytes memory userData,
    uint256 deadline
  ) external returns (uint256[] memory amountsOut);

  function swap(
    address recipient,
    SingleSwap memory singleSwap,
    uint256 minOut,
    uint256 deadline
  ) external returns (uint256 amountOut, uint256 bonus);

  function batchSwap(
    address recipient,
    BatchSwapStep[] memory swaps,
    address[] memory assets,
    int256[] memory limits,
    uint256 deadline
  ) external returns (int256[] memory deltas, uint256[] memory bonusAmounts);

  function queryBatchSwap(BatchSwapStep[] memory swaps, address[] memory assets)
    external
    returns (int256[] memory deltas);

  function harvest(address pool) external returns (uint256 amountRewards);
}
