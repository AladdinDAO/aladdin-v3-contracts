// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

interface IStakingProxyRebalancePool {
  // deposit into rebalance pool with ftoken
  function deposit(uint256 _amount) external;

  // deposit into rebalance pool with fxusd
  function depositFxUsd(uint256 _amount) external;

  // deposit into rebalance pool with base
  function depositBase(uint256 _amount, uint256 _minAmountOut) external;

  // withdraw a staked position and return ftoken
  function withdraw(uint256 _amount) external;

  // withdraw a staked position and return fxusd
  function withdrawFxUsd(uint256 _amount) external;

  // withdraw from rebalance pool(v2) and return underlying base
  function withdrawAsBase(uint256 _amount, uint256 _minOut) external;

  // return earned tokens on staking contract and any tokens that are on this vault
  function earned() external returns (address[] memory token_addresses, uint256[] memory total_earned);

  /*
  claim flow:
    mint fxn rewards directly to vault
    claim extra rewards directly to the owner
    calculate fees on fxn
    distribute fxn between owner and fee deposit
  */
  function getReward() external;

  // get reward with claim option.
  function getReward(bool _claim) external;

  //get reward with claim option, as well as a specific token list to claim from convex extra rewards
  function getReward(bool _claim, address[] calldata _tokenList) external;

  //return any tokens in vault back to owner
  function transferTokens(address[] calldata _tokenList) external;
}
