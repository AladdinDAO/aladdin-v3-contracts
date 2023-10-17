// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import "../../interfaces/concentrator/ICLeverAMO.sol";

import "../libraries/LibConcentratorHarvester.sol";

contract CLeverAMOHarvesterFacet {
  /// @notice Harvest pending rewards from CLeverAMO contract.
  /// @param _amo The address of CLeverAMO contract.
  /// @param _minBaseOut The minimum of base token should harvested.
  function harvestCLeverAMO(address _amo, uint256 _minBaseOut) external {
    LibConcentratorHarvester.enforceHasPermission();

    ICLeverAMO(_amo).harvest(msg.sender, _minBaseOut);
  }
}
