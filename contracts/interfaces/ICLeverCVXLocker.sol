// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;
pragma abicoder v2;

import "./IVotiumMultiMerkleStash.sol";

interface ICLeverCVXLocker {
  event Deposit(address indexed _account, uint256 _amount);
  event Unlock(address indexed _account, uint256 _amount);
  event Withdraw(address indexed _account, uint256 _amount);
  event Repay(address indexed _account, uint256 _cvxAmount, uint256 _clevCVXAmount);
  event Borrow(address indexed _account, uint256 _amount);
  event Claim(address indexed _account, uint256 _amount);
  event Harvest(address indexed _caller, uint256 _reward, uint256 _platformFee, uint256 _harvestBounty);

  function getUserInfo(address _account)
    external
    view
    returns (
      uint256 totalDeposited,
      uint256 totalPendingUnlocked,
      uint256 totalUnlocked,
      uint256 totalBorrowed,
      uint256 totalReward
    );

  function deposit(uint256 _amount) external;

  function unlock(uint256 _amount) external;

  function withdrawUnlocked() external;

  function repay(uint256 _cvxAmount, uint256 _clevCVXAmount) external;

  function borrow(uint256 _amount, bool _depositToFurnace) external;

  function donate(uint256 _amount) external;

  function harvest(address _recipient, uint256 _minimumOut) external returns (uint256);

  function harvestVotium(IVotiumMultiMerkleStash.claimParam[] calldata claims, uint256 _minimumOut)
    external
    returns (uint256);
}
