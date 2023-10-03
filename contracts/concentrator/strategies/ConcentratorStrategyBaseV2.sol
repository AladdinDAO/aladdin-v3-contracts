// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { ITokenConverter } from "../../helpers/converter/ITokenConverter.sol";

import { ConcentratorStrategyBase } from "./ConcentratorStrategyBase.sol";

abstract contract ConcentratorStrategyBaseV2 is ConcentratorStrategyBase {
  /// @dev Internal function to convert tokens, assuming the token is already in converter.
  ///
  /// @param _converter The address of converter.
  /// @param _amountIn The amount of token to convert.
  /// @param _routes The list of route encodings used for converting.
  /// @param _receiver The address of recipient of the converted tokens.
  /// @return _amountOut The amount of tokens converted.
  function _convert(
    address _converter,
    uint256 _amountIn,
    uint256[] memory _routes,
    address _receiver
  ) internal returns (uint256 _amountOut) {
    _amountOut = _amountIn;

    unchecked {
      uint256 _length = _routes.length;
      if (_length > 0) {
        _length -= 1;
        for (uint256 i = 0; i < _length; i++) {
          _amountOut = ITokenConverter(_converter).convert(_routes[i], _amountOut, _converter);
        }
        _amountOut = ITokenConverter(_converter).convert(_routes[_length], _amountOut, _receiver);
      }
    }
  }
}
