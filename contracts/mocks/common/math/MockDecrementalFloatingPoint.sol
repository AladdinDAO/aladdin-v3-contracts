// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { DecrementalFloatingPoint } from "../../../common/math/DecrementalFloatingPoint.sol";

contract MockDecrementalFloatingPoint {
  using DecrementalFloatingPoint for uint112;

  function encode(
    uint24 _epoch,
    uint24 _exponent,
    uint64 _magnitude
  ) external pure returns (uint112) {
    return DecrementalFloatingPoint.encode(_epoch, _exponent, _magnitude);
  }

  function epoch(uint112 prod) external pure returns (uint24 _epoch) {
    _epoch = prod.epoch();
  }

  function exponent(uint112 prod) external pure returns (uint24 _exponent) {
    _exponent = prod.exponent();
  }

  function epochAndExponent(uint112 prod) external pure returns (uint48 _epochExponent) {
    _epochExponent = prod.epochAndExponent();
  }

  function magnitude(uint112 prod) external pure returns (uint64 _magnitude) {
    _magnitude = prod.magnitude();
  }

  function mul(uint112 prod, uint64 scale) external pure returns (uint112) {
    return prod.mul(scale);
  }
}
