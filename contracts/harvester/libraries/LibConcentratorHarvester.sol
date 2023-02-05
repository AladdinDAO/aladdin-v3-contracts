// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;
pragma abicoder v2;

import "../../interfaces/ICurveVoteEscrow.sol";

// solhint-disable const-name-snakecase
// solhint-disable no-inline-assembly
// solhint-disable not-rely-on-time

library LibConcentratorHarvester {
  /*************
   * Constants *
   *************/

  /// @dev The storage slot for default diamond storage.
  bytes32 private constant DIAMOND_STORAGE_POSITION = keccak256("diamond.standard.diamond.storage");

  /// @dev The storage slot for harvester storage.
  bytes32 private constant HARVESTER_STORAGE_POSITION = keccak256("diamond.harvester.concentrator.storage");

  /// @dev The address of veCTR contract.
  address internal constant veCTR = 0xe4C09928d834cd58D233CD77B5af3545484B4968;

  /***********
   * Structs *
   ***********/

  struct FacetAddressAndSelectorPosition {
    address facetAddress;
    uint16 selectorPosition;
  }

  struct DiamondStorage {
    // function selector => facet address and selector position in selectors array
    mapping(bytes4 => FacetAddressAndSelectorPosition) facetAddressAndSelectorPosition;
    bytes4[] selectors;
    mapping(bytes4 => bool) supportedInterfaces;
    // owner of the contract
    address contractOwner;
  }

  struct HarvesterStorage {
    uint128 minLockCTR;
    uint128 minLockDuration;
    mapping(address => bool) whitelist;
  }

  /**********************
   * Internal Functions *
   **********************/

  function diamondStorage() private pure returns (DiamondStorage storage ds) {
    bytes32 position = DIAMOND_STORAGE_POSITION;
    assembly {
      ds.slot := position
    }
  }

  function harvesterStorage() internal pure returns (HarvesterStorage storage hs) {
    bytes32 position = DIAMOND_STORAGE_POSITION;
    assembly {
      hs.slot := position
    }
  }

  function updatePermission(uint128 _minLockCTR, uint128 _minLockDuration) internal {
    HarvesterStorage storage hs = harvesterStorage();

    hs.minLockCTR = _minLockCTR;
    hs.minLockDuration = _minLockDuration;
  }

  function updateWhitelist(address _account, bool _status) internal {
    HarvesterStorage storage hs = harvesterStorage();

    hs.whitelist[_account] = _status;
  }

  function enforceIsContractOwner() internal view {
    require(msg.sender == diamondStorage().contractOwner, "only owner");
  }

  function enforceHasPermission() internal view {
    ICurveVoteEscrow.LockedBalance memory _locked = ICurveVoteEscrow(veCTR).locked(msg.sender);
    HarvesterStorage storage hs = harvesterStorage();

    // check whether is whitelisted
    if (hs.whitelist[msg.sender]) return;

    // check veCTR locking
    require(uint128(_locked.amount) >= hs.minLockCTR, "insufficient lock amount");
    require(_locked.end >= hs.minLockDuration + block.timestamp, "insufficient lock duration");
  }
}
