// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

// solhint-disable func-name-mixedcase

interface ILiquidityGauge {
  /**********
   * Events *
   **********/

  /// @notice Emitted when user deposit staking token to this contract.
  /// @param owner The address of token owner.
  /// @param receiver The address of recipient for the pool share.
  /// @param amount The amount of staking token deposited.
  event Deposit(address indexed owner, address indexed receiver, uint256 amount);

  /// @notice Emitted when user withdraw staking token from this contract.
  /// @param owner The address of token owner.
  /// @param receiver The address of recipient for the staking token
  /// @param amount The amount of staking token withdrawn.
  event Withdraw(address indexed owner, address indexed receiver, uint256 amount);

  /// @notice Emitten then the working balance is updated.
  /// @param account The address of user updated.
  /// @param originalBalance The original pool share of the user.
  /// @param originalSupply The original total pool share of the contract.
  /// @param workingBalance The current working balance of the user.
  /// @param workingSpply The current working supply of the contract.
  event UpdateLiquidityLimit(
    address indexed account,
    uint256 originalBalance,
    uint256 originalSupply,
    uint256 workingBalance,
    uint256 workingSpply
  );

  /// @notice Emitted when the address of liquidity manager is updated.
  /// @param oldLiquidityManager The address of previous liquidity manager contract.
  /// @param newLiquidityManager The address of current liquidity manager contract.
  event UpdateLiquidityManager(address indexed oldLiquidityManager, address indexed newLiquidityManager);

  /**********
   * Errors *
   **********/

  /// @dev Thrown when someone deposit zero amount staking token.
  error DepositZeroAmount();

  /// @dev Thrown when someone withdraw zero amount staking token.
  error WithdrawZeroAmount();

  /// @dev Thrown when some unauthorized user call `user_checkpoint`.
  error UnauthorizedCaller();

  /// @dev Throw when someone try to kick user who has no changes on their ve balance.
  error KickNotAllowed();

  /// @dev Thrown when someone try to do unnecessary kick.
  error KickNotNeeded();

  /// @dev Thrown when try to remove an active liquidity manager.
  error LiquidityManagerIsActive();

  /// @dev Thrown when try to add an unactive liquidity manager.
  error LiquidityManagerIsNotActive();

  /*************************
   * Public View Functions *
   *************************/

  /// @notice Return the address of staking token.
  function stakingToken() external view returns (address);

  /// @notice Return the amount of working supply.
  function workingSupply() external view returns (uint256);

  /// @notice Return the amount of working balance of some user.
  /// @param account The address of user to query.
  function workingBalanceOf(address account) external view returns (uint256);

  /// @notice Return the governace token reward integrate for some user.
  ///
  /// @dev This is used in TokenMinter.
  ///
  /// @param account The address of user to query.
  function integrate_fraction(address account) external view returns (uint256);

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @notice Deposit some staking token to this contract.
  ///
  /// @dev Use `amount = type(uint256).max`, if caller wants to deposit all held staking tokens.
  ///
  /// @param amount The amount of staking token to deposit.
  function deposit(uint256 amount) external;

  /// @notice Deposit some staking token to this contract and transfer the share to others.
  ///
  /// @dev Use `amount = type(uint256).max`, if caller wants to deposit all held staking tokens.
  ///
  /// @param amount The amount of staking token to deposit.
  /// @param receiver The address of the pool share recipient.
  function deposit(uint256 amount, address receiver) external;

  /// @notice Withdraw some staking token from this contract.
  ///
  /// @dev Use `amount = type(uint256).max`, if caller wants to deposit all held staking tokens.
  ///
  /// @param amount The amount of staking token to withdraw.
  function withdraw(uint256 amount) external;

  /// @notice Withdraw some staking token from this contract and transfer the token to others.
  ///
  /// @dev Use `amount = type(uint256).max`, if caller wants to deposit all held staking tokens.
  ///
  /// @param amount The amount of staking token to withdraw.
  /// @param receiver The address of the staking token recipient.
  function withdraw(uint256 amount, address receiver) external;

  /// @notice Update the snapshot for some user.
  ///
  /// @dev This is used in TokenMinter.
  ///
  /// @param account The address of user to update.
  function user_checkpoint(address account) external;

  /// @notice Kick some user for abusing their boost.
  ///
  /// @dev Only if either they had another voting event, or their voting escrow lock expired.
  ///
  /// @param account The address of user to kick.
  function kick(address account) external;
}
