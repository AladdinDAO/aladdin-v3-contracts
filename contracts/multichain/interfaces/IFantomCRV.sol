// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

interface IFantomCRV {
  // solhint-disable-next-line func-name-mixedcase
  function Swapout(uint256 amount, address bindaddr) external returns (bool);
}
