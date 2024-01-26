// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;
pragma abicoder v2;

import { Ownable2Step } from "@openzeppelin/contracts-v4/access/Ownable2Step.sol";
import { BeaconProxy } from "@openzeppelin/contracts-v4/proxy/beacon/BeaconProxy.sol";

import { IConcentratorHarvesterPoolFactory } from "../../interfaces/concentrator/IConcentratorHarvesterPoolFactory.sol";
import { IHarvesterPoolEntryPoint } from "../../interfaces/concentrator/IHarvesterPoolEntryPoint.sol";
import { IHarvesterPoolEntryPoint } from "../../interfaces/concentrator/IHarvesterPoolEntryPoint.sol";
import { IConvexBooster } from "../../interfaces/IConvexBooster.sol";

abstract contract ConvexCurveHarvesterPoolFactory is Ownable2Step, IConcentratorHarvesterPoolFactory {
  /**********
   * Events *
   **********/

  /// @notice Emitted when the address of strategy template is updated.
  /// @param oldTemplate The address of previous strategy template contract.
  /// @param newTemplate The address of current strategy template contract.
  event UpdateStrategyTemplate(address indexed oldTemplate, address indexed newTemplate);

  /// @notice Emitted when the address of Concentrator treasury is updated.
  /// @param oldTreasury The address of previous treasury contract.
  /// @param newTreasury The address of current treasury contract.
  event UpdateTreasury(address indexed oldTreasury, address indexed newTreasury);

  /// @notice Emitted when the address of Concentrator Harvester is updated.
  /// @param oldHarvester The address of previous harvester contract.
  /// @param newHarvester The address of current harvester contract.
  event UpdateHarvester(address indexed oldHarvester, address indexed newHarvester);

  /// @notice Emitted when the address of token converter is updated.
  /// @param oldConverter The address of previous converter contract.
  /// @param newConverter The address of current converter contract.
  event UpdateConverter(address indexed oldConverter, address indexed newConverter);

  /// @notice Emitted when the address of HarvesterPoolClaimGateway is updated.
  /// @param oldClaimer The address of previous claimer contract.
  /// @param newClaimer The address of current claimer contract.
  event UpdateClaimer(address indexed oldClaimer, address indexed newClaimer);

  /*************
   * Constants *
   *************/

  /// @notice The address of corresponding compounder contract.
  address public immutable compounder;

  /// @notice The address of `UpgradeableBeacon` for pool template.
  address public immutable poolBeacon;

  /// @notice The address of HarvesterPoolEntryPoint contract.
  address public immutable entryPoint;

  /// @dev The address of Convex Booster Contract
  address private constant BOOSTER = 0xF403C135812408BFbE8713b5A23a04b3D48AAE31;

  /*************
   * Variables *
   *************/

  /// @notice The address strategy template contract.
  address public strategyTemplate;

  /// @notice The address of Concentrator treasury.
  address public treasury = 0x32366846354DB5C08e92b4Ab0D2a510b2a2380C8;

  /// @notice The address of Concentrator Harvester.
  address public harvester = 0xfa86aa141e45da5183B42792d99Dede3D26Ec515;

  /// @notice The address of token converter contract.
  address public converter = 0x11C907b3aeDbD863e551c37f21DD3F36b28A6784;

  /// @notice The address of HarvesterPoolClaimGateway contract.
  address public claimer;

  /// @dev The list of created pools.
  address[] private _pools;

  /// @dev Mapping from gauge address to pool address.
  mapping(address => address) private _gaugeToPools;

  /***************
   * Constructor *
   ***************/

  constructor(
    address _compounder,
    address _poolBeacon,
    address _entryPoint,
    address _strategyTemplate,
    address _claimer
  ) {
    if (_compounder == address(0) || _poolBeacon == address(0) || _entryPoint == address(0)) {
      revert ErrorZeroAddress();
    }

    compounder = _compounder;
    poolBeacon = _poolBeacon;
    entryPoint = _entryPoint;

    _updateStrategyTemplate(_strategyTemplate);
    _updateClaimer(_claimer);
  }

  /*************************
   * Public View Functions *
   *************************/

  /// @inheritdoc IConcentratorHarvesterPoolFactory
  function getAllPools() external view override returns (address[] memory) {
    return _pools;
  }

  /// @inheritdoc IConcentratorHarvesterPoolFactory
  function getPoolByIndex(uint256 index) external view override returns (address _pool) {
    _pool = _pools[index];
  }

  /// @inheritdoc IConcentratorHarvesterPoolFactory
  function getPoolByAsset(address _asset) external view override returns (address _pool) {
    _pool = _gaugeToPools[_asset];
  }

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @notice Create a new pool with the given convex pid.
  ///
  /// @param _pid The pid of convex pool.
  ///
  /// @return _pool The address of new created pool.
  function create(uint256 _pid) external returns (address _pool) {
    IConvexBooster.PoolInfo memory _info = IConvexBooster(BOOSTER).poolInfo(_pid);
    if (_gaugeToPools[_info.gauge] != address(0)) revert ErrorPoolForAssetExisted();

    BeaconProxy proxy = new BeaconProxy(poolBeacon, new bytes(0));
    address _strategy = _createStrategy(_info, address(proxy));
    _initializePool(_info, address(proxy), _strategy);
    _pool = address(proxy);

    uint256 _index = _pools.length;
    _pools.push(_pool);
    _gaugeToPools[_info.gauge] = _pool;

    IHarvesterPoolEntryPoint(entryPoint).registerConvexCurvePool(_info.gauge);

    emit NewPool(_index, _info.gauge, _pool);
  }

  /************************
   * Restricted Functions *
   ************************/

  /// @notice Update the address of strategy template.
  /// @param _newTemplate The address of new template contract.
  function updateStrategyTemplate(address _newTemplate) external onlyOwner {
    _updateStrategyTemplate(_newTemplate);
  }

  /// @notice Update the address of Concentrator treasury.
  /// @param _newTreasury The address of new treasury contract.
  function updateTreasury(address _newTreasury) external onlyOwner {
    if (_newTreasury == address(0)) revert ErrorZeroAddress();

    address _oldTreasury = treasury;
    treasury = _newTreasury;

    emit UpdateTreasury(_oldTreasury, _newTreasury);
  }

  /// @notice Update the address of Concentrator Harvester contract.
  /// @param _newHarvester The address of new harvester contract.
  function updateHarvester(address _newHarvester) external onlyOwner {
    address _oldHarvester = harvester;
    harvester = _newHarvester;

    emit UpdateHarvester(_oldHarvester, _newHarvester);
  }

  /// @notice Update the address of token converter contract.
  /// @param _newConverter The address of new converter contract.
  function updateConverter(address _newConverter) external onlyOwner {
    if (_newConverter == address(0)) revert ErrorZeroAddress();

    address _oldConverter = converter;
    converter = _newConverter;

    emit UpdateConverter(_oldConverter, _newConverter);
  }

  /// @notice Update the address of token claimer contract.
  /// @param _newClaimer The address of new claimer contract.
  function updateClaimer(address _newClaimer) external onlyOwner {
    _updateClaimer(_newClaimer);
  }

  /**********************
   * Internal Functions *
   **********************/

  /// @dev Internal function to update the address of strategy template.
  /// @param _newTemplate The address of new template contract.
  function _updateStrategyTemplate(address _newTemplate) internal {
    if (_newTemplate == address(0)) revert ErrorZeroAddress();

    address _oldTempalte = strategyTemplate;
    strategyTemplate = _newTemplate;

    emit UpdateStrategyTemplate(_oldTempalte, _newTemplate);
  }

  /// @dev Internal function to update the address of claimer.
  /// @param _newClaimer The address of new claimer contract.
  function _updateClaimer(address _newClaimer) internal {
    if (_newClaimer == address(0)) revert ErrorZeroAddress();

    address _oldClaimer = claimer;
    claimer = _newClaimer;

    emit UpdateClaimer(_oldClaimer, _newClaimer);
  }

  /// @dev Internal function to create strategy contract for the given pool.
  /// @param _info The pool information in convex.
  /// @param _pool The address of the pool contract.
  /// @return _strategy The address of created strategy contract.
  function _createStrategy(IConvexBooster.PoolInfo memory _info, address _pool)
    internal
    virtual
    returns (address _strategy);

  /// @dev Internal function to initalize the given pool.
  /// @param _info The pool information in convex.
  /// @param _pool The address of the pool contract.
  /// @param _strategy The address of the strategy contract.
  function _initializePool(
    IConvexBooster.PoolInfo memory _info,
    address _pool,
    address _strategy
  ) internal virtual;
}
