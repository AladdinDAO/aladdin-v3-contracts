// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

import { IUniswapV3Pool } from "../../interfaces/IUniswapV3Pool.sol";
import { ITokenConverter } from "./ITokenConverter.sol";

import { ConverterBase } from "./ConverterBase.sol";
import { GeneralTokenConverterStorage } from "./GeneralTokenConverterStorage.sol";

// solhint-disable const-name-snakecase
// solhint-disable no-empty-blocks

contract UniswapV3Converter is GeneralTokenConverterStorage {
  using SafeERC20 for IERC20;

  /*************
   * Constants *
   *************/

  /// @dev The minimum value that can be returned from #getSqrtRatioAtTick. Equivalent to getSqrtRatioAtTick(MIN_TICK)
  uint160 private constant MIN_SQRT_RATIO = 4295128739;

  /// @dev The maximum value that can be returned from #getSqrtRatioAtTick. Equivalent to getSqrtRatioAtTick(MAX_TICK)
  uint160 private constant MAX_SQRT_RATIO = 1461446703485210103287273052203988822378723970342;

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
    require(_poolType == 1, "unsupported poolType");
    uint256 _action = _getAction(_encoding);
    address _pool = _getPool(_encoding);

    if (_action == 0) {
      // UniswapV3
      _tokenIn = IUniswapV3Pool(_pool).token0();
      _tokenOut = IUniswapV3Pool(_pool).token1();
      uint256 zero_for_one = (_encoding >> 194) & 1;
      if (zero_for_one == 0) {
        (_tokenIn, _tokenOut) = (_tokenOut, _tokenIn);
      }
    } else {
      revert("unsupported action");
    }
  }

  /// @inheritdoc ITokenConverter
  function queryConvert(uint256 _encoding, uint256 _amountIn) external override returns (uint256 _amountOut) {
    (address _tokenIn, address _tokenOut) = getTokenPair(_encoding);
    address _pool = _getPool(_encoding);
    bool zeroForOne = _tokenIn < _tokenOut;
    context = 1;
    try
      IUniswapV3Pool(_pool).swap(
        address(this),
        zeroForOne,
        int256(_amountIn),
        (zeroForOne ? MIN_SQRT_RATIO + 1 : MAX_SQRT_RATIO - 1),
        new bytes(0)
      )
    {} catch (bytes memory reason) {
      _amountOut = abi.decode(reason, (uint256));
    }
    context = 0;
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
    (address _tokenIn, address _tokenOut) = getTokenPair(_encoding);
    address _pool = _getPool(_encoding);

    _wrapTokenIfNeeded(_tokenIn, _amountIn);

    bool zeroForOne = _tokenIn < _tokenOut;
    bytes memory _data = new bytes(32);
    assembly {
      mstore(add(_data, 0x20), _tokenIn)
    }
    context = uint256(_pool);
    (int256 amount0, int256 amount1) = IUniswapV3Pool(_pool).swap(
      _recipient,
      zeroForOne,
      int256(_amountIn),
      (zeroForOne ? MIN_SQRT_RATIO + 1 : MAX_SQRT_RATIO - 1),
      _data
    );
    context = 0;
    return zeroForOne ? uint256(-amount1) : uint256(-amount0);
  }
}
