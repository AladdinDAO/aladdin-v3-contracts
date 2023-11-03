// SPDX-License-Identifier: MIT

pragma solidity =0.8.20;

import { IERC20 } from "@openzeppelin/contracts-v4/token/ERC20/IERC20.sol";

import { LiquidityManagerBaseImmutable } from "../../../voting-escrow/manager/immutable/LiquidityManagerBaseImmutable.sol";

contract MockLiquidityManagerImmutable is LiquidityManagerBaseImmutable {
  event Deposit(address receiver, uint256 amount, bool manage);
  event Withdraw(address receiver, uint256 amount);

  constructor(address _operator, address _token) LiquidityManagerBaseImmutable(_operator, _token) {}

  function getRewardTokens() external view override returns (address[] memory) {}

  function manage() external override {}

  function harvest(address receiver) external override {}

  function _managedBalance() internal view virtual override returns (uint256) {
    return IERC20(token).balanceOf(address(this));
  }

  function _deposit(
    address _receiver,
    uint256 _amount,
    bool _manage
  ) internal virtual override {
    emit Deposit(_receiver, _amount, _manage);
  }

  function _withdraw(address _receiver, uint256 _amount) internal virtual override {
    IERC20(token).transfer(_receiver, _amount);
    emit Withdraw(_receiver, _amount);
  }
}
