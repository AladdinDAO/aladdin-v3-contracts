// SPDX-License-Identifier: MIT

pragma solidity =0.8.20;

import { IERC20 } from "@openzeppelin/contracts-v4/token/ERC20/IERC20.sol";

import { ConcentratorStrategyBase } from "../../../concentrator/strategies/ConcentratorStrategyBase.sol";

contract MockConcentratorStrategy is ConcentratorStrategyBase {
  event Deposit(address receiver, uint256 amount);

  string public constant name = "MockConcentratorStrategy";

  address public token;

  address public rewardToken;

  uint256 public harvested;

  constructor(
    address _operator,
    address _token,
    address _rewardToken
  ) initializer {
    token = _token;
    rewardToken = _rewardToken;

    __ConcentratorStrategyBase_init(_operator, new address[](0));
  }

  function reinitialize() external {
    __ConcentratorStrategyBase_init(address(0), new address[](0));
  }

  function setHarvested(uint256 _amount) external {
    IERC20(rewardToken).transferFrom(msg.sender, address(this), _amount);
    harvested = _amount;
  }

  function deposit(address receiver, uint256 amount) external override onlyOperator {
    emit Deposit(receiver, amount);
  }

  function withdraw(address _recipient, uint256 _amount) external override onlyOperator {
    IERC20(token).transfer(_recipient, _amount);
  }

  function harvest(address, address) external override onlyOperator returns (uint256 amount) {
    amount = harvested;
    harvested = 0;
    IERC20(rewardToken).transfer(msg.sender, amount);
  }
}
