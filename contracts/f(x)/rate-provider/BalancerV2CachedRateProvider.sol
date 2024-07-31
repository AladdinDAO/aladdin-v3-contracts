// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import { IERC4626 } from "@openzeppelin/contracts-v4/interfaces/IERC4626.sol";

import { IFxRateProvider } from "../../interfaces/f(x)/IFxRateProvider.sol";
import { IBalancerPool } from "../../interfaces/IBalancerPool.sol";

// solhint-disable contract-name-camelcase

contract BalancerV2CachedRateProvider is IFxRateProvider {
  /// @notice The address of Balancer V2 pool.
  address public immutable pool;

  /// @notice The address of token to query.
  address public immutable token;

  constructor(address _pool, address _token) {
    pool = _pool;
    token = _token;
  }

  /// @inheritdoc IFxRateProvider
  function getRate() external view override returns (uint256) {
    (uint256 rate, , , ) = IBalancerPool(pool).getTokenRateCache(token);
    return rate;
  }
}
