// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

import "../interfaces/ICLeverAMOStrategy.sol";

import "../../strategies/ManualCompoundingConvexCurveStrategy.sol";

contract AMOConvexCurveStrategy is ManualCompoundingConvexCurveStrategy, ICLeverAMOStrategy {
  /// @inheritdoc ICLeverAMOStrategy
  function strategyBalance() external view override returns (uint256) {
    return IConvexBasicRewards(rewarder).balanceOf(address(this));
  }
}
