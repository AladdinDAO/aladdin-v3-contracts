// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

/// @dev from: https://etherscan.io/address/0x947Cb49334e6571ccBFEF1f1f1178d8469D65ec7
interface IKelpDAOLRTConfig {
  function supportedAssetList(uint256 index) external view returns (address);

  function getSupportedAssetList() external view returns (address[] memory);
}
