// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

interface IConvexFXNDepositor {
  //deposit fxn for cvxfxn
  function deposit(uint256 _amount, bool _lock) external;

  function depositAll(bool _lock) external;

  function lockFxn() external;
}
