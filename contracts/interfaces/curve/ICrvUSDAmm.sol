// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

interface ICrvUSDAmm {
  function get_rate_mul() external view returns (uint256);
}
