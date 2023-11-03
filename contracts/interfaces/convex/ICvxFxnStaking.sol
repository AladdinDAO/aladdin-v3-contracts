// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;
pragma abicoder v2;

// solhint-disable func-name-mixedcase

interface ICvxFxnStaking {
  struct EarnedData {
    address token;
    uint256 amount;
  }

  function rewardTokenLength() external view returns (uint256);

  function rewardTokens(uint256) external view returns (address);

  function rewardPerToken(address _rewardsToken) external view returns (uint256);

  function rewardRedirect(address _account) external view returns (address);

  // Address and claimable amount of all reward tokens for the given account
  function claimableRewards(address _account) external view returns (EarnedData[] memory userRewards);

  // set any claimed rewards to automatically go to a different address
  // set address to zero to disable
  function setRewardRedirect(address _to) external;

  // deposit fxn for cvxfxn and stake
  function deposit(uint256 _amount, bool _lock) external;

  // deposit fxs for cvxfxs and stake
  function deposit(uint256 _amount) external;

  // deposit cvxfxs
  function stake(uint256 _amount) external;

  // deposit all cvxfxs
  function stakeAll() external;

  // deposit cvxfxs and accredit a different address
  function stakeFor(address _for, uint256 _amount) external;

  // withdraw cvxfxs
  function withdraw(uint256 _amount) external;

  // Claim all pending rewards
  function getReward(address _address) external;

  // Claim all pending rewards and forward
  function getReward(address _address, address _forwardTo) external;
}
