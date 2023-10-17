// SPDX-License-Identifier: MIT

pragma solidity ^0.7.0 || ^0.8.0;

interface IConvexVirtualBalanceRewardPool {
  function rewardToken() external view returns (address);

  function earned(address account) external view returns (uint256);
}
