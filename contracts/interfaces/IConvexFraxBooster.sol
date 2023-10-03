// SPDX-License-Identifier: MIT

pragma solidity ^0.7.0 || ^0.8.0;

interface IConvexFraxBooster {
  function createVault(uint256 _pid) external returns (address);
}
