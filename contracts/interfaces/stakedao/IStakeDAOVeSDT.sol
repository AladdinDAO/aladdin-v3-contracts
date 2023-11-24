// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

// solhint-disable func-name-mixedcase
// solhint-disable var-name-mixedcase

interface IStakeDAOVeSDT {
  function create_lock(uint256 _value, uint256 _unlock_time) external;

  function deposit_for(address _addr, uint256 _value) external;

  function increase_amount(uint256 _value) external;

  function increase_unlock_time(uint256 _unlock_time) external;
}
