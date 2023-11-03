// SPDX-License-Identifier: MIT

pragma solidity ^0.7.0 || ^0.8.0;

interface IConvexBasicRewards {
  function pid() external view returns (uint256);

  function totalSupply() external view returns (uint256);

  function periodFinish() external view returns (uint256);

  function rewardRate() external view returns (uint256);

  function stakingToken() external view returns (address);

  function stakeFor(address, uint256) external returns (bool);

  function balanceOf(address) external view returns (uint256);

  function earned(address) external view returns (uint256);

  function withdrawAll(bool) external returns (bool);

  function withdraw(uint256, bool) external returns (bool);

  function withdrawAndUnwrap(uint256, bool) external returns (bool);

  function getReward() external returns (bool);

  function stake(uint256) external returns (bool);

  function rewardToken() external view returns (address);

  function extraRewards(uint256) external view returns (address);

  function extraRewardsLength() external view returns (uint256);
}
