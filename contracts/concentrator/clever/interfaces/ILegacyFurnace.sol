// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

interface ILegacyFurnace {
  function getUserInfo(address _account) external view returns (uint256 unrealised, uint256 realised);

  function deposit(uint256 _amount) external;

  function withdraw(address _recipient, uint256 _amount) external;

  function claim(address _recipient) external;
}
