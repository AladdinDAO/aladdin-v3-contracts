// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

import { IFxRebalancePool } from "../../interfaces/f(x)/IFxRebalancePool.sol";

contract RebalanceWithBonusToken is Ownable {
  using SafeERC20 for IERC20;

  address public immutable stabilityPool;

  address public immutable bonusToken;

  uint256 public bonus;

  constructor(address _stabilityPool, address _bonusToken) {
    stabilityPool = _stabilityPool;
    bonusToken = _bonusToken;
  }

  function liquidate(uint256 _minBaseOut) external {
    IFxRebalancePool(stabilityPool).liquidate(uint256(-1), _minBaseOut);

    uint256 _balance = IERC20(bonusToken).balanceOf(address(this));
    uint256 _bonus = bonus;
    if (_bonus > _balance) _bonus = _balance;
    if (_bonus > 0) {
      IERC20(bonusToken).safeTransfer(msg.sender, _bonus);
    }
  }

  function updateBonus(uint256 _bonus) external onlyOwner {
    bonus = _bonus;
  }
}
