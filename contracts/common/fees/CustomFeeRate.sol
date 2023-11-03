// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { AccessControlUpgradeable } from "@openzeppelin/contracts-upgradeable-v4/access/AccessControlUpgradeable.sol";

import { WordCodec } from "../codec/WordCodec.sol";

// solhint-disable no-inline-assembly

abstract contract CustomFeeRate is AccessControlUpgradeable {
  using WordCodec for bytes32;

  /**********
   * Events *
   **********/

  /// @notice Emitted when the default fee rate is updated.
  /// @param feeType The type of fee to set.
  /// @param oldRate The value of previous default fee rate, multiplied by 1e9.
  /// @param newRate The value of current default fee rate, multiplied by 1e9.
  event SetDefaultFeeRate(uint256 indexed feeType, uint32 oldRate, uint32 newRate);

  /// @notice Emitted when a fee customization is set.
  /// @param account The address of user to set.
  /// @param feeType The type of fee to set.
  /// @param rate The fee rate for the user, multiplied by 1e9.
  event SetCustomFeeRate(address indexed account, uint256 indexed feeType, uint32 rate);

  /// @notice Emitted when a fee customization is cancled.
  /// @param account The address of user to cancle.
  /// @param feeType The type of fee to cancle.
  event ResetCustomFeeRate(address indexed account, uint256 indexed feeType);

  /**********
   * Errors *
   **********/

  /// @dev Thrown when the fee type given is not in range `[0, 8)`.
  error FeeTypeTooLarge();

  /// @dev Thrown when the fee rate given exceed 100%.
  error FeeRateTooLarge();

  /*************
   * Constants *
   *************/

  /// @notice The role for setting custom fee.
  bytes32 public constant CUSTOM_FEE_RATIO_SETTER_ROLE = keccak256("CUSTOM_FEE_RATIO_SETTER_ROLE");

  /// @dev The fee denominator used for rate calculation.
  uint256 internal constant FEE_PRECISION = 1e9;

  /*************
   * Variables *
   *************/

  /// @dev `_defaultFeeData` is a storage slot that can be used to store different types of fee rate.
  ///
  /// All fee rate should not exceed the `FEE_PRECISION` which fits in to 32-bits unsigned integer.
  /// The *type 0 fee rate* is stored in the first most significant 32 bits, and the *type 1 fee rate* is
  /// stored in the next most significant 32 bits, and so on.
  ///
  /// [ type 0 fee rate | type 1 fee rate | ... | type 7 fee rate ]
  /// [     32 bits     |     32 bits     | ... |     32 bits     ]
  /// [ MSB                                                   LSB ]
  bytes32 private _defaultFeeData;

  /// @dev Mapping from user address to user customized fee data.
  ///
  /// All fee rate should not exceed the `FEE_PRECISION` which fits in to 31-bits unsigned integer. So
  /// we use an extra bit as the flag to show whether the fee type is customized for this user.
  ///
  /// The *type 0 fee rate* is stored in the first most significant 32 bits, and the *type 1 fee rate* is
  /// stored in the next most significant 32 bits, and so on.
  ///
  /// [ type 0 fee rate | type 1 fee rate | ... | type 7 fee rate ]
  /// [     32 bits     |     32 bits     | ... |     32 bits     ]
  /// [ MSB                                                   LSB ]
  mapping(address => bytes32) private _customFeeData;

  /// @dev reserved slots.
  uint256[48] private __gap;

  /*************************
   * Public View Functions *
   *************************/

  /// @notice Return the fee rate for the user
  /// @param _feeType The type of fee to query.
  /// @param _account The address of user to query.
  /// @return rate The rate of fee for the user, multiplied by 1e9.
  function getFeeRate(uint256 _feeType, address _account) public view returns (uint256 rate) {
    if (_feeType >= 8) revert FeeTypeTooLarge();

    unchecked {
      rate = _defaultFeeRate(_feeType);
      uint256 _customized = _customFeeData[_account].decodeUint(_feeType * 32, 32);
      if ((_customized & 1) == 1) {
        rate = _customized >> 1;
      }
    }
  }

  /************************
   * Restricted Functions *
   ************************/

  /// @notice Set the default fee rate of the given fee type.
  /// @param _feeType The fee type to update.
  /// @param _newRate The value of new fee rate.
  function setDefaultFeeRate(uint256 _feeType, uint32 _newRate) external onlyRole(CUSTOM_FEE_RATIO_SETTER_ROLE) {
    _validateFeeTypeAndRatio(_feeType, _newRate);

    uint32 _oldRate;
    unchecked {
      bytes32 _data = _defaultFeeData;
      uint256 _offset = _feeType * 32;
      _oldRate = uint32(_data.decodeUint(_offset, 32));
      _defaultFeeData = _data.insertUint(_newRate, _offset, 32);
    }

    emit SetDefaultFeeRate(_feeType, _oldRate, _newRate);
  }

  /// @notice Set the fee rate of the given fee type for some user.
  /// @param _account The address of the user to update.
  /// @param _feeType The fee type to update.
  /// @param _newRate The value of new fee rate.
  function setCustomFeeRate(
    address _account,
    uint256 _feeType,
    uint32 _newRate
  ) external onlyRole(CUSTOM_FEE_RATIO_SETTER_ROLE) {
    _validateFeeTypeAndRatio(_feeType, _newRate);

    unchecked {
      bytes32 _data = _customFeeData[_account];
      _customFeeData[_account] = _data.insertUint(((_newRate << 1) | 1), _feeType * 32, 32);
    }

    emit SetCustomFeeRate(_account, _feeType, _newRate);
  }

  /// @notice Reset the customized fee rate of the given fee type for some user.
  /// @param _account The address of the user to update.
  /// @param _feeType The fee type to update.
  function resetCustomFeeRate(address _account, uint256 _feeType) external onlyRole(CUSTOM_FEE_RATIO_SETTER_ROLE) {
    if (_feeType >= 8) revert FeeTypeTooLarge();

    unchecked {
      bytes32 _data = _customFeeData[_account];
      _customFeeData[_account] = _data.clearWordAtPosition(_feeType * 32, 32);
    }

    emit ResetCustomFeeRate(_account, _feeType);
  }

  /**********************
   * Internal Functions *
   **********************/

  /// @dev Internal function to validate the fee type and fee rate.
  /// @param _feeType The value of the fee type.
  /// @param _rate The value of the fee rate.
  function _validateFeeTypeAndRatio(uint256 _feeType, uint32 _rate) private pure {
    if (_feeType >= 8) revert FeeTypeTooLarge();
    if (_rate > FEE_PRECISION) revert FeeRateTooLarge();
  }

  /// @dev Internal function to return the default fee rate for certain type.
  ///
  /// @param _feeType The type of fee to query.
  /// @return rate The default rate of fee, multiplied by 1e9
  function _defaultFeeRate(uint256 _feeType) internal view virtual returns (uint32 rate) {
    unchecked {
      rate = uint32(_defaultFeeData.decodeUint(_feeType * 32, 32));
    }
  }
}
