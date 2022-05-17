// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

interface IMetaFurnace {
  event Deposit(address indexed _account, uint256 _amount);
  event Withdraw(address indexed _account, address _recipient, uint256 _amount);
  event Claim(address indexed _account, address _recipient, uint256 _amount);
  event Distribute(address indexed _origin, uint256 _amount);
  event Harvest(address indexed _caller, uint256 _amount);

  /// @notice Return the address of base token.
  function baseToken() external view returns (address);

  /// @notice Return the address of debt token.
  function debtToken() external view returns (address);

  /// @notice Return the amount of debtToken unrealised and realised of user.
  /// @param _account The address of user.
  /// @return unrealised The amount of debtToken unrealised.
  /// @return realised The amount of debtToken realised and can be claimed.
  function getUserInfo(address _account) external view returns (uint256 unrealised, uint256 realised);

  /// @notice Deposit debtToken in this contract to change for baseToken for other user.
  /// @param _recipient The address of user you deposit for.
  /// @param _amount The amount of debtToken to deposit.
  function deposit(address _recipient, uint256 _amount) external;

  /// @notice Withdraw unrealised debtToken of the caller from this contract.
  /// @param _recipient The address of user who will recieve the debtToken.
  /// @param _amount The amount of debtToken to withdraw.
  function withdraw(address _recipient, uint256 _amount) external;

  /// @notice Withdraw all unrealised debtToken of the caller from this contract.
  /// @param _recipient The address of user who will recieve the debtToken.
  function withdrawAll(address _recipient) external;

  /// @notice Claim all realised baseToken of the caller from this contract.
  /// @param _recipient The address of user who will recieve the baseToken.
  function claim(address _recipient) external;

  /// @notice Exit the contract, withdraw all unrealised debtToken and realised baseToken of the caller.
  /// @param _recipient The address of user who will recieve the debtToken and baseToken.
  function exit(address _recipient) external;

  /// @notice Distribute baseToken from `origin` to pay debtToken debt.
  /// @dev Requirements:
  /// + Caller should make sure the token is transfered to this contract before call.
  /// + Caller should make sure the amount be greater than zero.
  ///
  /// @param _origin The address of the user who will provide baseToken.
  /// @param _token The address of token distributed.
  /// @param _amount The amount of baseToken will be provided.
  function distribute(
    address _origin,
    address _token,
    uint256 _amount
  ) external;
}
