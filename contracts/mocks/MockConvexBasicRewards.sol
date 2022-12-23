// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

contract MockConvexBasicRewards {
  uint256 public pid;

  address public stakingToken;

  constructor(uint256 _pid, address _stakingToken) {
    pid = _pid;
    stakingToken = _stakingToken;
  }

  function getReward() external returns (bool) {
    return true;
  }
}
