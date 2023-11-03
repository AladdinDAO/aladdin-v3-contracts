// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { AccessControlUpgradeable } from "@openzeppelin/contracts-upgradeable-v4/access/AccessControlUpgradeable.sol";

import { WordCodec } from "../common/codec/WordCodec.sol";

import { IConcentratorBase } from "./interfaces/IConcentratorBase.sol";

// solhint-disable func-name-mixedcase
// solhint-disable no-inline-assembly

abstract contract ConcentratorBaseV2 is AccessControlUpgradeable, IConcentratorBase {
  using WordCodec for bytes32;

  /*************
   * Constants *
   *************/

  /// @dev The maximum expense ratio.
  uint256 private constant MAX_EXPENSE_RATIO = 5e8; // 50%

  /// @dev The maximum harvester ratio.
  uint256 private constant MAX_HARVESTER_RATIO = 1e8; // 20%

  /// @dev The maximum withdraw fee percentage.
  uint256 private constant MAX_WITHDRAW_FEE_PERCENTAGE = 1e8; // 10%

  /// @dev The offset of expense ratio in `_miscData`.
  uint256 private constant EXPENSE_RATIO_OFFSET = 0;

  /// @dev The offset of harvester ratio in `_miscData`.
  uint256 private constant HARVESTER_RATIO_OFFSET = 30;

  /// @dev The offset of withdraw fee percentage in `_miscData`.
  uint256 private constant WITHDRAW_FEE_PERCENTAGE_OFFSET = 60;

  /*************
   * Variables *
   *************/

  /// @inheritdoc IConcentratorBase
  address public treasury;

  /// @inheritdoc IConcentratorBase
  address public harvester;

  /// @inheritdoc IConcentratorBase
  address public converter;

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
  /// [ expense ratio | harvester ratio | withdraw fee | available ]
  /// [    30 bits    |     30 bits     |   30  bits   |  166 bits ]
  /// [ MSB                                                    LSB ]
  bytes32 private _miscData;

  /// @dev reserved slots.
  uint256[46] private __gap;

  /*************
   * Modifiers *
   *************/

  modifier onlyHarvester() {
    address _harvester = harvester;
    if (_harvester != address(0) && _harvester != _msgSender()) {
      revert CallerIsNotHarvester();
    }
    _;
  }

  /***************
   * Constructor *
   ***************/

  function __ConcentratorBaseV2_init(
    address _treasury,
    address _harvester,
    address _converter
  ) internal onlyInitializing {
    _updateTreasury(_treasury);
    _updateHarvester(_harvester);
    _updateConverter(_converter);
  }

  /*************************
   * Public View Functions *
   *************************/

  /// @inheritdoc IConcentratorBase
  function getExpenseRatio() public view override returns (uint256) {
    return _miscData.decodeUint(EXPENSE_RATIO_OFFSET, 30);
  }

  /// @inheritdoc IConcentratorBase
  function getHarvesterRatio() public view override returns (uint256) {
    return _miscData.decodeUint(HARVESTER_RATIO_OFFSET, 30);
  }

  /// @inheritdoc IConcentratorBase
  function getWithdrawFeePercentage() public view override returns (uint256) {
    return _miscData.decodeUint(WITHDRAW_FEE_PERCENTAGE_OFFSET, 30);
  }

  /************************
   * Restricted Functions *
   ************************/

  /// @notice Update the address of treasury contract.
  ///
  /// @param _newTreasury The address of the new treasury contract.
  function updateTreasury(address _newTreasury) external onlyRole(DEFAULT_ADMIN_ROLE) {
    _updateTreasury(_newTreasury);
  }

  /// @notice Update the address of harvester contract.
  ///
  /// @param _newHarvester The address of the new harvester contract.
  function updateHarvester(address _newHarvester) external onlyRole(DEFAULT_ADMIN_ROLE) {
    _updateHarvester(_newHarvester);
  }

  /// @notice Update the address of converter contract.
  ///
  /// @param _newConverter The address of the new converter contract.
  function updateConverter(address _newConverter) external onlyRole(DEFAULT_ADMIN_ROLE) {
    _updateConverter(_newConverter);
  }

  /// @notice Update the fee ratio distributed to treasury.
  /// @param _newRatio The new ratio to update, multipled by 1e9.
  function updateExpenseRatio(uint32 _newRatio) external onlyRole(DEFAULT_ADMIN_ROLE) {
    if (uint256(_newRatio) > MAX_EXPENSE_RATIO) {
      revert ExpenseRatioTooLarge();
    }

    bytes32 _data = _miscData;
    uint256 _oldRatio = _miscData.decodeUint(EXPENSE_RATIO_OFFSET, 30);
    _miscData = _data.insertUint(_newRatio, EXPENSE_RATIO_OFFSET, 30);

    emit UpdateExpenseRatio(_oldRatio, _newRatio);
  }

  /// @notice Update the fee ratio distributed to harvester.
  /// @param _newRatio The new ratio to update, multipled by 1e9.
  function updateHarvesterRatio(uint32 _newRatio) external onlyRole(DEFAULT_ADMIN_ROLE) {
    if (uint256(_newRatio) > MAX_HARVESTER_RATIO) {
      revert HarvesterRatioTooLarge();
    }

    bytes32 _data = _miscData;
    uint256 _oldRatio = _miscData.decodeUint(HARVESTER_RATIO_OFFSET, 30);
    _miscData = _data.insertUint(_newRatio, HARVESTER_RATIO_OFFSET, 30);

    emit UpdateHarvesterRatio(_oldRatio, _newRatio);
  }

  /// @notice Update the withdraw fee percentage
  /// @param _newPercentage The new ratio to update, multipled by 1e9.
  function updateWithdrawFeePercentage(uint32 _newPercentage) external onlyRole(DEFAULT_ADMIN_ROLE) {
    if (uint256(_newPercentage) > MAX_WITHDRAW_FEE_PERCENTAGE) {
      revert WithdrawFeePercentageTooLarge();
    }

    bytes32 _data = _miscData;
    uint256 _oldPercentage = _miscData.decodeUint(WITHDRAW_FEE_PERCENTAGE_OFFSET, 30);
    _miscData = _data.insertUint(_newPercentage, WITHDRAW_FEE_PERCENTAGE_OFFSET, 30);

    emit UpdateWithdrawFeePercentage(_oldPercentage, _newPercentage);
  }

  /**********************
   * Internal Functions *
   **********************/

  /// @dev Internal function to update the address of treasury contract.
  ///
  /// @param _newTreasury The address of the new treasury contract.
  function _updateTreasury(address _newTreasury) private {
    if (_newTreasury == address(0)) revert TreasuryIsZero();

    address _oldTreasury = treasury;
    treasury = _newTreasury;

    emit UpdateTreasury(_oldTreasury, _newTreasury);
  }

  /// @dev Internal function to update the address of harvester contract.
  ///
  /// @param _newHarvester The address of the new harvester contract.
  function _updateHarvester(address _newHarvester) private {
    address _oldHarvester = harvester;
    harvester = _newHarvester;

    emit UpdateHarvester(_oldHarvester, _newHarvester);
  }

  /// @dev Internal function to update the address of converter contract.
  ///
  /// @param _newConverter The address of the new converter contract.
  function _updateConverter(address _newConverter) private {
    if (_newConverter == address(0)) revert ConverterIsZero();

    address _oldConverter = converter;
    converter = _newConverter;

    emit UpdateConverter(_oldConverter, _newConverter);
  }
}
