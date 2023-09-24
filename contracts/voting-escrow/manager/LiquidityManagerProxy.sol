// SPDX-License-Identifier: MIT

pragma solidity =0.8.20;

import { Ownable2Step } from "@openzeppelin/contracts-v4/access/Ownable2Step.sol";

import { IMultipleRewardDistributor } from "../../common/rewards/distributor/IMultipleRewardDistributor.sol";
import { ILiquidityManager } from "../interfaces/ILiquidityManager.sol";

contract LiquidityManagerProxy is Ownable2Step {
  address public immutable gauge;

  address public manager;

  constructor(address _gauge) {
    gauge = _gauge;
  }

  function setManager(address _manager) external {
    require(manager == address(0), "initialized");
    manager = _manager;
    Ownable2Step(_manager).acceptOwnership();
  }

  function manage() external {
    ILiquidityManager(manager).manage();

    // todo deposit rewards to
    IMultipleRewardDistributor(gauge).depositReward(address(0), 0);
  }
}
