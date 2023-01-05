// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

interface ICrvDepositor {
  /**********
   * Events *
   **********/

  /// @notice Emitted when someone lock CRV for aldveCRV.
  /// @param sender The address who deposit CRV.
  /// @param owner The address who will receive the aldveCRV.
  /// @param amount The amount of CRV deposited.
  event Deposit(address sender, address owner, uint256 amount);

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @notice Deposit CRV for aldveCRV and stake aldveCRV.
  /// @param _amount The amount of CRV to deposit.
  /// @param _recipient The address of recipient who will receive aldveCRV.
  /// @param _staking The address of aldveCRV staking contract.
  function deposit(
    uint256 _amount,
    address _recipient,
    address _staking
  ) external;

  /// @notice Deposit CRV for aldveCRV.
  /// @param _amount The amount of CRV to deposit.
  /// @param _recipient The address of recipient who will receive aldveCRV.
  function deposit(uint256 _amount, address _recipient) external;
}
