// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

import { ITokenConverter } from "./ITokenConverter.sol";

contract MultiPathConverter is Ownable {
  using SafeERC20 for IERC20;

  address public immutable converter;

  constructor(address _converter) {
    converter = _converter;
  }

  function convert(
    address _tokenIn,
    uint256 _amount,
    uint256 _encoding,
    uint256[] memory _routes
  ) external payable {
    if (_tokenIn != address(0)) {
      require(msg.value == 0, "nonzero msg.value");
      uint256 _balance = IERC20(_tokenIn).balanceOf(address(this));
      IERC20(_tokenIn).safeTransferFrom(msg.sender, address(this), _amount);
      _amount = IERC20(_tokenIn).balanceOf(address(this)) - _balance;
    } else {
      require(msg.value == _amount, "msg.value mismatch");
    }

    uint256 _offset;
    for (uint256 i = 0; i < 8; i++) {
      uint256 _ratio = _encoding & 0xfffff;
      uint256 _length = (_encoding >> 20) & 0xfff;
      if (_ratio == 0) break;

      uint256 _amountIn = (_amount * _ratio) >> 20;
      for (uint256 j = 0; j < _length; j++) {
        address _recipient = j < _length - 1 ? converter : msg.sender;
        _amountIn = ITokenConverter(converter).convert(_routes[_offset], _amountIn, _recipient);
        _offset += 1;
      }
    }
  }
}
