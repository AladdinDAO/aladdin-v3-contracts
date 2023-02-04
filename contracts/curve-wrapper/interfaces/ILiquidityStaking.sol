// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

interface ILiquidityStaking {
  /**********
   * Events *
   **********/

  /// @notice Emitted when someone deposit token to the contract.
  /// @param sender The owner of the base token.
  /// @param owner The recipient of the locked base token.
  /// @param amount The amount of token deposited.
  event Deposit(address indexed sender, address indexed owner, uint256 amount);

  /// @notice Emitted when someone withdraw pool share.
  /// @param owner The owner of the pool share.
  /// @param recipient The recipient of the withdrawn token.
  /// @param amount The amount of token withdrawn.
  event Withdraw(address indexed owner, address indexed recipient, uint256 amount);

  /// @notice Emitted when someone claim pending rewards.
  /// @param token The address of reward token.
  /// @param owner The address of reward token owner.
  /// @param recipient The address of reward token recipient.
  /// @param amount The amount of reward token claimed.
  event Claim(address indexed token, address indexed owner, address indexed recipient, uint256 amount);

  /*************************
   * Public View Functions *
   *************************/

  /// @notice The address of Curve Booster.
  function booster() external view returns (address);

  /// @notice The address of staking token.
  function stakingToken() external view returns (address);

  /// @notice Return the address of reward token.
  function rewardToken() external view returns (address);

  /// @notice Return the amount of claimable reward token.
  function claimable(address _account) external view returns (uint256);

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @notice Deposit some token in the contract for someone.
  /// @param amount The amount of token to deposit. -1 means deposit all.
  /// @param recipient The address of recipient who will recieve the token.
  function deposit(uint256 amount, address recipient) external;

  /// @notice Withdraw some token from the contract.
  /// @param amount The amount of token to deposit. -1 means withdraw all.
  /// @param recipient The address of account who will receive the token.
  /// @param claimReward Whether to claim pending rewards or not.
  function withdraw(
    uint256 amount,
    address recipient,
    bool claimReward
  ) external;

  /// @notice Claim pending rewards for caller from the contract.
  function claim() external;

  /// @notice claim pending rewards for some user from the contract.
  /// @param account The address of account to claim.
  function claim(address account) external;

  /// @notice claim pending rewards for some user from the contract.
  /// @dev If `account` is not the caller, `account` and `recipient` should be the same.
  /// @param account The address of account to claim.
  /// @param recipient The address recipient who will receive the pending rewards.
  function claim(address account, address recipient) external;

  /// @notice External call to checkpoint user state.
  /// @param account The address of user to update.
  function checkpoint(address account) external;

  /// @notice Notify new harvested rewards.
  /// @param amount The amount of new rewards.
  function queueNewRewards(uint256 amount) external;
}
