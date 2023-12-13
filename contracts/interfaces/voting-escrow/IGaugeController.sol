// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

// solhint-disable func-name-mixedcase

interface IGaugeController {
  function voting_escrow() external view returns (address);

  function gauge_relative_weight(address addr, uint256 time) external view returns (uint256);

  function checkpoint_gauge(address gauge) external;
}
