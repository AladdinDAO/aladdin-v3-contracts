// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

interface IConvexToken {
  function totalCliffs() external view returns (uint256);

  function reductionPerCliff() external view returns (uint256);

  function totalSupply() external view returns (uint256);
}
