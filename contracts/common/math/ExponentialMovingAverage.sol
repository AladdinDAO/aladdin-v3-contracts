// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import { LogExpMath } from "./LogExpMath.sol";

// solhint-disable not-rely-on-time

/// @dev See https://en.wikipedia.org/wiki/Exponential_smoothing
library ExponentialMovingAverage {
  /*************
   * Constants *
   *************/

  /// @dev The precision used to compute EMA.
  uint256 private constant PRECISION = 1e18;

  /***********
   * Structs *
   ***********/

  /// @dev Compiler will pack this into single `uint256`.
  /// @param lastTime The last timestamp when the storage is updated.
  /// @param sampleInterval The sampling time interval used in the EMA.
  /// @param lastValue The last value in the data sequence, with precision 1e18.
  /// @param lastEmaValue The last EMA value computed, with precision 1e18.
  struct EMAStorage {
    uint40 lastTime;
    uint24 sampleInterval;
    uint96 lastValue;
    uint96 lastEmaValue;
  }

  /// @dev Save value of EMA storage.
  /// @param s The EMA storage.
  /// @param value The new value, with precision 1e18.
  function saveValue(EMAStorage memory s, uint96 value) internal view {
    s.lastEmaValue = uint96(emaValue(s));
    s.lastValue = value;
    s.lastTime = uint40(block.timestamp);
  }

  /// @dev Return the current ema value.
  /// @param s The EMA storage.
  function emaValue(EMAStorage memory s) internal view returns (uint256) {
    if (uint256(s.lastTime) < block.timestamp) {
      uint256 dt = block.timestamp - uint256(s.lastTime);
      uint256 e = (dt * PRECISION) / s.sampleInterval;
      if (e > 41e18) {
        return s.lastValue;
      } else {
        uint256 alpha = uint256(LogExpMath.exp(-int256(e)));
        return (s.lastValue * (PRECISION - alpha) + s.lastEmaValue * alpha) / PRECISION;
      }
    } else {
      return s.lastEmaValue;
    }
  }
}
