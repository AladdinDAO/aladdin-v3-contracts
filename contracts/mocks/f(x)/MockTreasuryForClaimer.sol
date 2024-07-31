// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

contract MockTreasuryForClaimer {
  uint256 public leverageRatio;

  function setLeverageRatio(uint256 _leverageRatio) external {
    leverageRatio = _leverageRatio;
  }
}
