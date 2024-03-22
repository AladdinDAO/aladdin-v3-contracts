// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

/// @dev from: https://etherscan.io/address/0x036676389e48133b63a802f8635ad39e752d375d
interface IKelpDAOLRTDepositPool {
  function lrtConfig() external view returns (address);

  /// @notice View amount of rsETH to mint for given asset amount
  /// @param asset Asset address
  /// @param depositAmount Asset amount
  /// @return rsethAmountToMint Amount of rseth to mint
  function getRsETHAmountToMint(address asset, uint256 depositAmount) external view returns (uint256 rsethAmountToMint);

  /// @notice Allows user to deposit ETH to the protocol
  /// @param minRSETHAmountExpected Minimum amount of rseth to receive
  /// @param referralId referral id
  function depositETH(uint256 minRSETHAmountExpected, string calldata referralId) external payable;

  /// @notice helps user stake LST to the protocol
  /// @param asset LST asset address to stake
  /// @param depositAmount LST asset amount to stake
  /// @param minRSETHAmountExpected Minimum amount of rseth to receive
  function depositAsset(
    address asset,
    uint256 depositAmount,
    uint256 minRSETHAmountExpected,
    string calldata referralId
  ) external;
}
