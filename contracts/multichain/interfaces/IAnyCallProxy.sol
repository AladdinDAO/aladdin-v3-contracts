// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

interface IAnyCallProxy {
  function anyCall(
    address _to,
    bytes calldata _data,
    address _fallback,
    uint256 _toChainID
  ) external;

  function withdraw(uint256 _amount) external;

  function deposit(address _account) external payable;
}
