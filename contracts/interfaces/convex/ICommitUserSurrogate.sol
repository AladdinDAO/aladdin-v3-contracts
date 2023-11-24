// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

interface ICommitUserSurrogate {
  function commit(address _surrogate, address _contractAddr) external;
}
