// SPDX-License-Identifier: MIT

pragma solidity =0.8.20;
pragma abicoder v2;

import { Clones } from "@openzeppelin/contracts-v4/proxy/Clones.sol";

import { IConcentratorHarvesterPoolFactory } from "../../interfaces/concentrator/IConcentratorHarvesterPoolFactory.sol";
import { IConvexBooster } from "../../interfaces/IConvexBooster.sol";

import { ConvexCurveHarvesterPoolFactory } from "../permissionless/ConvexCurveHarvesterPoolFactory.sol";
import { xETHConvexCurveStrategy } from "./xETHConvexCurveStrategy.sol";
import { xETHHarvesterPool } from "./xETHHarvesterPool.sol";

contract xETHHarvesterPoolFactory is ConvexCurveHarvesterPoolFactory {
  /*************
   * Constants *
   *************/

  /// @inheritdoc IConcentratorHarvesterPoolFactory
  string public constant override name = "xETHConvexCurveHarvesterFactory";

  /***************
   * Constructor *
   ***************/

  constructor(
    address _compounder,
    address _poolBeacon,
    address _strategyTemplate
  ) ConvexCurveHarvesterPoolFactory(_compounder, _poolBeacon, _strategyTemplate) {}

  /**********************
   * Internal Functions *
   **********************/

  /// @inheritdoc ConvexCurveHarvesterPoolFactory
  function _createStrategy(IConvexBooster.PoolInfo memory _info, address _pool)
    internal
    virtual
    override
    returns (address _strategy)
  {
    _strategy = Clones.clone(strategyTemplate);
    xETHConvexCurveStrategy(payable(_strategy)).initialize(_pool, _info.lptoken, _info.crvRewards);
    xETHConvexCurveStrategy(payable(_strategy)).transferOwnership(owner());
  }

  /// @inheritdoc ConvexCurveHarvesterPoolFactory
  function _initializePool(
    IConvexBooster.PoolInfo memory _info,
    address _pool,
    address _strategy
  ) internal virtual override {
    xETHHarvesterPool(_pool).initialize(_info.lptoken, treasury, harvester, converter, _strategy);
    xETHHarvesterPool(_pool).updateExpenseRatio(10e7); // 10%
    xETHHarvesterPool(_pool).updateHarvesterRatio(2e7); // 2%

    xETHHarvesterPool(_pool).grantRole(bytes32(0), owner());
    xETHHarvesterPool(_pool).revokeRole(bytes32(0), address(this));
  }
}
