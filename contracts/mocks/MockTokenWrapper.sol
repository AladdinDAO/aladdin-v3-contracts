// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

contract MockTokenWrapper {
  address public src;

  address public dst;

  function set(address _src, address _dst) external {
    src = _src;
    dst = _dst;
  }
}
