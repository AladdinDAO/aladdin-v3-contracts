// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

interface ICrossChainCallProxy {
  function crossChainCall(
    address _to,
    bytes memory _data,
    address _fallback,
    uint256 _toChainID
  ) external;
}
