// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;
pragma abicoder v2;

import "../../concentrator/interfaces/IAladdinCompounder.sol";
import "../../concentrator/interfaces/IConcentratorGeneralVault.sol";

import "../libraries/LibConcentratorHarvester.sol";

// solhint-disable not-rely-on-time

contract ConcentratorHarvesterFacet {
  /// @notice Return the minimum amount CTR should be locked.
  function minLockCTR() external view returns (uint256) {
    return LibConcentratorHarvester.harvesterStorage().minLockCTR;
  }

  /// @notice Return the minimum number of seconds that veCTR should be locked.
  function minLockDuration() external view returns (uint256) {
    return LibConcentratorHarvester.harvesterStorage().minLockDuration;
  }

  /// @notice Return whether the account can do harvest.
  function hasPermission(address _account) external view returns (bool) {
    ICurveVoteEscrow.LockedBalance memory _locked = ICurveVoteEscrow(LibConcentratorHarvester.veCTR).locked(msg.sender);
    LibConcentratorHarvester.HarvesterStorage storage hs = LibConcentratorHarvester.harvesterStorage();

    return
      hs.whitelist[_account] ||
      (uint128(_locked.amount) >= hs.minLockCTR && _locked.end >= hs.minLockDuration + block.timestamp);
  }

  /// @notice Harvest pending rewards from concentrator vault.
  /// @param _vault The address of concentrator vault contract.
  /// @param _pid The pool id to harvest.
  /// @param _minOut The minimum amount of rewards should get.
  function harvestConcentratorVault(
    address _vault,
    uint256 _pid,
    uint256 _minOut
  ) external {
    LibConcentratorHarvester.enforceHasPermission();

    IConcentratorGeneralVault(_vault).harvest(_pid, msg.sender, _minOut);
  }

  /// @notice Harvest pending rewards from AladdinCompounder contract.
  /// @param _compounder The address of AladdinCompounder contract.
  /// @param _minAssets The minimum amount of underlying assets should be harvested.
  function harvestConcentratorCompounder(address _compounder, uint256 _minAssets) external {
    LibConcentratorHarvester.enforceHasPermission();

    IAladdinCompounder(_compounder).harvest(msg.sender, _minAssets);
  }

  /// @notice Update the harvester permission parameters.
  /// @param _minLockCTR The minimum amount CTR should be locked.
  /// @param _minLockDuration The minimum number of seconds that veCTR should be locked.
  function updatePermission(uint128 _minLockCTR, uint128 _minLockDuration) external {
    LibConcentratorHarvester.enforceIsContractOwner();

    LibConcentratorHarvester.updatePermission(_minLockCTR, _minLockDuration);
  }

  /// @notice Update the whitelist status of account.
  /// @param _account The address to update.
  /// @param _status The status to update.
  function updateWhitelist(address _account, bool _status) external {
    LibConcentratorHarvester.enforceIsContractOwner();
    LibConcentratorHarvester.updateWhitelist(_account, _status);
  }
}
