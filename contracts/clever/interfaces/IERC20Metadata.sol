// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

interface IERC20Metadata {
  function decimals() external view returns (uint8);

  function symbol() external view returns (string memory);

  function name() external view returns (string memory);
}
