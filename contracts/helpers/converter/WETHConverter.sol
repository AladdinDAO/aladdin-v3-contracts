// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import { Address } from "@openzeppelin/contracts/utils/Address.sol";

import { ITokenConverter } from "./ITokenConverter.sol";
import { ConverterBase } from "./ConverterBase.sol";

import { IWETH } from "../../interfaces/IWETH.sol";

// solhint-disable const-name-snakecase
// solhint-disable no-empty-blocks

contract WETHConverter is ConverterBase {
  /***************
   * Constructor *
   ***************/

  constructor(address _registry) ConverterBase(_registry) {}

  /*************************
   * Public View Functions *
   *************************/

  /// @inheritdoc ITokenConverter
  function getTokenPair(uint256 _encoding) public pure override returns (address _tokenIn, address _tokenOut) {
    uint256 _poolType = _encoding & 255;
    require(_poolType == 14, "unsupported poolType");
    uint256 _action = (_encoding >> 8) & 3;
    if (_action == 2) {
      // UniswapV3
      _tokenIn = WETH;
      _tokenOut = ETH;
    } else {
      revert("unsupported action");
    }
  }

  /// @inheritdoc ITokenConverter
  function queryConvert(uint256 _encoding, uint256 _amountIn) external pure override returns (uint256 _amountOut) {
    getTokenPair(_encoding);
    _amountOut = _amountIn;
  }

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @inheritdoc ITokenConverter
  function convert(
    uint256 _encoding,
    uint256 _amountIn,
    address _recipient
  ) external payable override returns (uint256 _amountOut) {
    getTokenPair(_encoding);
    if (address(this).balance < _amountIn) {
      IWETH(WETH).withdraw(_amountIn);
    }
    if (_recipient != address(this)) {
      Address.sendValue(payable(_recipient), _amountIn);
    }
    _amountOut = _amountIn;
  }
}
