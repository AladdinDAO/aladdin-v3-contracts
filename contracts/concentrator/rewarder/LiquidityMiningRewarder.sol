// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

contract LiquidityMiningRewarder {
  using SafeERC20 for IERC20;

  address public cont;
  address public gauge;

  constructor(address _cont, address _gauge) {
    require(_cont != address(0), "zero cont address");
    require(_gauge != address(0), "zero gauge address");

    cont = _cont;
    gauge = _gauge;
  }

  function claim() external {
    require(msg.sender == gauge, "not gauge");

    address _cont = cont;
    uint256 _balance = IERC20(_cont).balanceOf(address(this));
    if (_balance > 0) {
      IERC20(_cont).safeTransfer(msg.sender, _balance);
    }
  }
}
