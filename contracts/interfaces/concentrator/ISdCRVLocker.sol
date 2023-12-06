// SPDX-License-Identifier: MIT

pragma solidity ^0.7.0 || ^0.8.0;
pragma abicoder v2;

interface ISdCRVLocker {
  /// @notice Emmited when someone withdraw staking token from contract.
  /// @param _owner The address of the owner of the staking token.
  /// @param _recipient The address of the recipient of the locked staking token.
  /// @param _amount The amount of staking token withdrawn.
  /// @param _expiredAt The timestamp in second then the lock expired
  event Lock(address indexed _owner, address indexed _recipient, uint256 _amount, uint256 _expiredAt);

  /// @notice Emitted when someone withdraw expired locked staking token.
  /// @param _owner The address of the owner of the locked staking token.
  /// @param _recipient The address of the recipient of the staking token.
  /// @param _amount The amount of staking token withdrawn.
  event WithdrawExpired(address indexed _owner, address indexed _recipient, uint256 _amount);

  struct LockedBalance {
    // The amount of staking token locked.
    uint128 amount;
    // The timestamp in seconds when the lock expired.
    uint128 expireAt;
  }

  /// @notice Return the list of locked staking token in the contract.
  /// @param user The address of user to query.
  /// @return locks The list of `LockedBalance` of the user.
  function getUserLocks(address user) external view returns (LockedBalance[] memory locks);

  /// @notice Withdraw all expired locks from contract.
  /// @param user The address of user to withdraw.
  /// @param recipient The address of recipient who will receive the token.
  /// @return amount The amount of staking token withdrawn.
  function withdrawExpired(address user, address recipient) external returns (uint256 amount);
}
