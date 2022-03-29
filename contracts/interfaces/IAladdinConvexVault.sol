// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

interface IAladdinConvexVault {
  enum ClaimOption {
    None,
    Claim,
    ClaimAsCvxCRV,
    ClaimAsCRV,
    ClaimAsCVX,
    ClaimAsETH
  }

  event Deposit(uint256 indexed _pid, address indexed _sender, uint256 _amount);
  event Withdraw(uint256 indexed _pid, address indexed _sender, uint256 _shares);
  event Claim(address indexed _sender, uint256 _reward, ClaimOption _option);
  event Harvest(address indexed _caller, uint256 _reward, uint256 _platformFee, uint256 _harvestBounty);

  event UpdateWithdrawalFeePercentage(uint256 indexed _pid, uint256 _feePercentage);
  event UpdatePlatformFeePercentage(uint256 indexed _pid, uint256 _feePercentage);
  event UpdateHarvestBountyPercentage(uint256 indexed _pid, uint256 _percentage);
  event UpdatePlatform(address indexed _platform);
  event UpdateZap(address indexed _zap);
  event UpdatePoolRewardTokens(uint256 indexed _pid, address[] _rewardTokens);
  event AddPool(uint256 indexed _pid, uint256 _convexPid, address[] _rewardTokens);
  event PausePoolDeposit(uint256 indexed _pid, bool _status);
  event PausePoolWithdraw(uint256 indexed _pid, bool _status);

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
