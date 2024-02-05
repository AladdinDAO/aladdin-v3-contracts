// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

/// @dev from: https://etherscan.io/address/0xdd3f50f8a6cafbe9b31a427582963f465e745af8
interface IRocketDepositPool {
  /// @notice Deposits ETH into Rocket Pool and mints the corresponding amount of rETH to the caller
  function deposit() external payable;
}
