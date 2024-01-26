// SPDX-License-Identifier: MIT

pragma solidity =0.8.20;

import { AccessControlUpgradeable } from "@openzeppelin/contracts-upgradeable-v4/access/AccessControlUpgradeable.sol";
import { EnumerableSetUpgradeable } from "@openzeppelin/contracts-upgradeable-v4/utils/structs/EnumerableSetUpgradeable.sol";

import { IConcentratorHarvesterPoolFactory } from "../../interfaces/concentrator/IConcentratorHarvesterPoolFactory.sol";
import { IHarvesterPoolEntryPoint } from "../../interfaces/concentrator/IHarvesterPoolEntryPoint.sol";

contract HarvesterPoolEntryPoint is AccessControlUpgradeable, IHarvesterPoolEntryPoint {
  using EnumerableSetUpgradeable for EnumerableSetUpgradeable.AddressSet;

  /*************
   * Constants *
   *************/

  /// @notice The role for pool factory.
  bytes32 public constant POOL_FACTORY_ROLE = keccak256("POOL_FACTORY_ROLE");

  /***************
   * Constructor *
   ***************/

  function initialize() external initializer {
    _grantRole(DEFAULT_ADMIN_ROLE, _msgSender());
  }

  /*************
   * Variables *
   *************/

  /// @notice Mapping from curve gauge address to list of factories.
  mapping(address => EnumerableSetUpgradeable.AddressSet) private gaugeToFactories;

  /*************************
   * Public View Functions *
   *************************/

  /// @notice Get all harvester pools for the given gauge.
  /// @param gauge The address of curve gauge.
  /// @return _pools The list of pool addresses.
  /// @return _factories The list of corresponding pool factory names.
  function getConvexCurveHarvesterPools(address gauge)
    external
    view
    returns (address[] memory _pools, string[] memory _factories)
  {
    uint256 _length = gaugeToFactories[gauge].length();
    _pools = new address[](_length);
    _factories = new string[](_length);

    for (uint256 i = 0; i < _length; i++) {
      address _factory = gaugeToFactories[gauge].at(i);
      _factories[i] = IConcentratorHarvesterPoolFactory(_factory).name();
      _pools[i] = IConcentratorHarvesterPoolFactory(_factory).getPoolByAsset(gauge);
    }
  }

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @notice Register a pool for the given gauge.
  /// @param gauge The address of curve gauge.
  function registerConvexCurvePool(address gauge) external override onlyRole(POOL_FACTORY_ROLE) {
    gaugeToFactories[gauge].add(_msgSender());
  }
}
