// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { Ownable } from "@openzeppelin/contracts-v4/access/Ownable.sol";
import { SafeERC20 } from "@openzeppelin/contracts-v4/token/ERC20/utils/SafeERC20.sol";
import { IERC20 } from "@openzeppelin/contracts-v4/token/ERC20/IERC20.sol";

import { ITokenConverter } from "../../helpers/converter/ITokenConverter.sol";

abstract contract ConcentratorStashBase is Ownable {
  using SafeERC20 for IERC20;

  /// @dev The fee denominator used for rate calculation.
  uint256 internal constant FEE_PRECISION = 1e9;

  /// @dev Internal function to transfer token to converter.
  ///
  /// @param _token The address of token to transfer.
  /// @param _converter The address of converter to transfer.
  /// @return _amount The amount of tokens transfered to converter.
  function _transfer(address _token, address _converter) internal returns (uint256 _amount) {
    _amount = IERC20(_token).balanceOf(address(this));
    if (_amount > 0) {
      IERC20(_token).safeTransfer(_converter, _amount);
    }
  }

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
