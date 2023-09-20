// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract MockTokenWrapper {
  address public src;

  address public dst;

  uint256 public dstAmount;

  uint256 public srcAmount;

  function setSrcAmount(uint256 _srcAmount) external {
    srcAmount = _srcAmount;
  }

  function setDstAmount(uint256 _dstAmount) external {
    dstAmount = _dstAmount;
  }

  function set(address _src, address _dst) external {
    src = _src;
    dst = _dst;
  }

  function wrap(uint256 _amount) external returns (uint256) {
    require(IERC20(src).balanceOf(address(this)) == _amount, "dst amount mismatch");

    IERC20(src).transfer(address(1), _amount);
    IERC20(dst).transfer(msg.sender, dstAmount);
    return dstAmount;
  }

  function unwrap(uint256 _amount) external returns (uint256) {
    require(IERC20(dst).balanceOf(address(this)) == _amount, "dst amount mismatch");

    IERC20(dst).transfer(address(1), _amount);
    IERC20(src).transfer(msg.sender, srcAmount);
    return srcAmount;
  }
}
