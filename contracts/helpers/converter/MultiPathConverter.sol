// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

import { IWETH } from "../../interfaces/IWETH.sol";
import { ITokenConverter } from "./ITokenConverter.sol";

contract MultiPathConverter {
  using SafeERC20 for IERC20;

  /// @notice The address of GeneralTokenConverter contract.
  address public immutable converter;

  /// @dev The address of WETH token.
  address internal constant WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;

  constructor(address _converter) {
    converter = _converter;
  }

  function convert(
    address _tokenIn,
    uint256 _amount,
    uint256 _encoding,
    uint256[] memory _routes
  ) external payable {
    if (_tokenIn == address(0)) {
      IWETH(WETH).deposit{ value: _amount }();
      IERC20(WETH).safeTransfer(converter, _amount);
    } else {
      IERC20(_tokenIn).safeTransferFrom(msg.sender, converter, _amount);
    }

    uint256 _offset;
    for (uint256 i = 0; i < 8; i++) {
      uint256 _ratio = _encoding & 0xfffff;
      uint256 _length = (_encoding >> 20) & 0xfff;
      if (_ratio == 0) break;

      uint256 _amountIn = (_amount * _ratio) / 0xfffff;
      for (uint256 j = 0; j < _length; j++) {
        address _recipient = j < _length - 1 ? converter : msg.sender;
        _amountIn = ITokenConverter(converter).convert(_routes[_offset], _amountIn, _recipient);
        _offset += 1;
      }
      _encoding >>= 32;
    }
  }
}
