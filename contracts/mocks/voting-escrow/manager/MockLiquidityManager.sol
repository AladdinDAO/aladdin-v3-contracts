// SPDX-License-Identifier: MIT

pragma solidity =0.8.20;

import { IERC20 } from "@openzeppelin/contracts-v4/token/ERC20/IERC20.sol";

import { LiquidityManagerBase } from "../../../voting-escrow/manager/LiquidityManagerBase.sol";

contract MockLiquidityManager is LiquidityManagerBase {
  function initialize(address _operator, address _token) external initializer {
    __LiquidityManagerBase_init(_operator, _token);
  }

  function getRewardTokens() external view override returns (address[] memory) {}

  function manage(address receiver) external override {}

  function harvest(address receiver) external override {}

  function _managedBalance() internal view virtual override returns (uint256) {
    return IERC20(token).balanceOf(address(this));
  }

  function _deposit(
    address _receiver,
    uint256 _amount,
    bool _manage
  ) internal virtual override {}

  function _withdraw(address _receiver, uint256 _amount) internal virtual override {
    IERC20(token).transfer(_receiver, _amount);
  }
}
