// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;
pragma abicoder v2;

// solhint-disable func-name-mixedcase

interface ICvxCrvStakingWrapper {
  struct EarnedData {
    address token;
    uint256 amount;
  }

  function user_checkpoint(address _account) external returns (bool);

  // run earned as a mutable function to claim everything before calculating earned rewards
  function earned(address _account) external returns (EarnedData[] memory claimable);

  // set a user's reward weight to determine how much of each reward group to receive
  function setRewardWeight(uint256 _weight) external;

  function balanceOf(address) external view returns (uint256);

  // get user's weighted balance for specified reward group
  function userRewardBalance(address _address, uint256 _rewardGroup) external view returns (uint256);

  function userRewardWeight(address _address) external view returns (uint256);

  // get weighted supply for specified reward group
  function rewardSupply(uint256 _rewardGroup) external view returns (uint256);

  // claim
  function getReward(address _account) external;

  // claim and forward
  function getReward(address _account, address _forwardTo) external;

  // deposit vanilla crv
  function deposit(uint256 _amount, address _to) external;

  // stake cvxcrv
  function stake(uint256 _amount, address _to) external;

  // backwards compatibility for other systems (note: amount and address reversed)
  function stakeFor(address _to, uint256 _amount) external;

  // withdraw to convex deposit token
  function withdraw(uint256 _amount) external;
}
