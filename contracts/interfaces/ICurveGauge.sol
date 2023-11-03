// SPDX-License-Identifier: MIT

pragma solidity ^0.7.0 || ^0.8.0;

// solhint-disable func-name-mixedcase

interface ICurveGauge {
  function deposit(uint256) external;

  function balanceOf(address) external view returns (uint256);

  function withdraw(uint256) external;

  function claim_rewards() external;

  function claim_rewards(address) external;

  function claim_rewards(address, address) external;

  function reward_tokens(uint256) external view returns (address); //v2

  function rewarded_token() external view returns (address); //v1

  function reward_count() external view returns (uint256);

  function staking_token() external view returns (address);

  function rewards_receiver(address) external view returns (address);

  function set_rewards_receiver(address) external;
}
