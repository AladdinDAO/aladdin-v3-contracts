// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import { ICurveStableSwapMetaNG } from "../../interfaces/curve/ICurveStableSwapMetaNG.sol";
import { ICurveStableSwapNG } from "../../interfaces/curve/ICurveStableSwapNG.sol";
import { ITokenConverter } from "./ITokenConverter.sol";

import { ConverterBase } from "./ConverterBase.sol";

contract CurveNGConverter is ConverterBase {
  /***************
   * Constructor *
   ***************/

  constructor(address _registry) ConverterBase(_registry) {}

  /*************************
   * Public View Functions *
   *************************/

  /// @inheritdoc ITokenConverter
  function getTokenPair(uint256 _encoding) public view override returns (address _tokenIn, address _tokenOut) {
    uint256 _poolType = _getPoolType(_encoding);
    require(_poolType == 12 || _poolType == 13, "unsupported poolType");
    uint256 _action = _getAction(_encoding);
    address _pool = _getPool(_encoding);

    _encoding >>= 10;
    uint256 indexIn = (_encoding >> 163) & 7;
    uint256 indexOut = (_encoding >> 166) & 7;
    if (_action == 0) {
      _tokenIn = ICurveStableSwapNG(_pool).coins(indexIn);
      _tokenOut = ICurveStableSwapNG(_pool).coins(indexOut);
    } else if (_action == 1) {
      _tokenIn = ICurveStableSwapNG(_pool).coins(indexIn);
      _tokenOut = _pool;
    } else if (_action == 2) {
      _tokenIn = _pool;
      _tokenOut = ICurveStableSwapNG(_pool).coins(indexOut);
    } else {
      revert("unsupported action");
    }
  }

  /// @inheritdoc ITokenConverter
  function queryConvert(uint256 _encoding, uint256 _amountIn) external view override returns (uint256 _amountOut) {
    // to validate the encoding
    getTokenPair(_encoding);
    uint256 _poolType = _getPoolType(_encoding);
    uint256 _action = _getAction(_encoding);
    address _pool = _getPool(_encoding);

    _encoding >>= 10;
    uint256 _tokens = ((_encoding >> 160) & 7) + 1;
    uint256 indexIn = (_encoding >> 163) & 7;
    uint256 indexOut = (_encoding >> 166) & 7;
    if (_action == 0) {
      _amountOut = ICurveStableSwapNG(_pool).get_dy(int128(indexIn), int128(indexOut), _amountIn);
    } else if (_action == 1) {
      if (_poolType == 12) {
        uint256[] memory amounts = new uint256[](_tokens);
        amounts[indexIn] = _amountIn;
        _amountOut = ICurveStableSwapNG(_pool).calc_token_amount(amounts, true);
      } else {
        uint256[2] memory amounts;
        amounts[indexIn] = _amountIn;
        _amountOut = ICurveStableSwapMetaNG(_pool).calc_token_amount(amounts, true);
      }
    } else {
      _amountOut = ICurveStableSwapNG(_pool).calc_withdraw_one_coin(_amountIn, int128(indexOut));
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
    // this will also validate the encoding
    (address _tokenIn, ) = getTokenPair(_encoding);
    uint256 _poolType = _getPoolType(_encoding);
    uint256 _action = _getAction(_encoding);
    address _pool = _getPool(_encoding);

    // only swap and add liquidity need to wrap and approve
    if (_action < 2) {
      _wrapTokenIfNeeded(_tokenIn, _amountIn);
      _approve(_tokenIn, _pool, _amountIn);
    }

    _encoding >>= 10;
    uint256 _tokens = ((_encoding >> 160) & 7) + 1;
    uint256 indexIn = (_encoding >> 163) & 7;
    uint256 indexOut = (_encoding >> 166) & 7;
    if (_action == 0) {
      _amountOut = ICurveStableSwapNG(_pool).exchange(int128(indexIn), int128(indexOut), _amountIn, 0, _recipient);
    } else if (_action == 1) {
      if (_poolType == 12) {
        uint256[] memory amounts = new uint256[](_tokens);
        amounts[indexIn] = _amountIn;
        _amountOut = ICurveStableSwapNG(_pool).add_liquidity(amounts, 0, _recipient);
      } else {
        uint256[2] memory amounts;
        amounts[indexIn] = _amountIn;
        _amountOut = ICurveStableSwapMetaNG(_pool).add_liquidity(amounts, 0, _recipient);
      }
    } else {
      _amountOut = ICurveStableSwapNG(_pool).remove_liquidity_one_coin(_amountIn, int128(indexOut), 0, _recipient);
    }
  }
}
