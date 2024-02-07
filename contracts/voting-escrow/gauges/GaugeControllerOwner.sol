// SPDX-License-Identifier: MIT

pragma solidity =0.8.20;

import { AccessControl } from "@openzeppelin/contracts-v4/access/AccessControl.sol";
import { EnumerableSet } from "@openzeppelin/contracts-v4/utils/structs/EnumerableSet.sol";

import { GaussElimination } from "../../common/math/GaussElimination.sol";

import { IGaugeController } from "../../interfaces/voting-escrow/IGaugeController.sol";

contract GaugeControllerOwner is AccessControl {
  using EnumerableSet for EnumerableSet.AddressSet;

  /**********
   * Events *
   **********/

  /// @notice Emitted when the expected gauge relative weight is updated.
  /// @param gauge The address of the gauge.
  /// @param oldWeight The value of previous relative weight, multiplied with 1e18.
  /// @param newWeight The value of current relative weight, multiplied with 1e18.
  event UpdateRelativeWeight(address indexed gauge, uint256 oldWeight, uint256 newWeight);

  /**********
   * Errors *
   **********/

  /// @dev Thrown when the given expected relative weight is too large.
  error ErrorWeightTooLarge();

  /// @dev Thrown when the given relative weights leads to an invalid solution.
  error ErrorInvalidSolution();

  /// @dev Thrown when the given relative weights cannot lead to a solution.
  error ErrorNoSolution();

  /*************
   * Constants *
   *************/

  /// @notice The role for weight normalizer.
  bytes32 public constant WEIGHT_NORMALIZER_ROLE = keccak256("WEIGHT_NORMALIZER_ROLE");

  /// @dev The precision used to compute weight.
  uint256 internal constant PRECISION = 1e18;

  /// @notice The address of gauge controller.
  address public immutable controller;

  /*************
   * Variables *
   *************/

  /// @notice Mapping to gauge address to predetermined weight, multiplied with 1e18.
  mapping(address => uint256) public weights;

  /// @dev The list of whitelisted gauges.
  EnumerableSet.AddressSet private gauges;

  /***************
   * Constructor *
   ***************/

  constructor(address _controller) {
    controller = _controller;

    _grantRole(DEFAULT_ADMIN_ROLE, _msgSender());
  }

  /*************************
   * Public View Functions *
   *************************/

  /// @notice Return the list of whitelisted gauges.
  function getGauges() external view returns (address[] memory _gauges) {
    uint256 _length = gauges.length();
    _gauges = new address[](_length);
    for (uint256 i = 0; i < _length; ++i) {
      _gauges[i] = gauges.at(i);
    }
  }

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @notice Normalize the whitelisted gauge to correct weight.
  function normalizeGaugeWeight() external onlyRole(WEIGHT_NORMALIZER_ROLE) {
    uint256 _length = gauges.length();
    if (_length == 0) return;

    IGaugeController(controller).checkpoint();
    uint256 _totalWeight = IGaugeController(controller).get_total_weight();
    address[] memory _gauges = new address[](_length);
    uint256[] memory _gaugeWeights = new uint256[](_length);
    uint256[] memory _typeWeights = new uint256[](_length);
    for (uint256 i = 0; i < _length; i++) {
      _gauges[i] = gauges.at(i);
      IGaugeController(controller).checkpoint_gauge(_gauges[i]);
      _gaugeWeights[i] = IGaugeController(controller).get_gauge_weight(_gauges[i]);
      int128 _type = IGaugeController(controller).gauge_types(_gauges[i]);
      _typeWeights[i] = IGaugeController(controller).get_type_weight(_type);
      _totalWeight -= _gaugeWeights[i] * _typeWeights[i];
    }

    if (_totalWeight == 0) {
      // w[i] = tw[i] * x[i] / (sum_{j} tw[j] * x[j])
      // where
      //   w[i] is the expected relative weight
      //   tw[i] is current type weight, which > 0
      //   x[i] is the expected gauge weight to set
      // a solution is x[i] = w[i] / tw[i], since sum_{i} w[i] = 1
      uint256 sum;
      for (uint256 i = 0; i < _length; i++) {
        uint256 w = weights[_gauges[i]];
        sum += w;
        IGaugeController(controller).change_gauge_weight(_gauges[i], (w * PRECISION) / _typeWeights[i]);
      }
      if (sum != PRECISION) revert ErrorNoSolution();
      return;
    }

    // we need to solve the following equation with gauss elimination.
    // w[i] / 1e18 = tw[i] * x[i] / (total + sum tw[j] * x[j])
    // where
    //   w[i] is the expected relative weight
    //   tw[i] is current type weight
    //   x[i] is the expected gauge weight to set
    int256[][] memory a = new int256[][](_length);
    int256[] memory b = new int256[](_length);
    for (uint256 r = 0; r < _length; r++) {
      a[r] = new int256[](_length);
      uint256 w = weights[_gauges[r]];
      b[r] = int256((_totalWeight * w) / PRECISION);
      for (uint256 c = 0; c < _length; c++) {
        if (r == c) a[r][c] = int256(_typeWeights[r] - (_typeWeights[r] * w) / PRECISION);
        else a[r][c] = -int256((_typeWeights[c] * w) / PRECISION);
      }
    }
    // solve the equation and save solution in b
    if (!GaussElimination.solve(a, b)) revert ErrorNoSolution();
    for (uint256 i = 0; i < _length; i++) {
      b[i] /= int256(PRECISION);
      if (b[i] <= 0) revert ErrorInvalidSolution();
      IGaugeController(controller).change_gauge_weight(_gauges[i], uint256(b[i]));
    }
  }

  /************************
   * Restricted Functions *
   ************************/

  /// @notice Whitelist a gauge with fixed relative gauge weight.
  /// @param _gauge The address of gauge to whitelist.
  /// @param _newWeight The expected fixed weight, multiplied with 1e18.
  function updateRelativeWeight(address _gauge, uint256 _newWeight) external onlyRole(DEFAULT_ADMIN_ROLE) {
    if (_newWeight >= PRECISION) revert ErrorWeightTooLarge();

    // this call will make sure the gauge exists
    IGaugeController(controller).gauge_types(_gauge);

    uint256 _oldWeight = weights[_gauge];
    weights[_gauge] = _newWeight;
    emit UpdateRelativeWeight(_gauge, _oldWeight, _newWeight);

    if (_newWeight == 0) {
      gauges.remove(_gauge);
      IGaugeController(controller).change_gauge_weight(_gauge, 0);
    } else {
      gauges.add(_gauge);
    }
  }

  /// @notice Transfer ownership of GaugeController to `addr`
  /// @param addr Address to have ownership transferred to
  function commitTransferOwnership(address addr) external onlyRole(DEFAULT_ADMIN_ROLE) {
    IGaugeController(controller).commit_transfer_ownership(addr);
  }

  /// @notice Apply pending ownership transfer
  function applyTransferOwnership() external onlyRole(DEFAULT_ADMIN_ROLE) {
    IGaugeController(controller).apply_transfer_ownership();
  }

  /// @notice Add gauge `addr` of type `gaugeType` with zero weight
  /// @param addr Gauge address
  /// @param gaugeType Gauge type
  function addGauge(address addr, int128 gaugeType) external onlyRole(DEFAULT_ADMIN_ROLE) {
    IGaugeController(controller).add_gauge(addr, gaugeType);
  }

  /// @notice Add gauge `addr` of type `gaugeType` with weight `weight`
  /// @param addr Gauge address
  /// @param gaugeType Gauge type
  /// @param weight Gauge weight
  function addGauge(
    address addr,
    int128 gaugeType,
    uint256 weight
  ) external onlyRole(DEFAULT_ADMIN_ROLE) {
    IGaugeController(controller).add_gauge(addr, gaugeType, weight);
  }

  /// @notice Add gauge type with name `name` and zero weight.
  /// @param name Name of gauge type
  function addType(string memory name) external onlyRole(DEFAULT_ADMIN_ROLE) {
    IGaugeController(controller).add_type(name);
  }

  /// @notice Add gauge type with name `name` and weight `weight`
  /// @param name Name of gauge type
  /// @param weight Weight of gauge type
  function addType(string memory name, uint256 weight) external onlyRole(DEFAULT_ADMIN_ROLE) {
    IGaugeController(controller).add_type(name, weight);
  }

  /// @notice Change gauge type `typeId` weight to `weight`
  /// @param typeId Gauge type id
  /// @param weight New Gauge weight
  function changeTypeWeight(int128 typeId, uint256 weight) external onlyRole(DEFAULT_ADMIN_ROLE) {
    IGaugeController(controller).change_type_weight(typeId, weight);
  }

  /// @notice Change weight of gauge `addr` to `weight`
  /// @param addr `GaugeController` contract address
  /// @param weight New Gauge weight
  function changeGaugeWeight(address addr, uint256 weight) external onlyRole(DEFAULT_ADMIN_ROLE) {
    IGaugeController(controller).change_gauge_weight(addr, weight);
  }
}
