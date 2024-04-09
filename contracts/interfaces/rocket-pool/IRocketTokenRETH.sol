// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

/// @dev from: https://etherscan.io/address/0xae78736cd615f374d3085123a210448e74fc6393
interface IRocketTokenRETH {
  // Calculate the amount of ETH backing an amount of rETH
  function getEthValue(uint256 rethAmount) external view returns (uint256);

  // Calculate the amount of rETH backed by an amount of ETH
  function getRethValue(uint256 ethAmount) external view returns (uint256);

  // Get the current ETH : rETH exchange rate
  // Returns the amount of ETH backing 1 rETH
  function getExchangeRate() external view returns (uint256);

  // Get the total amount of collateral available
  // Includes rETH contract balance & excess deposit pool balance
  function getTotalCollateral() external view returns (uint256);

  // Get the current ETH collateral rate
  // Returns the portion of rETH backed by ETH in the contract as a fraction of 1 ether
  function getCollateralRate() external view returns (uint256);
}
