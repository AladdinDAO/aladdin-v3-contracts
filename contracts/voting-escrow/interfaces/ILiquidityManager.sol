// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

interface ILiquidityManager {
  /**********
   * Events *
   **********/

  /// @notice Emitted when the ratio for manager is updated.
  /// @param oldRatio The value of the previous ratio, multipled by 1e9.
  /// @param newRatio The value of the current ratio, multipled by 1e9.
  event UpdateManagerRatio(uint256 oldRatio, uint256 newRatio);

  /// @notice Emitted when the ratio for harvester is updated.
  /// @param oldRatio The value of the previous ratio, multipled by 1e9.
  /// @param newRatio The value of the current ratio, multipled by 1e9.
  event UpdateHarvesterRatio(uint256 oldRatio, uint256 newRatio);

  /**********
   * Errors *
   **********/

  /// @dev Thrown when try to kill the manager more than once.
  error AlreadyKilled();

  /// @dev Thrown when the call is not operator.
  error CallerIsNotOperator();

  /// @dev Thrown when the manager ratio exceeds `MAX_MANAGER_RATIO`.
  error ManagerRatioTooLarge();

  /// @dev Thrown when the harvester ratio exceeds `MAX_HARVESTER_RATIO`.
  error HarvesterRatioTooLarge();

  /*************************
   * Public View Functions *
   *************************/

  /// @notice Return whether the manager is active.
  function isActive() external view returns (bool);

  /// @notice Return the list of reward tokens.
  function getRewardTokens() external view returns (address[] memory);

  /// @notice Return the fee ratio distributed to treasury, multipled by 1e9.
  function getManagerRatio() external view returns (uint256);

  /// @notice Return the fee ratio distributed to harvester, multipled by 1e9.
  function getHarvesterRatio() external view returns (uint256);

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @notice Deposit token to corresponding manager.
  /// @dev Requirements:
  ///   + Caller should make sure the token is already transfered into the manager contract.
  ///   + Caller should make sure the deposit amount is greater than zero.
  ///
  /// @param receiver The address of recipient who will receive the share.
  /// @param amount The amount of token to deposit.
  /// @param manage Whether to deposit the token to underlying strategy.
  function deposit(
    address receiver,
    uint256 amount,
    bool manage
  ) external;

  /// @notice Withdraw underlying token from corresponding manager.
  /// @dev Requirements:
  ///   + Caller should make sure the withdraw amount is greater than zero.
  ///
  /// @param receiver The address of recipient who will receive the token.
  /// @param amount The amount of token to withdraw.
  function withdraw(address receiver, uint256 amount) external;

  /// @notice Emergency function to execute arbitrary call.
  /// @dev This function should be only used in case of emergency. It should never be called explicitly
  ///  in any contract in normal case.
  ///
  /// @param to The address of target contract to call.
  /// @param value The value passed to the target contract.
  /// @param data The calldata pseed to the target contract.
  function execute(
    address to,
    uint256 value,
    bytes calldata data
  ) external payable returns (bool, bytes memory);

  /// @notice Manage the deposited token. Usually the token will be
  /// deposited to another protocol which could generate more yields.
  function manage() external;

  /// @notice Harvest pending rewards from underlying protocol.
  /// @param receiver The address of the recipient for harvest incentive.
  function harvest(address receiver) external;
}
