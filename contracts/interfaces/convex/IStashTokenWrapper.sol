// SPDX-License-Identifier: MIT

pragma solidity ^0.7.0 || ^0.8.0;

interface IStashTokenWrapper {
  function token() external view returns (address);

  function rewardPool() external view returns (address);

  function isInvalid() external view returns (bool);

  function name() external view returns (string memory);

  function symbol() external view returns (string memory);

  function decimals() external view returns (uint8);

  function totalSupply() external view returns (uint256);

  function balanceOf(address _account) external view returns (uint256);

  function transfer(address _recipient, uint256 _amount) external returns (bool);
}
