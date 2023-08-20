// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

interface IReservePool {
  function requestBonus(
    address _token,
    address _recipient,
    uint256 _originalAmount
  ) external;
}
