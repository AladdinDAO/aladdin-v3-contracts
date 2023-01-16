// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

// solhint-disable no-inline-assembly

abstract contract AccessControl {
  event SetRoleStatus(bytes32 indexed role, address indexed account, bool status);

  /// @dev The salt used to compute storage slot.
  bytes32 private constant SALT = keccak256("AccessControl");

  /// @notice Returns `true` if `account` has been granted `role`.
  function hasRole(bytes32 role, address account) public view returns (bool) {
    return _hasRole(role, account);
  }

  /// @dev Returns `true` if `account` has been granted `role`.
  function _hasRole(bytes32 role, address account) internal view returns (bool) {
    uint256 _slot = _computeAccountRoleStorageSlot(role, account);
    uint256 _value;
    assembly {
      _value := sload(_slot)
    }
    return _value > 0;
  }

  /// @dev Internal function to set `role` for `account`.
  /// @param role The type of role.
  /// @param account The address of user.
  /// @param status The new status.
  function _setRole(
    bytes32 role,
    address account,
    bool status
  ) internal {
    uint256 _slot = _computeAccountRoleStorageSlot(role, account);
    assembly {
      sstore(_slot, status)
    }

    emit SetRoleStatus(role, account, status);
  }

  /// @dev Internal function to compute storage slot for `account` with `role`.
  /// @param role The type of role.
  /// @param account The address of user.
  /// @return slot The destination storage slot.
  function _computeAccountRoleStorageSlot(bytes32 role, address account) private pure returns (uint256 slot) {
    bytes32 salt = SALT;
    assembly {
      mstore(0x00, role)
      mstore(0x20, xor(account, salt))
      slot := keccak256(0x00, 0x40)
    }
  }
}
