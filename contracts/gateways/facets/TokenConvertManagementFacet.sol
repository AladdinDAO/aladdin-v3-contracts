// SPDX-License-Identifier: MIT

pragma solidity =0.8.20;

import { EnumerableSetUpgradeable } from "@openzeppelin/contracts-upgradeable-v4/utils/structs/EnumerableSetUpgradeable.sol";

import { LibDiamond } from "../../common/EIP2535/libraries/LibDiamond.sol";
import { LibGatewayRouter } from "../libraries/LibGatewayRouter.sol";

contract TokenConvertManagementFacet {
  using EnumerableSetUpgradeable for EnumerableSetUpgradeable.AddressSet;

  /*************************
   * Public View Functions *
   *************************/

  function getSpender(address target) external view returns (address) {
    LibGatewayRouter.GatewayStorage storage gs = LibGatewayRouter.gatewayStorage();
    return gs.spenders[target];
  }

  function getApprovedTargets() external view returns (address[] memory _targets) {
    LibGatewayRouter.GatewayStorage storage gs = LibGatewayRouter.gatewayStorage();
    uint256 _numTargets = gs.approvedTargets.length();
    _targets = new address[](_numTargets);
    for (uint256 i = 0; i < _numTargets; i++) {
      _targets[i] = gs.approvedTargets.at(i);
    }
  }

  /************************
   * Restricted Functions *
   ************************/

  function approveTarget(address target, address spender) external {
    LibDiamond.enforceIsContractOwner();
    LibGatewayRouter.approveTarget(target, spender);
  }

  function removeTarget(address target) external {
    LibDiamond.enforceIsContractOwner();
    LibGatewayRouter.removeTarget(target);
  }
}
