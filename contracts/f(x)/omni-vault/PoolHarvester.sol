// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.25;

import { SafeERC20Upgradeable } from "@openzeppelin/contracts-upgradeable-v4/token/ERC20/utils/SafeERC20Upgradeable.sol";
import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable-v4/token/ERC20/IERC20Upgradeable.sol";

import { IFxBasePool } from "../../interfaces/f(x)/omni-vault/IFxBasePool.sol";
import { IFxOmniVault } from "../../interfaces/f(x)/omni-vault/IFxOmniVault.sol";
import { IFxRebalancePoolSplitter } from "../../interfaces/f(x)/IFxRebalancePoolSplitter.sol";

import { WordCodec } from "../../common/codec/WordCodec.sol";
import { PoolBalances } from "./PoolBalances.sol";

abstract contract PoolHarvester is PoolBalances {
  using SafeERC20Upgradeable for IERC20Upgradeable;

  /*************
   * Variables *
   *************/

  /// @dev Mapping from pool address to `RebalancePoolSplitter`.
  mapping(address => address) private poolToRebalancePoolSplitter;

  /// @dev Slots for future use.
  uint256[49] private _gap;

  /***************
   * Constructor *
   ***************/

  function __PoolHarvester_init() internal onlyInitializing {}

  /*************************
   * Public View Functions *
   *************************/

  /// @inheritdoc IFxOmniVault
  function getRebalancePoolSplitter(address pool) external view returns (address) {
    return poolToRebalancePoolSplitter[pool];
  }

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @inheritdoc IFxOmniVault
  function harvest(address pool) external nonReentrant onlyValidPool(pool) returns (uint256 amountRewards) {
    amountRewards = IFxBasePool(pool).onHarvest(0, 0, 0);

    uint256 performanceFee = (getExpenseRatio() * amountRewards) / FEE_PRECISION;
    uint256 harvestBounty = (getHarvesterRatio() * amountRewards) / FEE_PRECISION;
    uint256 rebalancePoolRewards = amountRewards - harvestBounty - performanceFee;

    address token = IFxBasePool(pool).getBaseToken();
    if (performanceFee > 0) {
      IERC20Upgradeable(token).safeTransfer(getPlatform(), performanceFee);
    }
    if (harvestBounty > 0) {
      IERC20Upgradeable(token).safeTransfer(_msgSender(), harvestBounty);
    }
    if (rebalancePoolRewards > 0) {
      address splitter = poolToRebalancePoolSplitter[pool];

      IERC20Upgradeable(token).safeTransfer(splitter, rebalancePoolRewards);
      IFxRebalancePoolSplitter(splitter).split(token);
    }

    emit Harvest(_msgSender(), pool, amountRewards, performanceFee, harvestBounty);
  }

  /************************
   * Restricted Functions *
   ************************/

  function updateRebalancePoolSplitter(address pool, address splitter)
    external
    onlyRole(DEFAULT_ADMIN_ROLE)
    onlyValidPool(pool)
  {
    poolToRebalancePoolSplitter[pool] = splitter;
  }
}
