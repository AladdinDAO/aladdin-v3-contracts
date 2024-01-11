// SPDX-License-Identifier: MIT

pragma solidity ^0.7.0;
pragma abicoder v2;

import { ExponentialMovingAverageV7 } from "../../../common/math/ExponentialMovingAverageV7.sol";

contract MockExponentialMovingAverage {
  using ExponentialMovingAverageV7 for ExponentialMovingAverageV7.EMAStorage;

  ExponentialMovingAverageV7.EMAStorage public state;

  function setState(ExponentialMovingAverageV7.EMAStorage memory _state) external {
    state = _state;
  }

  function saveValue(uint96 value) external {
    ExponentialMovingAverageV7.EMAStorage memory cachedState = state;
    cachedState.saveValue(value);
    state = cachedState;
  }

  function emaValue() external view returns (uint256) {
    return state.emaValue();
  }
}
