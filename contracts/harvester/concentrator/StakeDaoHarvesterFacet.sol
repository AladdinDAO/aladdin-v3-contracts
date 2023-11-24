// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import "../../interfaces/concentrator/IAladdinCompounder.sol";
import "../../interfaces/concentrator/IConcentratorStakeDAOVault.sol";

import "../libraries/LibConcentratorHarvester.sol";

contract StakeDaoHarvesterFacet {
  /// @notice Harvest pending rewards from StakeDAOVault contract.
  /// @param _vault The address of StakeDAOVault contract.
  function harvestStakeDaoVault(address _vault) external {
    LibConcentratorHarvester.enforceHasPermission();

    IConcentratorStakeDAOVault(_vault).harvest(msg.sender);
  }

  /// @notice Harvest pending rewards from StakeDAOVault and corresponding AladdinCompounder contract.
  /// @param _vault The address of StakeDAOVault contract.
  /// @param _compounder The address of AladdinCompounder contract.
  /// @param _minAssets The minimum amount of underlying assets should be harvested.
  function harvestStakeDaoVaultAndCompounder(
    address _vault,
    address _compounder,
    uint256 _minAssets
  ) external {
    LibConcentratorHarvester.enforceHasPermission();

    IConcentratorStakeDAOVault(_vault).harvest(msg.sender);
    IAladdinCompounder(_compounder).harvest(msg.sender, _minAssets);
  }
}
