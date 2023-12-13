// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

// solhint-disable no-inline-assembly

/// @title DecrementalFloatingPoint
///
/// @dev The real number is `magnitude * 10^{-18 - 9 * exponent}`, where `magnitude` is in range `(0, 10^18]`.
/// And the floating point is encoded as:
///
/// [  epoch  | exponent | magnitude ]
/// [ 24 bits | 24  bits |  64 bits  ]
/// [ MSB                        LSB ]
///
/// Hopefully, the `epoch` and `exponent` won't exceed `type(uint24).max`.
library DecrementalFloatingPoint {
  /// @dev The precision of the `magnitude` in the floating point.
  uint64 internal constant PRECISION = 1e18;

  /// @dev The half precision of the `magnitude` in the floating point.
  uint64 internal constant HALF_PRECISION = 1e9;

  /// @dev Encode `_epoch`, `_exponent` and `_magnitude` to the floating point.
  function encode(
    uint24 _epoch,
    uint24 _exponent,
    uint64 _magnitude
  ) internal pure returns (uint112 prod) {
    assembly {
      prod := add(_magnitude, add(shl(64, _exponent), shl(88, _epoch)))
    }
  }

  /// @dev Return the epoch of the floating point.
  /// @param prod The current encoded floating point.
  function epoch(uint112 prod) internal pure returns (uint24 _epoch) {
    assembly {
      _epoch := shr(88, prod)
    }
  }

  /// @dev Return the exponent of the floating point.
  /// @param prod The current encoded floating point.
  function exponent(uint112 prod) internal pure returns (uint24 _exponent) {
    assembly {
      _exponent := and(shr(64, prod), 0xffffff)
    }
  }

  /// @dev Return the epoch and exponent of the floating point.
  /// @param prod The current encoded floating point.
  function epochAndExponent(uint112 prod) internal pure returns (uint48 _epochExponent) {
    assembly {
      _epochExponent := shr(64, prod)
    }
  }

  /// @dev Return the magnitude of the floating point.
  /// @param prod The current encoded floating point.
  function magnitude(uint112 prod) internal pure returns (uint64 _magnitude) {
    assembly {
      _magnitude := and(prod, 0xffffffffffffffff)
    }
  }

  /// @dev Multiply the floating point by a scalar no more than 1.0.
  ///
  /// Caller should make sure `scale` is always smaller than or equals to 1.0
  ///
  /// @param prod The current encoded floating point.
  /// @param scale The multiplier applied to the product, multiplied by 1e18.
  function mul(uint112 prod, uint64 scale) internal pure returns (uint112) {
    uint24 _epoch = epoch(prod);
    uint24 _exponent = exponent(prod);
    uint256 _magnitude = magnitude(prod);

    unchecked {
      if (scale == 0) {
        _epoch += 1;
        _exponent = 0;
        _magnitude = PRECISION;
      } else if ((uint256(scale) * _magnitude) / PRECISION < HALF_PRECISION) {
        _exponent += 1;
        _magnitude = (_magnitude * uint256(scale)) / HALF_PRECISION;
      } else {
        _magnitude = (_magnitude * uint256(scale)) / PRECISION;
      }
    }

    // it is safe to direct convert `_magnitude` to uint64.
    return encode(_epoch, _exponent, uint64(_magnitude));
  }
}
