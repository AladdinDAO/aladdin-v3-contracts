// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.25;

import { EnumerableSetUpgradeable } from "@openzeppelin/contracts-upgradeable-v4/utils/structs/EnumerableSetUpgradeable.sol";

import { IFxBasePool } from "../../interfaces/f(x)/omni-vault/IFxBasePool.sol";

import { PoolBalances } from "./PoolBalances.sol";

abstract contract FxUSDHelpers is PoolBalances {
  using EnumerableSetUpgradeable for EnumerableSetUpgradeable.AddressSet;

  /*************
   * Constants *
   *************/

  uint256 private constant MIN_COLLATERAL_RATIO = 1e18;

  bytes32 private constant PRICE_RATE_CACHE_SLOT = keccak256("PRICE_RATE_CACHE_SLOT");

  /*************
   * Variables *
   *************/

  /// @dev Mapping from FxUSD address to list of fx pools.
  mapping(address => EnumerableSetUpgradeable.AddressSet) private fxUSDToPools;

  /// @dev Slots for future use.
  uint256[48] private _gap;

  /***************
   * Constructor *
   ***************/

  function __FxUSDHelpers_init() internal onlyInitializing {}

  /*************************
   * Public View Functions *
   *************************/

  function getFxUSDPools(address fxUSD) external view returns (address[] memory pools) {
    pools = _getFxUSDPools(fxUSD);
  }

  /************************
   * Restricted Functions *
   ************************/

  function registerPoolToStable(address fxUSD, address pool) external onlyRole(DEFAULT_ADMIN_ROLE) onlyValidPool(pool) {
    if (fxUSDToPools[fxUSD].add(pool)) {
      IFxBasePool(pool).enableFxUSD(fxUSD);
    }
  }

  /**********************
   * Internal Functions *
   **********************/

  function _getFxUSDPools(address fxUSD) internal view returns (address[] memory pools) {
    EnumerableSetUpgradeable.AddressSet storage lists = fxUSDToPools[fxUSD];
    uint256 length = lists.length();
    pools = new address[](length);
    for (uint256 i = 0; i < length; ++i) {
      pools[i] = lists.at(i);
    }
  }

  function _cachePriceAndRateForFxUSD(address fxUSD) internal {
    EnumerableSetUpgradeable.AddressSet storage pools = fxUSDToPools[fxUSD];
    uint256 length = pools.length();
    for (uint256 i = 0; i < length; ++i) {
      _cachePriceAndRateForPool(pools.at(i));
    }
  }

  function _cachePriceAndRateForPool(address pool) internal {
    bytes32 slot = PRICE_RATE_CACHE_SLOT;
    bool isCached;
    assembly {
      isCached := tload(add(slot, pool))
    }
    if (isCached) return;
    assembly {
      let numPools := tload(slot)
      numPools := add(numPools, 1)
      tstore(add(slot, numPools), pool)
      tstore(slot, numPools)
      tstore(add(slot, pool), 1)
    }
    IFxBasePool(pool).onPriceAndRateCache();
  }

  function _clearAllPriceAndRateCache() internal {
    bytes32 slot = PRICE_RATE_CACHE_SLOT;
    uint256 numPools;
    assembly {
      numPools := tload(slot)
      tstore(slot, 0)
    }
    for (uint256 i = 1; i <= numPools; ++i) {
      address pool;
      assembly {
        pool := tload(add(slot, i))
        tstore(add(slot, i), 0)
        tstore(add(slot, pool), 0)
      }
      IFxBasePool(pool).clearPriceAndRateCache();
    }
  }

  function _checkFxUSDStatus(address fxUSD, address pool) internal view {
    address[] memory pools = _getFxUSDPools(fxUSD);
    uint256 poolCollateralRatio;
    for (uint256 i = 0; i < pools.length; ++i) {
      address cachedPool = pools[i];
      (, uint256 fSupply, uint256 xSupply) = _getBaseBalanceAndFxSupply(cachedPool);
      uint256 collateralRatio = IFxBasePool(cachedPool).getCollateralRatio(fSupply, xSupply);
      if (collateralRatio <= MIN_COLLATERAL_RATIO) revert();

      if (cachedPool == pool) {
        poolCollateralRatio = collateralRatio;
      }
    }

    if (pool != address(0)) {
      uint256 stabilityRatio = IFxBasePool(pool).getStabilityRatio();
      if (poolCollateralRatio <= stabilityRatio) revert();
    }
  }
}
