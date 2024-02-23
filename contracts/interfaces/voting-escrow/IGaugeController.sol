// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

// solhint-disable func-name-mixedcase

interface IGaugeController {
  /// @notice Get gauge type for address
  /// @param _addr Gauge address
  /// @return Gauge type id
  function gauge_types(address _addr) external view returns (int128);

  /// @notice Return the address of voting escrow contract.
  function voting_escrow() external view returns (address);

  /// @notice Get Gauge relative weight (not more than 1.0) normalized to 1e18 (e.g. 1.0 == 1e18).
  /// Inflation which will be received by it is inflation_rate * relative_weight / 1e18.
  ///
  /// @param addr Gauge address
  /// @param time Relative weight at the specified timestamp in the past or present
  /// @return Value of relative weight normalized to 1e18
  function gauge_relative_weight(address addr, uint256 time) external view returns (uint256);

  /// @notice Get current total (type-weighted) weight
  /// @return Total weight
  function get_total_weight() external view returns (uint256);

  /// @notice Get current gauge weight
  /// @param addr Gauge address
  /// @return Gauge weight
  function get_gauge_weight(address addr) external view returns (uint256);

  /// @notice Get current type weight
  /// @param type_id Type id
  /// @return Type weight
  function get_type_weight(int128 type_id) external view returns (uint256);

  /// @notice Checkpoint to fill data common for all gauges
  function checkpoint() external;

  /// @notice Checkpoint to fill data for both a specific gauge and common for all gauges
  /// @param addr Gauge address
  function checkpoint_gauge(address addr) external;

  /// @notice Transfer ownership of GaugeController to `addr`
  /// @param addr Address to have ownership transferred to
  function commit_transfer_ownership(address addr) external;

  /// @notice Apply pending ownership transfer
  function apply_transfer_ownership() external;

  /// @notice Add gauge `addr` of type `gauge_type` with zero weight
  /// @param addr Gauge address
  /// @param gauge_type Gauge type
  function add_gauge(address addr, int128 gauge_type) external;

  /// @notice Add gauge `addr` of type `gauge_type` with weight `weight`
  /// @param addr Gauge address
  /// @param gauge_type Gauge type
  /// @param weight Gauge weight
  function add_gauge(
    address addr,
    int128 gauge_type,
    uint256 weight
  ) external;

  /// @notice Add gauge type with name `_name` and zero weight.
  /// @param _name Name of gauge type
  function add_type(string memory _name) external;

  /// @notice Add gauge type with name `_name` and weight `weight`
  /// @param _name Name of gauge type
  /// @param weight Weight of gauge type
  function add_type(string memory _name, uint256 weight) external;

  /// @notice Change gauge type `type_id` weight to `weight`
  /// @param type_id Gauge type id
  /// @param weight New Gauge weight
  function change_type_weight(int128 type_id, uint256 weight) external;

  /// @notice Change weight of gauge `addr` to `weight`
  /// @param addr `GaugeController` contract address
  /// @param weight New Gauge weight
  function change_gauge_weight(address addr, uint256 weight) external;
}
