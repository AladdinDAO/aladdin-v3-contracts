// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

interface IPolygonRootChainManager {
  function depositFor(
    address user,
    address rootToken,
    bytes calldata depositData
  ) external;

  function exit(bytes calldata inputData) external;
}
