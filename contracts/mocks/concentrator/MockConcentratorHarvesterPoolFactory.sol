// SPDX-License-Identifier: MIT

pragma solidity =0.8.20;

import { IHarvesterPoolEntryPoint } from "../../interfaces/concentrator/IHarvesterPoolEntryPoint.sol";

contract MockConcentratorHarvesterPoolFactory {
  string public name;

  address public entryPoint;

  mapping(address => address) public getPoolByAsset;

  constructor(string memory _name, address _entryPoint) {
    name = _name;
    entryPoint = _entryPoint;
  }

  function register(address asset, address pool) external {
    getPoolByAsset[asset] = pool;
    IHarvesterPoolEntryPoint(entryPoint).registerConvexCurvePool(asset);
  }
}
