// SPDX-License-Identifier: MIT

pragma solidity ^0.7.0 || ^0.8.0;

interface ICvxRewardPool {
  function getReward(
    address _account,
    bool _claimExtras,
    bool _stake
  ) external;

  function getReward(bool _stake) external;

  function withdrawAll(bool claim) external;

  function withdraw(uint256 _amount, bool claim) external;

  function stakeFor(address _for, uint256 _amount) external;

  function stakeAll() external;

  function stake(uint256 _amount) external;

  function totalSupply() external view returns (uint256);

  function balanceOf(address account) external view returns (uint256);

  function rewardToken() external view returns (address);

  function extraRewards(uint256) external view returns (address);

  function extraRewardsLength() external view returns (uint256);
}
