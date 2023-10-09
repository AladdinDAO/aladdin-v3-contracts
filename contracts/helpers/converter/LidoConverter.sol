// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

import { ILidoStETH } from "../../interfaces/ILidoStETH.sol";
import { ILidoWstETH } from "../../interfaces/ILidoWstETH.sol";
import { ITokenConverter } from "./ITokenConverter.sol";

import { ConverterBase } from "./ConverterBase.sol";

// solhint-disable const-name-snakecase
// solhint-disable no-empty-blocks

contract LidoConverter is ConverterBase {
  using SafeERC20 for IERC20;

  /*************
   * Constants *
   *************/

  /// @dev The address of Lido's stETH token.
  address private constant stETH = 0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84;

  /// @dev The address of Lido's wstETH token.
  address private constant wstETH = 0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0;

  /***************
   * Constructor *
   ***************/

  constructor(address _registry) ConverterBase(_registry) {}

  /*************************
   * Public View Functions *
   *************************/

  /// @inheritdoc ITokenConverter
  function getTokenPair(uint256 _encoding) external pure override returns (address, address) {
    require(_getPoolType(_encoding) == 10, "unsupported poolType");
    uint256 _action = _getAction(_encoding);
    address _pool = address((_encoding >> 10) & 1461501637330902918203684832716283019655932542975);
    if (_pool == stETH) {
      if (_action == 1) return (WETH, stETH);
      else revert("unsupported action");
    } else if (_pool == wstETH) {
      if (_action == 1) return (stETH, wstETH);
      else if (_action == 2) return (wstETH, stETH);
      else revert("unsupported action");
    } else {
      revert("unsupported pool");
    }
  }

  /// @inheritdoc ITokenConverter
  function queryConvert(uint256 _encoding, uint256 _amountIn) external view override returns (uint256 _amountOut) {
    require(_getPoolType(_encoding) == 10, "unsupported poolType");
    uint256 _action = _getAction(_encoding);
    address _pool = address((_encoding >> 10) & 1461501637330902918203684832716283019655932542975);
    if (_pool == stETH) {
      if (_action == 1) _amountOut = _amountIn;
      else revert("unsupported action");
    } else if (_pool == wstETH) {
      if (_action == 1) _amountOut = ILidoWstETH(_pool).getWstETHByStETH(_amountIn);
      else if (_action == 2) _amountOut = ILidoWstETH(_pool).getStETHByWstETH(_amountIn);
      else revert("unsupported action");
    } else {
      revert("unsupported pool");
    }
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
    require(_getPoolType(_encoding) == 10, "unsupported poolType");
    uint256 _action = _getAction(_encoding);
    address _pool = address((_encoding >> 10) & 1461501637330902918203684832716283019655932542975);
    address _token = _pool;
    if (_pool == stETH) {
      if (_action == 1) {
        _unwrapIfNeeded(_amountIn);
        uint256 _shares = ILidoStETH(_pool).submit{ value: _amountIn }(address(0));
        _amountOut = ILidoStETH(_pool).getPooledEthByShares(_shares);
      } else {
        revert("unsupported action");
      }
    } else if (_pool == wstETH) {
      if (_action == 1) {
        _approve(stETH, _pool, _amountIn);
        _amountOut = ILidoWstETH(_pool).wrap(_amountIn);
      } else if (_action == 2) {
        _amountOut = ILidoWstETH(_pool).unwrap(_amountIn);
        _token = stETH;
      } else {
        revert("unsupported action");
      }
    } else {
      revert("unsupported pool");
    }

    if (_recipient != address(this)) {
      IERC20(_token).safeTransfer(_recipient, _amountOut);
    }
  }
}
