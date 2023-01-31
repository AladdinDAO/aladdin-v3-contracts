// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;
pragma abicoder v2;

import "../interfaces/ICurveVoteEscrow.sol";

// solhint-disable const-name-snakecase
// solhint-disable no-inline-assembly

abstract contract ConcentratorHarvester {
  /// @notice Emitted when the harvest limitation is updated.
  /// @param amount The amount of veCTR updated.
  /// @param duration The veCTR lock duration updated.
  event SetHarvestLimitation(uint256 amount, uint256 duration);

  /// @dev The address of veCTR contract.
  address private constant veCTR = 0xe4C09928d834cd58D233CD77B5af3545484B4968;

  /// @dev The salt used to compute storage slot.
  bytes32 private constant SLOT = keccak256("ConcentratorHarvester.slot");

  /// @notice Check whether the caller can call harvest.
  /// @param _caller The address of caller.
  /// @return bool true if the caller can call harvest.
  function canHarvest(address _caller) public view returns (bool) {
    ICurveVoteEscrow.LockedBalance memory _locked = ICurveVoteEscrow(veCTR).locked(_caller);
    (uint256 _amount, uint256 _duration) = _loadHarvestLimitation();

    return uint256(_locked.amount) >= _amount && block.timestamp + _duration <= _locked.end;
  }

  /// @dev Update harvest limitation
  /// @param _amount The amount of veCTR needed.
  /// @param _duration The minimum locked duration needed.
  function _setHarvestLimitation(uint256 _amount, uint256 _duration) internal {
    bytes32 _slot = SLOT;
    assembly {
      sstore(_slot, or(_duration, shl(128, _amount)))
    }

    emit SetHarvestLimitation(_amount, _duration);
  }

  /// @dev Load harvest limitation
  /// @return _amount The amount of veCTR needed.
  /// @return _duration The minimum locked duration needed.
  function _loadHarvestLimitation() internal view returns (uint256 _amount, uint256 _duration) {
    bytes32 _slot = SLOT;
    uint256 _encoded;
    assembly {
      _encoded := sload(_slot)
      _amount := shr(128, _encoded)
      _duration := and(_encoded, 0xffffffffffffffffffffffffffffffff)
    }
  }
}
