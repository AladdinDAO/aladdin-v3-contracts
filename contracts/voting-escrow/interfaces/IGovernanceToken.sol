// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

// solhint-disable func-name-mixedcase

interface IGovernanceToken {
  function rate() external view returns (uint256);

  function future_epoch_time_write() external returns (uint256);
}
