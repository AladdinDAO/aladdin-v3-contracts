// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

interface IMigratableConcentratorVault {
  /// @notice Emitted when someone migrate all assets to other vault.
  /// @param _pid The pool id to migrate.
  /// @param _owner The address of the owner of the assets.
  /// @param _share The pool share migrated.
  /// @param _recipient The address of the recipient in the new vault.
  /// @param _migrator The address of new vault.
  /// @param _newPid The pool id in the new vault.
  event MigrateAsset(
    uint256 indexed _pid,
    address indexed _owner,
    uint256 _share,
    address _recipient,
    address _migrator,
    uint256 _newPid
  );

  /// @notice Migrate some user shares to another vault
  /// @param _pid The pool id to migrate.
  /// @param _shares The amount of pool shares to migrate.
  /// @param _recipient The address of recipient who will recieve the token.
  /// @param _migrator The address of vault to migrate.
  /// @param _newPid The target pool id in new vault.
  function migrate(
    uint256 _pid,
    uint256 _shares,
    address _recipient,
    address _migrator,
    uint256 _newPid
  ) external;
}
