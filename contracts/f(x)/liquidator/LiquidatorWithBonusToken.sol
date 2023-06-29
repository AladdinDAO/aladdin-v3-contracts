// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

import { IStabilityPool } from "../interfaces/IStabilityPool.sol";

contract LiquidatorWithBonusToken is Ownable {
  using SafeERC20 for IERC20;

  address public immutable stabilityPool;

  address public immutable bonusToken;

  uint256 public bonus;

  constructor(address _stabilityPool, address _bonusToken) {
    stabilityPool = _stabilityPool;
    bonusToken = _bonusToken;
  }

  function liquidate(uint256 _minBaseOut) external {
    IStabilityPool(stabilityPool).liquidate(uint256(-1), _minBaseOut);

    IERC20(bonusToken).safeTransfer(msg.sender, bonus);
  }

  function updateBonus(uint256 _bonus) external onlyOwner {
    bonus = _bonus;
  }
}
