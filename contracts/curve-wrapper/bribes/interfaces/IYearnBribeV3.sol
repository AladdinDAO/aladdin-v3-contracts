// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

// solhint-disable func-name-mixedcase
// solhint-disable var-name-mixedcase

interface IYearnBribeV3 {
  function reward_per_token(address gauge, address reward_token) external view returns (uint256);

  function last_user_claim(
    address _user,
    address _gauge,
    address _reward_token
  ) external view returns (uint256);

  /// @notice Estimate pending bribe amount for any user
  /// @dev This function returns zero if active_period has not yet been updated.
  /// @dev Should not rely on this function for any user case where precision is required.
  function claimable(
    address user,
    address gauge,
    address reward_token
  ) external view returns (uint256);

  function claim_reward(address gauge, address reward_token) external returns (uint256);

  function claim_reward_for(
    address user,
    address gauge,
    address reward_token
  ) external returns (uint256);

  function claim_reward_for_many(
    address[] calldata _users,
    address[] calldata _gauges,
    address[] calldata _reward_tokens
  ) external returns (uint256[] memory amounts);
}
