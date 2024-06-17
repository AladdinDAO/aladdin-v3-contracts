// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import { IFxRateProvider } from "../../interfaces/f(x)/IFxRateProvider.sol";

contract MockFxRateProvider is IFxRateProvider {
  uint256 public override getRate;

  function setRate(uint256 _rate) external {
    getRate = _rate;
  }
}
