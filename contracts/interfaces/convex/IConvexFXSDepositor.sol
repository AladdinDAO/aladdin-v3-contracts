// SPDX-License-Identifier: MIT

pragma solidity ^0.7.0 || ^0.8.0;

interface IConvexFXSDepositor {
  //deposit fxs for cvxFxs
  //can locking immediately or defer locking to someone else by paying a fee.
  function deposit(uint256 _amount, bool _lock) external;

  function depositAll(bool _lock) external;

  function lockFxs() external;

  function incentiveFxs() external view returns (uint256);
}
