// SPDX-License-Identifier: MIT

pragma solidity ^0.7.0 || ^0.8.0;

// solhint-disable func-name-mixedcase

interface ICurveGauge {
  /*************************
   * Public View Functions *
   *************************/

  function staking_token() external view returns (address);

  function totalSupply() external view returns (uint256);

  function balanceOf(address account) external view returns (uint256);

  function rewarded_token() external view returns (address); //v1

  function reward_count() external view returns (uint256); // v2

  function reward_tokens(uint256 index) external view returns (address); // v2

  function rewards_receiver(address account) external view returns (address); // v3

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @notice Deposit `value` LP tokens.
  ///
  /// @param value Number of tokens to deposit
  function deposit(uint256 value) external;

  /// @notice Deposit `value` LP tokens.
  ///
  /// @param value Number of tokens to deposit
  /// @param addr Address to deposit for
  function deposit(uint256 value, address addr) external;

  /// @notice Deposit `value` LP tokens.
  ///
  /// @param value Number of tokens to deposit.
  /// @param addr Address to deposit for.
  /// @param _claim_rewards Whether to claim pending reward tokens.
  function deposit(
    uint256 value,
    address addr,
    bool _claim_rewards
  ) external;

  /// @notice Withdraw `value` LP tokens
  ///
  /// @param value Number of tokens to withdraw
  function withdraw(uint256 value) external;

  /// @notice Withdraw `value` LP tokens
  ///
  /// @param value Number of tokens to withdraw.
  /// @param _claim_rewards Whether to claim pending reward tokens.
  function withdraw(uint256 value, bool _claim_rewards) external;

  /// @notice Claim available reward tokens for `msg.sender`.
  function claim_rewards() external;

  /// @notice Claim available reward tokens for `addr`.
  ///
  /// @param addr Address to claim for.
  function claim_rewards(address addr) external;

  /// @notice Claim available reward tokens for `addr`.
  ///
  /// @param addr Address to claim for.
  /// @param receiver Address to transfer rewards to. If set to `address(0)`,
  /// uses the default reward receiver for the caller
  function claim_rewards(address addr, address receiver) external;

  /// @notice Set the default reward receiver for the caller.
  ///
  /// @dev When set to `address(0), rewards are sent to the caller.
  ///
  /// @param receiver Receiver address for any rewards claimed via `claim_rewards`
  function set_rewards_receiver(address receiver) external;
}
