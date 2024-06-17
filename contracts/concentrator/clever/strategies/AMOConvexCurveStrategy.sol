// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import { IERC20 } from "@openzeppelin/contracts-v4/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts-v4/token/ERC20/utils/SafeERC20.sol";

import { IConvexBasicRewards } from "../../../interfaces/IConvexBasicRewards.sol";
import { ICLeverAMOStrategy } from "../interfaces/ICLeverAMOStrategy.sol";

import { ManualCompoundingConvexCurveStrategy } from "../../strategies/ManualCompoundingConvexCurveStrategy.sol";

contract AMOConvexCurveStrategy is ManualCompoundingConvexCurveStrategy, ICLeverAMOStrategy {
  /// @inheritdoc ICLeverAMOStrategy
  function strategyBalance() external view override returns (uint256) {
    return IConvexBasicRewards(rewarder).balanceOf(address(this));
  }
}
