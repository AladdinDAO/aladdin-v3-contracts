// SPDX-License-Identifier: MIT

pragma solidity =0.8.20;

import { IERC20 } from "@openzeppelin/contracts-v4/token/ERC20/IERC20.sol";

import { ConcentratorStrategyBase } from "../../../concentrator/strategies/ConcentratorStrategyBase.sol";

contract MockAutoCompoundingConcentratorStrategy is ConcentratorStrategyBase {
  string public constant name = "MockAutoCompoundingConcentratorStrategy";

  address public token;

  uint256 public harvested;

  constructor(address _operator, address _token) initializer {
    token = _token;

    __ConcentratorStrategyBase_init(_operator, new address[](0));
  }

  function setHarvested(uint256 _amount) external {
    IERC20(token).transferFrom(msg.sender, address(this), _amount);
    harvested = _amount;
  }

  function deposit(address, uint256) external override onlyOperator {}

  function withdraw(address _recipient, uint256 _amount) external override onlyOperator {
    IERC20(token).transfer(_recipient, _amount);
  }

  function harvest(address, address) external override onlyOperator returns (uint256 amount) {
    amount = harvested;
    harvested = 0;
  }
}
