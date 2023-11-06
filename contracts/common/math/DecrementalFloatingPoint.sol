// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

// solhint-disable no-inline-assembly

/// @title DecrementalFloatingPoint
///
/// @dev The real number is `magnitude * 10^{-18 - 9 * exponent}`, where `magnitude` is in range `(0, 10^18]`.
/// And the floating point is encoded as:
///
/// [  epoch  | exponent | magnitude ]
/// [ 32 bits | 32  bits |  64 bits  ]
/// [ MSB                        LSB ]
library DecrementalFloatingPoint {
  uint64 internal constant PRECISION = 1e18;

  uint64 internal constant HALF_PRECISION = 1e9;

  function encode(
    uint32 _epoch,
    uint32 _exponent,
    uint64 _magnitude
  ) internal pure returns (uint128 prod) {
    assembly {
      prod := add(_magnitude, add(shl(64, _exponent), shl(96, _epoch)))
    }
  }

  function epoch(uint128 prod) internal pure returns (uint32 _epoch) {
    assembly {
      _epoch := shr(96, prod)
    }
  }

  function exponent(uint128 prod) internal pure returns (uint32 _exponent) {
    assembly {
      _exponent := and(shr(64, prod), 0xffffffff)
    }
  }

  function epochAndExponent(uint128 prod) internal pure returns (uint64 _epochExponent) {
    assembly {
      _epochExponent := shr(64, prod)
    }
  }

  function magnitude(uint128 prod) internal pure returns (uint64 _magnitude) {
    assembly {
      _magnitude := and(prod, 0xffffffffffffffff)
    }
  }

  function mul(uint128 prod, uint256 scale) internal pure returns (uint128) {
    uint32 _epoch = epoch(prod);
    uint32 _exponent = exponent(prod);
    uint256 _magnitude = magnitude(prod);

    unchecked {
      if (scale == 0) {
        _epoch += 1;
        _exponent = 0;
        _magnitude = PRECISION;
      } else if ((scale * _magnitude) / PRECISION < HALF_PRECISION) {
        _exponent += 1;
        _magnitude = (_magnitude * scale) / HALF_PRECISION;
      } else {
        _magnitude = (_magnitude * scale) / PRECISION;
      }
    }

    return encode(_epoch, _exponent, uint64(_magnitude));
  }
}
