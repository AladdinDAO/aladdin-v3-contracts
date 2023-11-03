// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

interface IConcentratorBase {
  /**********
   * Events *
   **********/

  /// @notice Emitted when the treasury contract is updated.
  ///
  /// @param oldTreasury The address of the previous treasury contract.
  /// @param newTreasury The address of the current treasury contract.
  event UpdateTreasury(address indexed oldTreasury, address indexed newTreasury);

  /// @notice Emitted when the harvester contract is updated.
  ///
  /// @param oldHarvester The address of the previous harvester contract.
  /// @param newHarvester The address of the current harvester contract.
  event UpdateHarvester(address indexed oldHarvester, address indexed newHarvester);

  /// @notice Emitted when the converter contract is updated.
  ///
  /// @param oldConverter The address of the previous converter contract.
  /// @param newConverter The address of the current converter contract.
  event UpdateConverter(address indexed oldConverter, address indexed newConverter);

  /// @notice Emitted when the ratio for treasury is updated.
  /// @param oldRatio The value of the previous ratio, multipled by 1e9.
  /// @param newRatio The value of the current ratio, multipled by 1e9.
  event UpdateExpenseRatio(uint256 oldRatio, uint256 newRatio);

  /// @notice Emitted when the ratio for harvester is updated.
  /// @param oldRatio The value of the previous ratio, multipled by 1e9.
  /// @param newRatio The value of the current ratio, multipled by 1e9.
  event UpdateHarvesterRatio(uint256 oldRatio, uint256 newRatio);

  /// @notice Emitted when the fee percentage for withdrawal is updated.
  /// @param oldPercentage The value of the previous fee percentage, multipled by 1e9.
  /// @param newPercentage The value of the current fee percentage, multipled by 1e9.
  event UpdateWithdrawFeePercentage(uint256 oldPercentage, uint256 newPercentage);

  /**********
   * Errors *
   **********/

  /// @dev Thrown when caller is not harvester and try to call some harvester only functions.
  error CallerIsNotHarvester();

  /// @dev Thrown when the address of converter contract is zero.
  error ConverterIsZero();

  /// @dev Thrown when the address of treasury contract is zero.
  error TreasuryIsZero();

  /// @dev Thrown when the expense ratio exceeds `MAX_EXPENSE_RATIO`.
  error ExpenseRatioTooLarge();

  /// @dev Thrown when the harvester ratio exceeds `MAX_HARVESTER_RATIO`.
  error HarvesterRatioTooLarge();

  /// @dev Thrown when the withdraw fee percentage exceeds `MAX_WITHDRAW_FEE_PERCENTAGE`.
  error WithdrawFeePercentageTooLarge();

  /*************************
   * Public View Functions *
   *************************/

  /// @notice The address of protocol revenue holder.
  function treasury() external view returns (address);

  /// @notice The address of harvester contract.
  function harvester() external view returns (address);

  /// @notice The address of converter contract.
  function converter() external view returns (address);

  /// @notice Return the fee ratio distributed to treasury, multipled by 1e9.
  function getExpenseRatio() external view returns (uint256);

  /// @notice Return the fee ratio distributed to harvester, multipled by 1e9.
  function getHarvesterRatio() external view returns (uint256);

  /// @notice Return the withdraw fee percentage, multipled by 1e9.
  function getWithdrawFeePercentage() external view returns (uint256);
}
