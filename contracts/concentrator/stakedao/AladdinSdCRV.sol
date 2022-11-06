// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import "../AladdinCompounder.sol";

contract AladdinSdCRV is AladdinCompounder {
  function harvest(address recipient, uint256 minAssets) external override returns (uint256 assets) {}
}
