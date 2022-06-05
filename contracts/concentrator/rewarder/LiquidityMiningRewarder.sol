// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

contract LiquidityMiningRewarder {
  using SafeERC20 for IERC20;

  address public ctr;
  address public gauge;

  constructor(address _ctr, address _gauge) {
    require(_ctr != address(0), "zero cont address");
    require(_gauge != address(0), "zero gauge address");

    ctr = _ctr;
    gauge = _gauge;
  }

  function claim() external {
    require(msg.sender == gauge, "not gauge");

    address _ctr = ctr;
    uint256 _balance = IERC20(_ctr).balanceOf(address(this));
    if (_balance > 0) {
      IERC20(_ctr).safeTransfer(msg.sender, _balance);
    }
  }
}
