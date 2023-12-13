// SPDX-License-Identifier: MIT

pragma solidity ^0.7.0;
pragma abicoder v2;

import { ExponentialMovingAverage } from "../../../common/math/ExponentialMovingAverage.sol";

contract MockExponentialMovingAverage {
  using ExponentialMovingAverage for ExponentialMovingAverage.EMAStorage;

  ExponentialMovingAverage.EMAStorage public state;

  function setState(ExponentialMovingAverage.EMAStorage memory _state) external {
    state = _state;
  }

  function saveValue(uint96 value) external {
    ExponentialMovingAverage.EMAStorage memory cachedState = state;
    cachedState.saveValue(value);
    state = cachedState;
  }

  function emaValue() external view returns (uint256) {
    return state.emaValue();
  }
}
