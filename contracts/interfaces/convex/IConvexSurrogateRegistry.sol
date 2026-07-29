// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

interface IConvexSurrogateRegistry {
  function setSurrogate(address _surrogate) external;

  function isSurrogate(address _surrogate, address _account)
    external
    view
    returns (bool);
}
