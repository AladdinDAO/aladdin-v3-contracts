// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

interface ITokenWrapper {
  function src() external view returns (address);

  function dst() external view returns (address);

  function wrap(uint256 amount) external returns (uint256);

  function unwrap(uint256 amount) external returns (uint256);
}
