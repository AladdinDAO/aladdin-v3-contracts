// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.25;

import { AccessControlUpgradeable } from "@openzeppelin/contracts-upgradeable-v4/access/AccessControlUpgradeable.sol";
import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable-v4/security/ReentrancyGuardUpgradeable.sol";

import { IFxOmniVault } from "../../interfaces/f(x)/omni-vault/IFxOmniVault.sol";

import { FeeManagement } from "./FeeManagement.sol";

abstract contract PoolManagers is FeeManagement {
  /*************
   * Variables *
   *************/

  /// @dev Slots for future use.
  uint256[50] private _gap;

  function __PoolManagers_init() internal onlyInitializing {}
}
