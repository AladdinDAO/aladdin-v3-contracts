// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import "../../interfaces/concentrator/IFxUSDCompounder.sol";

import "../libraries/LibConcentratorHarvester.sol";

contract FxUSDCompounderHarvestFacet {
  /// @notice Harvest pending rewards from FxUSDCompounder contract.
  /// @param compounder The address of FxUSDCompounder contract.
  /// @param minBaseOut The minimum amount of base token should be harvested.
  /// @param minFxUSD The minimum amount of FxUSD should be harvested.
  /// @return baseOut The amount of base token harvested.
  /// @return fxUSDOut The amount of FxUSD harvested.
  function harvestConcentratorCompounder(
    address compounder,
    uint256 minBaseOut,
    uint256 minFxUSD
  ) external returns (uint256 baseOut, uint256 fxUSDOut) {
    LibConcentratorHarvester.enforceHasPermission();

    (baseOut, fxUSDOut) = IFxUSDCompounder(compounder).harvest(msg.sender, minBaseOut, minFxUSD);
  }
}
