// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

interface IStakeDAOSdTokenDepositor {
  /// @notice Address of the token to be locked.
  function token() external view returns (address);

  /// @notice Address of the locker contract.
  function locker() external view returns (address);

  /// @notice Address of the sdToken minter contract.
  function minter() external view returns (address);

  /// @notice Fee percent to users who spend gas to increase lock.
  function lockIncentivePercent() external view returns (uint256);

  /// @notice Incentive accrued in token to users who spend gas to increase lock.
  function incentiveToken() external view returns (uint256);

  /// @notice Gauge to deposit sdToken into.
  function gauge() external view returns (address);

  /// @notice Deposit tokens, and receive sdToken or sdTokenGauge in return.
  /// @param _amount Amount of tokens to deposit.
  /// @param _lock Whether to lock the tokens in the locker contract.
  /// @param _stake Whether to stake the sdToken in the gauge.
  /// @param _user Address of the user to receive the sdToken.
  /// @dev If the lock is true, the tokens are directly sent to the locker and increase the lock amount as veToken.
  /// If the lock is false, the tokens are sent to this contract until someone locks them. A small percent of the deposit
  /// is used to incentivize users to lock the tokens.
  /// If the stake is true, the sdToken is staked in the gauge that distributes rewards. If the stake is false, the sdToken
  /// is sent to the user.
  function deposit(
    uint256 _amount,
    bool _lock,
    bool _stake,
    address _user
  ) external;

  /// @notice Lock tokens held by the contract
  /// @dev The contract must have Token to lock
  function lockToken() external;
}
