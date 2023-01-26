// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

// solhint-disable func-name-mixedcase

interface ICurveGauge {
  function deposit(uint256) external;

  function balanceOf(address) external view returns (uint256);

  function withdraw(uint256) external;

  function claim_rewards() external;

  function claim_rewards(address) external;

  function reward_tokens(uint256) external view returns (address); //v2

  function rewarded_token() external view returns (address); //v1

  function reward_count() external view returns (uint256);

  function staking_token() external view returns (address);

  /// @notice Get the number of already-claimed reward tokens for a user
  /// @dev This method is only available for v3/v4/v5 gauge.
  /// @param _addr Account to get reward amount for
  /// @param _token Token to get reward amount for
  /// @return uint256 Total amount of `_token` already claimed by `_addr`
  function claimed_reward(address _addr, address _token) external view returns (uint256);

  function integrate_fraction(address) external view returns (uint256);

  function user_checkpoint(address) external returns (bool);
}
