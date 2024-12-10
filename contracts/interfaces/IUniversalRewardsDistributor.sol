// SPDX-License-Identifier: MIT

pragma solidity ^0.7.0 || ^0.8.0;

interface IUniversalRewardsDistributor {
  struct ClaimParams {
    address reward;
    uint256 claimable;
    bytes32[] proof;
  }

  /// @notice The `amount` of `reward` token already claimed by `account`.
  function claimed(address account, address reward) external view returns (uint256);

  /// @notice Claims rewards.
  /// @param account The address to claim rewards for.
  /// @param reward The address of the reward token.
  /// @param claimable The overall claimable amount of token rewards.
  /// @param proof The merkle proof that validates this claim.
  /// @return amount The amount of reward token claimed.
  /// @dev Anyone can claim rewards on behalf of an account.
  function claim(
    address account,
    address reward,
    uint256 claimable,
    bytes32[] calldata proof
  ) external returns (uint256 amount);
}
