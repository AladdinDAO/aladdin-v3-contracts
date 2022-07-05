// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

interface IAnyCallProxy {
  event LogAnyCall(address indexed from, address indexed to, bytes data, address _fallback, uint256 indexed toChainID);

  event LogAnyExec(
    address indexed from,
    address indexed to,
    bytes data,
    bool success,
    bytes result,
    address _fallback,
    uint256 indexed fromChainID
  );

  function setWhitelist(
    address _from,
    address _to,
    uint256 _toChainID,
    bool _flag
  ) external;

  function anyCall(
    address _to,
    bytes calldata _data,
    address _fallback,
    uint256 _toChainID
  ) external;

  function anyExec(
    address _from,
    address _to,
    bytes calldata _data,
    address _fallback,
    uint256 _fromChainID
  ) external;

  function withdraw(uint256 _amount) external;

  function deposit(address _account) external payable;
}
