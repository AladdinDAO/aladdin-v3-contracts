// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;
pragma abicoder v2;

interface IConcentratorVault {
  enum ClaimOption {
    None,
    Claim,
    ClaimAsCvxCRV,
    ClaimAsCRV,
    ClaimAsCVX,
    ClaimAsETH
  }

  struct PoolInfo {
    // The amount of total deposited token.
    uint128 totalUnderlying;
    // The amount of total deposited shares.
    uint128 totalShare;
    // The accumulated acrv reward per share, with 1e18 precision.
    uint256 accRewardPerShare;
    // The pool id in Convex Booster.
    uint256 convexPoolId;
    // The address of deposited token.
    address lpToken;
    // The address of Convex reward contract.
    address crvRewards;
    // The withdraw fee percentage, with 1e9 precision.
    uint256 withdrawFeePercentage;
    // The platform fee percentage, with 1e9 precision.
    uint256 platformFeePercentage;
    // The harvest bounty percentage, with 1e9 precision.
    uint256 harvestBountyPercentage;
    // Whether deposit for the pool is paused.
    bool pauseDeposit;
    // Whether withdraw for the pool is paused.
    bool pauseWithdraw;
    // The list of addresses of convex reward tokens.
    address[] convexRewardTokens;
  }

  struct UserInfo {
    // The amount of shares the user deposited.
    uint128 shares;
    // The amount of current accrued rewards.
    uint128 rewards;
    // The reward per share already paid for the user, with 1e18 precision.
    uint256 rewardPerSharePaid;
  }

  function poolInfo(uint256 _pid) external view returns (PoolInfo memory);

  function userInfo(uint256 _pid, address _account) external view returns (UserInfo memory);

  function pendingReward(uint256 _pid, address _account) external view returns (uint256);

  function pendingRewardAll(address _account) external view returns (uint256);

  function deposit(uint256 _pid, uint256 _amount) external returns (uint256);

  function depositAll(uint256 _pid) external returns (uint256);

  function zapAndDeposit(
    uint256 _pid,
    address _token,
    uint256 _amount,
    uint256 _minAmount
  ) external payable returns (uint256);

  function zapAllAndDeposit(
    uint256 _pid,
    address _token,
    uint256 _minAmount
  ) external payable returns (uint256);

  function withdrawAndZap(
    uint256 _pid,
    uint256 _shares,
    address _token,
    uint256 _minOut
  ) external returns (uint256);

  function withdrawAllAndZap(
    uint256 _pid,
    address _token,
    uint256 _minOut
  ) external returns (uint256);

  function withdrawAndClaim(
    uint256 _pid,
    uint256 _shares,
    uint256 _minOut,
    ClaimOption _option
  ) external returns (uint256, uint256);

  function withdrawAllAndClaim(
    uint256 _pid,
    uint256 _minOut,
    ClaimOption _option
  ) external returns (uint256, uint256);

  function claim(
    uint256 _pid,
    uint256 _minOut,
    ClaimOption _option
  ) external returns (uint256);

  function claimAll(uint256 _minOut, ClaimOption _option) external returns (uint256);

  function harvest(
    uint256 _pid,
    address _recipient,
    uint256 _minimumOut
  ) external returns (uint256);
}
