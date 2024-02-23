// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

// solhint-disable no-inline-assembly

/// @dev A subset copied from the following contracts:
///
/// + `balancer-labs/v2-solidity-utils/contracts/helpers/WordCodec.sol`
/// + `balancer-labs/v2-solidity-utils/contracts/helpers/WordCodecHelpers.sol`
library WordCodec {
  /// @dev Inserts an unsigned integer of bitLength, shifted by an offset, into a 256 bit word,
  /// replacing the old value. Returns the new word.
  function insertUint(
    bytes32 word,
    uint256 value,
    uint256 offset,
    uint256 bitLength
  ) internal pure returns (bytes32 result) {
    // Equivalent to:
    // uint256 mask = (1 << bitLength) - 1;
    // bytes32 clearedWord = bytes32(uint256(word) & ~(mask << offset));
    // result = clearedWord | bytes32(value << offset);
    assembly {
      let mask := sub(shl(bitLength, 1), 1)
      let clearedWord := and(word, not(shl(offset, mask)))
      result := or(clearedWord, shl(offset, value))
    }
  }

  /// @dev Decodes and returns an unsigned integer with `bitLength` bits, shifted by an offset, from a 256 bit word.
  function decodeUint(
    bytes32 word,
    uint256 offset,
    uint256 bitLength
  ) internal pure returns (uint256 result) {
    // Equivalent to:
    // result = uint256(word >> offset) & ((1 << bitLength) - 1);
    assembly {
      result := and(shr(offset, word), sub(shl(bitLength, 1), 1))
    }
  }

  /// @dev Inserts a signed integer shifted by an offset into a 256 bit word, replacing the old value. Returns
  /// the new word.
  ///
  /// Assumes `value` can be represented using `bitLength` bits.
  function insertInt(
    bytes32 word,
    int256 value,
    uint256 offset,
    uint256 bitLength
  ) internal pure returns (bytes32) {
    unchecked {
      uint256 mask = (1 << bitLength) - 1;
      bytes32 clearedWord = bytes32(uint256(word) & ~(mask << offset));
      // Integer values need masking to remove the upper bits of negative values.
      return clearedWord | bytes32((uint256(value) & mask) << offset);
    }
  }

  /// @dev Decodes and returns a signed integer with `bitLength` bits, shifted by an offset, from a 256 bit word.
  function decodeInt(
    bytes32 word,
    uint256 offset,
    uint256 bitLength
  ) internal pure returns (int256 result) {
    unchecked {
      int256 maxInt = int256((1 << (bitLength - 1)) - 1);
      uint256 mask = (1 << bitLength) - 1;

      int256 value = int256(uint256(word >> offset) & mask);
      // In case the decoded value is greater than the max positive integer that can be represented with bitLength
      // bits, we know it was originally a negative integer. Therefore, we mask it to restore the sign in the 256 bit
      // representation.
      //
      // Equivalent to:
      // result = value > maxInt ? (value | int256(~mask)) : value;
      assembly {
        result := or(mul(gt(value, maxInt), not(mask)), value)
      }
    }
  }

  /// @dev Decodes and returns a boolean shifted by an offset from a 256 bit word.
  function decodeBool(bytes32 word, uint256 offset) internal pure returns (bool result) {
    // Equivalent to:
    // result = (uint256(word >> offset) & 1) == 1;
    assembly {
      result := and(shr(offset, word), 1)
    }
  }

  /// @dev Inserts a boolean value shifted by an offset into a 256 bit word, replacing the old value. Returns the new
  /// word.
  function insertBool(
    bytes32 word,
    bool value,
    uint256 offset
  ) internal pure returns (bytes32 result) {
    // Equivalent to:
    // bytes32 clearedWord = bytes32(uint256(word) & ~(1 << offset));
    // bytes32 referenceInsertBool = clearedWord | bytes32(uint256(value ? 1 : 0) << offset);
    assembly {
      let clearedWord := and(word, not(shl(offset, 1)))
      result := or(clearedWord, shl(offset, value))
    }
  }

  function clearWordAtPosition(
    bytes32 word,
    uint256 offset,
    uint256 bitLength
  ) internal pure returns (bytes32 clearedWord) {
    unchecked {
      uint256 mask = (1 << bitLength) - 1;
      clearedWord = bytes32(uint256(word) & ~(mask << offset));
    }
  }
}
