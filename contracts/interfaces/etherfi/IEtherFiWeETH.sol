// SPDX-License-Identifier: MIT

pragma solidity ^0.7.0 || ^0.8.0;

/// @dev from: https://etherscan.io/token/0xcd5fe23c85820f7b72d0926fc9b05b43e359b7ee
interface IEtherFiWeETH {
  /// @notice Fetches the amount of weEth respective to the amount of eEth sent in
  /// @param eETHAmount amount sent in
  /// @return The total number of shares for the specified amount
  function getWeETHByeETH(uint256 eETHAmount) external view returns (uint256);

  /// @notice Fetches the amount of eEth respective to the amount of weEth sent in
  /// @param weETHAmount amount sent in
  /// @return The total amount for the number of shares sent in
  function getEETHByWeETH(uint256 weETHAmount) external view returns (uint256);

  // Amount of weETH for 1 eETH
  function getRate() external view returns (uint256);

  /// @notice Wraps eEth
  /// @param eETHAmount the amount of eEth to wrap
  /// @return returns the amount of weEth the user receives
  function wrap(uint256 eETHAmount) external returns (uint256);

  /// @notice Unwraps weETH
  /// @param weETHAmount the amount of weETH to unwrap
  /// @return returns the amount of eEth the user receives
  function unwrap(uint256 weETHAmount) external returns (uint256);
}
