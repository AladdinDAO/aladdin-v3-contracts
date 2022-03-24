// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;
pragma abicoder v2;

interface IConvexCVXLocker {
  struct LockedBalance {
    uint112 amount;
    uint112 boosted;
    uint32 unlockTime;
  }

  function lockedBalanceOf(address _user) external view returns (uint256 amount);

  // Information on a user's locked balances
  function lockedBalances(address _user)
    external
    view
    returns (
      uint256 total,
      uint256 unlockable,
      uint256 locked,
      LockedBalance[] memory lockData
    );

  function lock(
    address _account,
    uint256 _amount,
    uint256 _spendRatio
  ) external;

  function processExpiredLocks(
    bool _relock,
    uint256 _spendRatio,
    address _withdrawTo
  ) external;

  function processExpiredLocks(bool _relock) external;

  function kickExpiredLocks(address _account) external;

  function getReward(address _account, bool _stake) external;

  function getReward(address _account) external;
}
