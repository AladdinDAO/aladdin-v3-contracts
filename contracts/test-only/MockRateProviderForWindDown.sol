// SPDX-License-Identifier: MIT
pragma solidity =0.8.20;

/// @dev Test-only helper. Not part of the reviewed change set.
contract MockRateProviderForWindDown {
  uint256 public rate;
  bool public shouldRevert;

  constructor(uint256 _rate) {
    rate = _rate;
  }

  function setRate(uint256 _rate) external {
    rate = _rate;
  }

  function setShouldRevert(bool _v) external {
    shouldRevert = _v;
  }

  function getRate() external view returns (uint256) {
    require(!shouldRevert, "rate provider down");
    return rate;
  }
}
