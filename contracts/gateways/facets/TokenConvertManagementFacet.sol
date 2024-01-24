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

  /// @notice Return the token approve spender for the given target.
  function getSpender(address target) external view returns (address _spender) {
    LibGatewayRouter.GatewayStorage storage gs = LibGatewayRouter.gatewayStorage();
    _spender = gs.spenders[target];
    if (_spender == address(0)) _spender = target;
  }

  /// @notice Return the list of approved targets.
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

  /// @notice Approve contract to be used in token converting.
  function approveTarget(address target, address spender) external {
    LibDiamond.enforceIsContractOwner();
    LibGatewayRouter.approveTarget(target, spender);
  }

  /// @notice Remove approve contract in token converting.
  function removeTarget(address target) external {
    LibDiamond.enforceIsContractOwner();
    LibGatewayRouter.removeTarget(target);
  }
}
