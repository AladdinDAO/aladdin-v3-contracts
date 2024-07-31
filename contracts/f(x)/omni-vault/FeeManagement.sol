// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.25;

import { AccessControlUpgradeable } from "@openzeppelin/contracts-upgradeable-v4/access/AccessControlUpgradeable.sol";
import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable-v4/security/ReentrancyGuardUpgradeable.sol";

import { IFxOmniVault } from "../../interfaces/f(x)/omni-vault/IFxOmniVault.sol";

import { WordCodec } from "../../common/codec/WordCodec.sol";

abstract contract FeeManagement is AccessControlUpgradeable, ReentrancyGuardUpgradeable, IFxOmniVault {
  using WordCodec for bytes32;

  /**********
   * Errors *
   **********/

  /// @dev Thrown when the given address is zero.
  error ErrorZeroAddress();

  /// @dev Thrown when the expense ratio exceeds `MAX_EXPENSE_RATIO`.
  error ErrorExpenseRatioTooLarge();

  /// @dev Thrown when the harvester ratio exceeds `MAX_HARVESTER_RATIO`.
  error ErrorHarvesterRatioTooLarge();

  /// @dev Thrown when the flash loan fee ratio exceeds `MAX_FLASH_LOAN_FEE_RATIO`.
  error ErrorFlashLoanFeeRatioTooLarge();

  /*************
   * Constants *
   *************/

  /// @dev The maximum expense ratio.
  uint256 private constant MAX_EXPENSE_RATIO = 5e8; // 50%

  /// @dev The maximum harvester ratio.
  uint256 private constant MAX_HARVESTER_RATIO = 2e8; // 20%

  /// @dev The maximum flash loan fee ratio.
  uint256 private constant MAX_FLASH_LOAN_FEE_RATIO = 1e8; // 10%

  /// @dev The offset of expense ratio in `_miscData`.
  uint256 private constant EXPENSE_RATIO_OFFSET = 0;

  /// @dev The offset of harvester ratio in `_miscData`.
  uint256 private constant HARVESTER_RATIO_OFFSET = 30;

  /// @dev The offset of flash loan ratio in `_miscData`.
  uint256 private constant FLASH_LOAN_RATIO_OFFSET = 60;

  /// @dev The precision used to compute fees.
  uint256 internal constant FEE_PRECISION = 1e9;

  /*************
   * Variables *
   *************/

  /// @dev `_miscData` is a storage slot that can be used to store unrelated pieces of information.
  /// All pools store the *expense ratio*, *harvester ratio* and *withdraw fee percentage*, but
  /// the `miscData`can be extended to store more pieces of information.
  ///
  /// The *expense ratio* is stored in the first most significant 32 bits, and the *harvester ratio* is
  /// stored in the next most significant 32 bits, and the *withdraw fee percentage* is stored in the
  /// next most significant 32 bits, leaving the remaining 160 bits free to store any other information
  /// derived pools might need.
  ///
  /// - The *expense ratio* and *harvester ratio* are charged each time when harvester harvest the pool revenue.
  /// - The *withdraw fee percentage* is charged each time when user try to withdraw assets from the pool.
  ///
  /// [ expense ratio | harvester ratio | flash loan ratio | available ]
  /// [    30 bits    |     30 bits     |     30  bits     |  166 bits ]
  /// [ MSB                                                        LSB ]
  bytes32 internal _miscData;

  /// @dev The address platform contract.
  address private platform;

  /// @dev Mapping from pool address to amount of fees accumulated.
  mapping(address => uint256) private accumulatedPoolFees;

  /// @dev Slots for future use.
  uint256[47] private _gap;

  /***************
   * Constructor *
   ***************/

  function __FeeManagement_init(
    uint256 _expenseRatio,
    uint256 _harvesterRatio,
    uint256 _flashLoanFeeRatio,
    address _platform
  ) internal onlyInitializing {
    _updateExpenseRatio(_expenseRatio);
    _updateHarvesterRatio(_harvesterRatio);
    _updateFlashLoanFeeRatio(_flashLoanFeeRatio);
    _updatePlatform(_platform);
  }

  /*************************
   * Public View Functions *
   *************************/

  /// @inheritdoc IFxOmniVault
  function getPlatform() public view returns (address) {
    return platform;
  }

  /// @inheritdoc IFxOmniVault
  function getExpenseRatio() public view returns (uint256) {
    return _miscData.decodeUint(EXPENSE_RATIO_OFFSET, 30);
  }

  /// @inheritdoc IFxOmniVault
  function getHarvesterRatio() public view returns (uint256) {
    return _miscData.decodeUint(HARVESTER_RATIO_OFFSET, 30);
  }

  /// @inheritdoc IFxOmniVault
  function getRebalancePoolRatio() external view returns (uint256) {
    return FEE_PRECISION - getExpenseRatio() - getHarvesterRatio();
  }

  /// @inheritdoc IFxOmniVault
  function getFlashLoanFeeRatio() public view returns (uint256) {
    return _miscData.decodeUint(FLASH_LOAN_RATIO_OFFSET, 30);
  }

  /// @notice Return the amount of protocol fees accumulated by the given pool.
  function getAccumulatedPoolFee(address pool) external view returns (uint256) {
    return accumulatedPoolFees[pool];
  }

  /************************
   * Restricted Functions *
   ************************/

  /// @notice Change address of platform contract.
  /// @param _newPlatform The new address of platform contract.
  function updatePlatform(address _newPlatform) external onlyRole(DEFAULT_ADMIN_ROLE) {
    _updatePlatform(_newPlatform);
  }

  /// @notice Update the fee ratio distributed to treasury.
  /// @param newRatio The new ratio to update, multiplied by 1e9.
  function updateExpenseRatio(uint32 newRatio) external onlyRole(DEFAULT_ADMIN_ROLE) {
    _updateExpenseRatio(newRatio);
  }

  /// @notice Update the fee ratio distributed to harvester.
  /// @param newRatio The new ratio to update, multiplied by 1e9.
  function updateHarvesterRatio(uint32 newRatio) external onlyRole(DEFAULT_ADMIN_ROLE) {
    _updateHarvesterRatio(newRatio);
  }

  /// @notice Update the flash loan fee ratio.
  /// @param newRatio The new ratio to update, multiplied by 1e9.
  function updateFlashLoanFeeRatio(uint32 newRatio) external onlyRole(DEFAULT_ADMIN_ROLE) {
    _updateFlashLoanFeeRatio(newRatio);
  }

  /**********************
   * Internal Functions *
   **********************/

  /// @dev Internal function to change address of platform contract.
  /// @param _newPlatform The new address of platform contract.
  function _updatePlatform(address _newPlatform) private {
    if (_newPlatform == address(0)) revert ErrorZeroAddress();

    address _oldPlatform = platform;
    platform = _newPlatform;

    emit UpdatePlatform(_oldPlatform, _newPlatform);
  }

  /// @dev Internal function to update the fee ratio distributed to treasury.
  /// @param newRatio The new ratio to update, multiplied by 1e9.
  function _updateExpenseRatio(uint256 newRatio) private {
    if (uint256(newRatio) > MAX_EXPENSE_RATIO) {
      revert ErrorExpenseRatioTooLarge();
    }

    bytes32 _data = _miscData;
    uint256 _oldRatio = _miscData.decodeUint(EXPENSE_RATIO_OFFSET, 30);
    _miscData = _data.insertUint(newRatio, EXPENSE_RATIO_OFFSET, 30);

    emit UpdateExpenseRatio(_oldRatio, newRatio);
  }

  /// @dev Internal function to update the fee ratio distributed to harvester.
  /// @param newRatio The new ratio to update, multiplied by 1e9.
  function _updateHarvesterRatio(uint256 newRatio) private {
    if (uint256(newRatio) > MAX_HARVESTER_RATIO) {
      revert ErrorHarvesterRatioTooLarge();
    }

    bytes32 _data = _miscData;
    uint256 _oldRatio = _miscData.decodeUint(HARVESTER_RATIO_OFFSET, 30);
    _miscData = _data.insertUint(newRatio, HARVESTER_RATIO_OFFSET, 30);

    emit UpdateHarvesterRatio(_oldRatio, newRatio);
  }

  /// @dev Internal function to update the flash loan fee ratio.
  /// @param newRatio The new ratio to update, multiplied by 1e9.
  function _updateFlashLoanFeeRatio(uint256 newRatio) private {
    if (uint256(newRatio) > MAX_FLASH_LOAN_FEE_RATIO) {
      revert ErrorFlashLoanFeeRatioTooLarge();
    }

    bytes32 _data = _miscData;
    uint256 _oldRatio = _miscData.decodeUint(FLASH_LOAN_RATIO_OFFSET, 30);
    _miscData = _data.insertUint(newRatio, FLASH_LOAN_RATIO_OFFSET, 30);

    emit UpdateFlashLoanFeeRatio(_oldRatio, newRatio);
  }

  function _accumulatePoolFee(address pool, uint256 amount) internal {
    accumulatedPoolFees[pool] += amount;
  }

  function _takeAccumulatedPoolFee(address pool) internal returns (uint256 fees) {
    fees = accumulatedPoolFees[pool];
    accumulatedPoolFees[pool] = 0;
  }
}
