// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;
pragma abicoder v2;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

import { IConverterRegistry } from "./IConverterRegistry.sol";
import { ITokenConverter } from "./ITokenConverter.sol";

import { IERC4626 } from "../../common/ERC4626/IERC4626.sol";
import { IBalancerPool } from "../../interfaces/IBalancerPool.sol";
import { IBalancerV1Pool } from "../../interfaces/IBalancerV1Pool.sol";
import { IBalancerVault } from "../../interfaces/IBalancerVault.sol";
import { ICurveAPool } from "../../interfaces/ICurveAPool.sol";
import { ICurvePlainPool } from "../../interfaces/ICurvePlainPool.sol";
import { ICurveYPoolSwap, ICurveYPoolDeposit } from "../../interfaces/ICurveYPool.sol";
import { ICurveMetaPoolSwap } from "../../interfaces/ICurveMetaPool.sol";
import { ICurveCryptoPool } from "../../interfaces/ICurveCryptoPool.sol";
import { ICurveTriCryptoPool } from "../../interfaces/ICurveCryptoPool.sol";
import { IUniswapV2Pair } from "../../interfaces/IUniswapV2Pair.sol";
import { IUniswapV3Pool } from "../../interfaces/IUniswapV3Pool.sol";
import { IUniswapV3Router } from "../../interfaces/IUniswapV3Router.sol";
import { IUniswapV3Quoter } from "../../interfaces/IUniswapV3Quoter.sol";
import { IWETH } from "../../interfaces/IWETH.sol";

import { ConverterBase } from "./ConverterBase.sol";

// solhint-disable no-empty-blocks
// solhint-disable no-inline-assembly
// solhint-disable not-rely-on-time
// solhint-disable var-name-mixedcase

/// @title GeneralTokenConverter
/// @notice This implements token converting for `pool_type` from 0 to 9 (both inclusive).
/// For other types, it will retrieve the implementation from
/// `ConverterRegistry` contract and delegate call.
contract GeneralTokenConverter is Ownable, ConverterBase {
  using SafeERC20 for IERC20;

  /*************
   * Constants *
   *************/

  /// @dev The address of Balancer V2 Vault
  address private constant BALANCER_VAULT = 0xBA12222222228d8Ba445958a75a0704d566BF2C8;

  /// @dev The address of Uniswap V3 Router
  address private constant UNISWAP_V3_ROUTER = 0xE592427A0AEce92De3Edee1F18E0157C05861564;

  /// @dev The minimum value that can be returned from #getSqrtRatioAtTick. Equivalent to getSqrtRatioAtTick(MIN_TICK)
  uint160 private constant MIN_SQRT_RATIO = 4295128739;

  /// @dev The maximum value that can be returned from #getSqrtRatioAtTick. Equivalent to getSqrtRatioAtTick(MAX_TICK)
  uint160 private constant MAX_SQRT_RATIO = 1461446703485210103287273052203988822378723970342;

  /*************
   * Variables *
   *************/

  /// @notice The mask of supported pool types.
  /// @dev If the `i`-th bit is `1`, the `i`-th pool type is supported in this contract.
  uint256 public supportedPoolTypes;

  /// @notice Mapping from token address to token minter.
  /// @dev It is used to determine the pool address for lp token address.
  mapping(address => address) public tokenMinter;

  /// @dev Execution context used in fallback function.
  uint256 private context;

  /***************
   * Constructor *
   ***************/

  constructor(address _registry) ConverterBase(_registry) {
    supportedPoolTypes = 1023;

    // setup 3pool, compound, susd
    tokenMinter[0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490] = 0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7;
    tokenMinter[0x845838DF265Dcd2c412A1Dc9e959c7d08537f8a2] = 0xA2B47E3D5c44877cca798226B7B8118F9BFb7A56;
    tokenMinter[0xC25a3A3b969415c80451098fa907EC722572917F] = 0xA5407eAE9Ba41422680e2e00537571bcC53efBfD;
  }

  /*************************
   * Public View Functions *
   *************************/

  /// @inheritdoc ITokenConverter
  function getTokenPair(uint256 _route) external view override returns (address, address) {
    uint256 _poolType = _route & 255;
    uint256 _action = (_route >> 8) & 3;

    return _getTokenPair(_poolType, _action, _route >> 10);
  }

  /// @inheritdoc ITokenConverter
  function queryConvert(uint256 _encoding, uint256 _amountIn) external override returns (uint256 _amountOut) {
    uint256 _poolType = _encoding & 255;
    uint256 _action = (_encoding >> 8) & 3;

    if (((supportedPoolTypes >> _poolType) & 1) == 1) {
      _encoding = _encoding >> 10;
      if (_action == 0) _amountOut = _querySwap(_poolType, _encoding, _amountIn);
      else if (_action == 1) _amountOut = _queryWrap(_poolType, _encoding, _amountIn);
      else if (_action == 2) _amountOut = _queryUnwrap(_poolType, _encoding, _amountIn);
      else revert("invalid action");
    } else {
      address _converter = IConverterRegistry(registry).getConverter(_poolType);
      _amountOut = ITokenConverter(_converter).queryConvert(_encoding, _amountIn);
    }
  }

  /****************************
   * Public Mutated Functions *
   ****************************/

  // solhint-disable-next-line no-complex-fallback
  fallback() external payable {
    uint256 _context = context;
    if (address(_context) == _msgSender() || _context == 1) {
      // handle uniswap v3 swap callback or uniswap v3 quote callback
      // | 4 bytes |   32 bytes   |   32 bytes   |   32 bytes  |   32 bytes  | 32 bytes |
      // |   sig   | amount0Delta | amount1Delta | data.offset | data.length |  tokenIn |
      int256 amount0Delta;
      int256 amount1Delta;
      address tokenIn;
      assembly {
        amount0Delta := calldataload(4)
        amount1Delta := calldataload(36)
        tokenIn := calldataload(132)
      }
      (uint256 amountToPay, uint256 amountReceived) = amount0Delta > 0
        ? (uint256(amount0Delta), uint256(-amount1Delta))
        : (uint256(amount1Delta), uint256(-amount0Delta));
      if (_context == 1) {
        assembly {
          let ptr := mload(0x40)
          mstore(ptr, amountReceived)
          revert(ptr, 32)
        }
      } else {
        IERC20(tokenIn).safeTransfer(address(_context), amountToPay);
      }
    } else {
      revert("invalid call");
    }
  }

  /// @inheritdoc ITokenConverter
  function convert(
    uint256 _encoding,
    uint256 _amountIn,
    address _recipient
  ) external payable override returns (uint256 _amountOut) {
    uint256 _poolType = _encoding & 255;
    uint256 _action = (_encoding >> 8) & 3;

    if (((supportedPoolTypes >> _poolType) & 1) == 1) {
      _encoding = _encoding >> 10;
      if (_action == 0) _amountOut = _swap(_poolType, _encoding, _amountIn, _recipient);
      else if (_action == 1) _amountOut = _wrap(_poolType, _encoding, _amountIn, _recipient);
      else if (_action == 2) _amountOut = _unwrap(_poolType, _encoding, _amountIn, _recipient);
      else revert("invalid action");
    } else {
      address _converter = IConverterRegistry(registry).getConverter(_poolType);
      // solhint-disable-next-line avoid-low-level-calls
      (bool _success, bytes memory _result) = _converter.delegatecall(
        abi.encodeWithSelector(ITokenConverter.convert.selector, _encoding, _amountIn, _recipient)
      );
      // below lines will propagate inner error up
      if (!_success) {
        // solhint-disable-next-line no-inline-assembly
        assembly {
          let ptr := mload(0x40)
          let size := returndatasize()
          returndatacopy(ptr, 0, size)
          revert(ptr, size)
        }
      }
      _amountOut = abi.decode(_result, (uint256));
    }
  }

  /*******************************
   * Public Restricted Functions *
   *******************************/

  /// @notice Update the pool types supported by this contract by default.
  /// @param _supportedPoolTypes The mask of pool types supported.
  function updateSupportedPoolTypes(uint256 _supportedPoolTypes) external onlyOwner {
    supportedPoolTypes = _supportedPoolTypes;
  }

  /// @notice Update the token minter mapping.
  /// @param _tokens The address list of tokens to update.
  /// @param _minters The address list of corresponding minters.
  function updateTokenMinter(address[] memory _tokens, address[] memory _minters) external onlyOwner {
    for (uint256 i = 0; i < _tokens.length; i++) {
      tokenMinter[_tokens[i]] = _minters[i];
    }
  }

  /**********************
   * Internal Functions *
   **********************/

  /// @dev Internal function to find token pair based on route encoding.
  /// @param _poolType The type of the route.
  /// @param _action The action of the route.
  /// @param _encoding The customized encoding of the route.
  /// @return _tokenIn The address of input token.
  /// @return _tokenOut The address of output token.
  function _getTokenPair(
    uint256 _poolType,
    uint256 _action,
    uint256 _encoding
  ) internal view returns (address _tokenIn, address _tokenOut) {
    address _pool = address(_encoding & 1461501637330902918203684832716283019655932542975);

    if (_action == 0) {
      // swap
      if (_poolType <= 1) {
        // UniswapV2 or UniswapV3
        _tokenIn = IUniswapV2Pair(_pool).token0();
        _tokenOut = IUniswapV2Pair(_pool).token1();
        uint256 zero_for_one = (_encoding >> 184) & 1;
        if (zero_for_one == 0) {
          (_tokenIn, _tokenOut) = (_tokenOut, _tokenIn);
        }
      } else if (_poolType == 2) {
        // BalancerV1
        address[] memory _tokens = IBalancerV1Pool(_pool).getCurrentTokens();
        _tokenIn = _tokens[(_encoding >> 163) & 7];
        _tokenOut = _tokens[(_encoding >> 166) & 7];
      } else if (_poolType == 3) {
        // BalancerV2
        bytes32 _poolId = IBalancerPool(_pool).getPoolId();
        (address[] memory _tokens, , ) = IBalancerVault(BALANCER_VAULT).getPoolTokens(_poolId);
        _tokenIn = _tokens[(_encoding >> 163) & 7];
        _tokenOut = _tokens[(_encoding >> 166) & 7];
      } else if (_poolType <= 8) {
        // Curve
        _tokenIn = _getCurveTokenByIndex(_pool, _poolType, (_encoding >> 163) & 7, _encoding);
        _tokenOut = _getCurveTokenByIndex(_pool, _poolType, (_encoding >> 166) & 7, _encoding);
      }
    } else if (_action == 1) {
      _tokenOut = _pool;
      if (4 <= _poolType && _poolType <= 8) {
        if (_poolType == 6 && (((_encoding >> 169) & 1) == 1)) {
          _tokenOut = ICurveYPoolDeposit(_pool).token();
        } else {
          _pool = _getTokenMinter(_pool);
        }
        _tokenIn = _getCurveTokenByIndex(_pool, _poolType, (_encoding >> 163) & 7, _encoding);
      } else if (_poolType == 9) {
        _tokenIn = IERC4626(_pool).asset();
      } else {
        _tokenOut = address(0);
      }
    } else if (_action == 2) {
      _tokenIn = _pool;
      if (4 <= _poolType && _poolType <= 8) {
        if (_poolType == 6 && (((_encoding >> 169) & 1) == 1)) {
          _tokenIn = ICurveYPoolDeposit(_pool).token();
        } else {
          _pool = _getTokenMinter(_pool);
        }
        _tokenOut = _getCurveTokenByIndex(_pool, _poolType, (_encoding >> 166) & 7, _encoding);
      } else if (_poolType == 9) {
        _tokenOut = IERC4626(_pool).asset();
      } else {
        _tokenIn = address(0);
      }
    }
    if (_tokenIn == ETH) _tokenIn = WETH;
    if (_tokenOut == ETH) _tokenOut = WETH;
  }

  /// @dev Internal function to return the minter for curve lp token.
  /// @param _token The address of token.
  /// @return _minter The address of minter for the token.
  function _getTokenMinter(address _token) internal view returns (address _minter) {
    _minter = tokenMinter[_token];
    if (_minter == address(0)) {
      // solhint-disable-next-line no-inline-assembly
      assembly {
        // keccack("minter()")
        mstore(0x00, 0x0754617200000000000000000000000000000000000000000000000000000000)
        let success := staticcall(gas(), _token, 0x00, 0x04, 0x00, 0x20)
        if success {
          _minter := and(mload(0x00), 0xffffffffffffffffffffffffffffffffffffffff)
        }
        if iszero(_minter) {
          _minter := _token
        }
      }
    }
  }

  /// @dev Internal function to get the curve token by index.
  /// @param _poolType The pool type.
  /// @param _index The index of the token.
  /// @param _encoding The customized encoding of the route.
  /// @return _token The address of the token.
  function _getCurveTokenByIndex(
    address _pool,
    uint256 _poolType,
    uint256 _index,
    uint256 _encoding
  ) internal view returns (address _token) {
    if ((_poolType == 5 || _poolType == 6) && (((_encoding >> 169) & 1) == 1)) {
      if (_poolType == 5) {
        _token = ICurveAPool(_pool).underlying_coins(_index);
      } else {
        _token = ICurveYPoolSwap(_pool).underlying_coins(int128(_index));
      }
    } else {
      try ICurvePlainPool(_pool).coins(_index) returns (address result) {
        _token = result;
      } catch {
        _token = ICurvePlainPool(_pool).coins(int128(_index));
      }
    }
  }

  /*************************************
   * Internal Functions for Token Swap *
   *************************************/

  /// @dev Query the amount of output token by swapping.
  /// @param _poolType The pool type.
  /// @param _encoding The customized encoding of the route.
  /// @param _amountIn The amount of input token.
  /// @return _amountOut The amount of output token.
  function _querySwap(
    uint256 _poolType,
    uint256 _encoding,
    uint256 _amountIn
  ) internal returns (uint256 _amountOut) {
    (address _tokenIn, address _tokenOut) = _getTokenPair(_poolType, 0, _encoding);
    address _pool = address(_encoding & 1461501637330902918203684832716283019655932542975);
    if (_poolType == 0) {
      if (((_encoding >> 185) & 1) == 1) {
        IUniswapV2Pair(_pool).executeVirtualOrders(block.timestamp);
      }
      uint256 zero_for_one = (_encoding >> 184) & 1;
      (uint256 rIn, uint256 rOut, ) = IUniswapV2Pair(_pool).getReserves();
      if (zero_for_one == 0) {
        (rIn, rOut) = (rOut, rIn);
      }
      // We won't handle fee on transfer token here.
      _amountOut = _amountIn * ((_encoding >> 160) & 16777215);
      _amountOut = (_amountOut * rOut) / (rIn * 1000000 + _amountOut);
    } else if (_poolType == 1) {
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
    } else if (_poolType == 2) {
      _amountOut = IBalancerV1Pool(_pool).calcOutGivenIn(
        IBalancerV1Pool(_pool).getBalance(_tokenIn),
        IBalancerV1Pool(_pool).getDenormalizedWeight(_tokenIn),
        IBalancerV1Pool(_pool).getBalance(_tokenOut),
        IBalancerV1Pool(_pool).getDenormalizedWeight(_tokenOut),
        _amountIn,
        IBalancerV1Pool(_pool).getSwapFee()
      );
    } else if (_poolType == 3) {
      address[] memory _assets = new address[](2);
      _assets[0] = _tokenIn;
      _assets[1] = _tokenOut;
      IBalancerVault.BatchSwapStep[] memory _swaps = new IBalancerVault.BatchSwapStep[](1);
      _swaps[0] = IBalancerVault.BatchSwapStep({
        poolId: IBalancerPool(_pool).getPoolId(),
        assetInIndex: 0,
        assetOutIndex: 1,
        amount: _amountIn,
        userData: new bytes(0)
      });
      int256[] memory _deltas = IBalancerVault(BALANCER_VAULT).queryBatchSwap(
        IBalancerVault.SwapKind.GIVEN_IN,
        _swaps,
        _assets,
        IBalancerVault.FundManagement({
          sender: address(this),
          fromInternalBalance: false,
          recipient: payable(address(this)),
          toInternalBalance: false
        })
      );
      _amountOut = uint256(-_deltas[1]);
    } else if (_poolType <= 8) {
      uint256 indexIn = (_encoding >> 163) & 7;
      uint256 indexOut = (_encoding >> 166) & 7;
      if (_poolType == 8) {
        _amountOut = ICurveCryptoPool(_pool).get_dy(indexIn, indexOut, _amountIn);
      } else if (_poolType == 5 && ((_encoding >> 169) & 1) == 1) {
        _amountOut = ICurveAPool(_pool).get_dy_underlying(int128(indexIn), int128(indexOut), _amountIn);
      } else if (_poolType == 6 && ((_encoding >> 169) & 1) == 1) {
        _pool = ICurveYPoolDeposit(_pool).curve();
        _amountOut = ICurveYPoolSwap(_pool).get_dy_underlying(int128(indexIn), int128(indexOut), _amountIn);
      } else {
        _amountOut = ICurvePlainPool(_pool).get_dy(int128(indexIn), int128(indexOut), _amountIn);
      }
    }
  }

  /// @dev Swap from one token to another token.
  /// @param _poolType The pool type.
  /// @param _encoding The customized encoding of the route.
  /// @param _amountIn The amount of input token.
  /// @param _recipient The address of output token receiver.
  /// @return _amountOut The amount of output token.
  function _swap(
    uint256 _poolType,
    uint256 _encoding,
    uint256 _amountIn,
    address _recipient
  ) internal returns (uint256 _amountOut) {
    (address _tokenIn, address _tokenOut) = _getTokenPair(_poolType, 0, _encoding);
    address _pool = address(_encoding & 1461501637330902918203684832716283019655932542975);

    if ((_poolType == 4 || _poolType == 8) && ((_encoding >> 169) & 1) == 1) {
      // tokenIn is (W)ETH and we are going to use ETH.
      _unwrapIfNeeded(_amountIn);
    } else {
      _wrapTokenIfNeeded(_tokenIn, _amountIn);
    }

    uint256 _balanceBefore = IERC20(_tokenOut).balanceOf(address(this));
    if (_poolType == 0) {
      // Uniswap V2
      if (((_encoding >> 185) & 1) == 1) {
        IUniswapV2Pair(_pool).executeVirtualOrders(block.timestamp);
      }
      uint256 zero_for_one = (_encoding >> 184) & 1;
      (uint256 rIn, uint256 rOut, ) = IUniswapV2Pair(_pool).getReserves();
      if (zero_for_one == 0) {
        (rIn, rOut) = (rOut, rIn);
      }

      // We won't handle fee on transfer token here.
      _amountOut = _amountIn * ((_encoding >> 160) & 16777215);
      _amountOut = (_amountOut * rOut) / (rIn * 1000000 + _amountOut);

      IERC20(_tokenIn).safeTransfer(_pool, _amountIn);
      if (zero_for_one == 1) {
        IUniswapV2Pair(_pool).swap(0, _amountOut, _recipient, new bytes(0));
      } else {
        IUniswapV2Pair(_pool).swap(_amountOut, 0, _recipient, new bytes(0));
      }
      return _amountOut;
    } else if (_poolType == 1) {
      // UniswapV3
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
      return zeroForOne ? uint256(-amount1) : uint256(amount0);
    } else if (_poolType == 2) {
      // BalancerV1
      _approve(_tokenIn, _pool, _amountIn);
      (_amountOut, ) = IBalancerV1Pool(_pool).swapExactAmountIn(_tokenIn, _amountIn, _tokenOut, 0, uint256(-1));
    } else if (_poolType == 3) {
      bytes32 _poolId = IBalancerPool(_pool).getPoolId();
      _wrapTokenIfNeeded(_tokenIn, _amountIn);
      _approve(_tokenIn, BALANCER_VAULT, _amountIn);
      return
        IBalancerVault(BALANCER_VAULT).swap(
          IBalancerVault.SingleSwap({
            poolId: _poolId,
            kind: IBalancerVault.SwapKind.GIVEN_IN,
            assetIn: _tokenIn,
            assetOut: _tokenOut,
            amount: _amountIn,
            userData: new bytes(0)
          }),
          IBalancerVault.FundManagement({
            sender: address(this),
            fromInternalBalance: false,
            recipient: payable(_recipient),
            toInternalBalance: false
          }),
          0,
          // solhint-disable-next-line not-rely-on-time
          block.timestamp
        );
    } else if (_poolType <= 8) {
      uint256 indexIn = (_encoding >> 163) & 7;
      uint256 indexOut = (_encoding >> 166) & 7;
      _approve(_tokenIn, _pool, _amountIn);
      if (_poolType == 4) {
        if (((_encoding >> 169) & 1) == 0) {
          _approve(_tokenIn, _pool, _amountIn);
          ICurvePlainPool(_pool).exchange(int128(indexIn), int128(indexOut), _amountIn, 0);
        } else {
          ICurvePlainPool(_pool).exchange{ value: _amountIn }(int128(indexIn), int128(indexOut), _amountIn, 0);
        }
      } else if (_poolType == 5) {
        _approve(_tokenIn, _pool, _amountIn);
        if (((_encoding >> 169) & 1) == 0) {
          ICurveAPool(_pool).exchange(int128(indexIn), int128(indexOut), _amountIn, 0);
        } else {
          ICurveAPool(_pool).exchange_underlying(int128(indexIn), int128(indexOut), _amountIn, 0);
        }
      } else if (_poolType == 6) {
        if (((_encoding >> 169) & 1) == 1) {
          _pool = ICurveYPoolDeposit(_pool).curve();
        }
        _approve(_tokenIn, _pool, _amountIn);
        if (((_encoding >> 169) & 1) == 0) {
          ICurveYPoolSwap(_pool).exchange(int128(indexIn), int128(indexOut), _amountIn, 0);
        } else {
          ICurveYPoolSwap(_pool).exchange_underlying(int128(indexIn), int128(indexOut), _amountIn, 0);
        }
      } else if (_poolType == 7) {
        _approve(_tokenIn, _pool, _amountIn);
        ICurveMetaPoolSwap(_pool).exchange(int128(indexIn), int128(indexOut), _amountIn, 0);
      } else if (_poolType == 8) {
        if (((_encoding >> 169) & 1) == 0) {
          _approve(_tokenIn, _pool, _amountIn);
          ICurveCryptoPool(_pool).exchange(indexIn, indexOut, _amountIn, 0);
        } else {
          ICurveCryptoPool(_pool).exchange{ value: _amountIn }(indexIn, indexOut, _amountIn, 0, true);
        }
      }
    } else {
      revert("invalid poolType");
    }

    if (_tokenOut == WETH) {
      _wrapTokenIfNeeded(_tokenOut, address(this).balance);
    }
    if (_amountOut == 0) {
      _amountOut = IERC20(_tokenOut).balanceOf(address(this)) - _balanceBefore;
    }
    if (_recipient != address(this)) {
      IERC20(_tokenOut).safeTransfer(_recipient, _amountOut);
    }
  }

  /*****************************************
   * Internal Functions for Token Wrapping *
   *****************************************/

  /// @dev Query the amount of output token by wrapping.
  /// @param _poolType The pool type.
  /// @param _encoding The customized encoding of the route.
  /// @param _amountIn The amount of input token.
  /// @return _amountOut The amount of output token.
  function _queryWrap(
    uint256 _poolType,
    uint256 _encoding,
    uint256 _amountIn
  ) internal view returns (uint256 _amountOut) {
    address _pool = address(_encoding & 1461501637330902918203684832716283019655932542975);
    if (4 <= _poolType && _poolType <= 8) {
      uint256 _tokens = ((_encoding >> 160) & 7) + 1;
      uint256 _indexIn = (_encoding >> 166) & 7;
      require(2 <= _tokens && _tokens <= 4, "invalid tokens");

      // compute actual token amount and actual pool
      if (_poolType == 6 && ((_encoding >> 169) & 1) == 1) {
        address _token = ICurveYPoolDeposit(_pool).coins(int128(_indexIn));
        address _underlying = ICurveYPoolDeposit(_pool).underlying_coins(int128(_indexIn));
        if (_token != _underlying) {
          assembly {
            // keccack("exchangeRateStored()")
            mstore(0x00, 0x182df0f500000000000000000000000000000000000000000000000000000000)
            let success := staticcall(gas(), _token, 0x00, 0x04, 0x00, 0x20)
            if success {
              _amountIn := div(mul(_amountIn, 1000000000000000000), mload(0x00))
            }
          }
        }
        _pool = ICurveYPoolDeposit(_pool).curve();
      } else {
        _pool = _getTokenMinter(_pool);
      }

      if (_tokens == 2) {
        uint256[2] memory _amounts;
        _amounts[_indexIn] = _amountIn;
        // some old pools are using `calc_token_amount(uint256[2])`
        // we use `calc_token_amount(uint256[2],bool)` first and then try `calc_token_amount(uint256[2])`
        assembly {
          // keccack("calc_token_amount(uint256[2],bool)")
          let p := mload(0x40)
          mstore(p, 0xed8e84f300000000000000000000000000000000000000000000000000000000)
          switch _indexIn
          case 0 {
            mstore(add(p, 0x04), _amountIn)
            mstore(add(p, 0x24), 0)
          }
          default {
            mstore(add(p, 0x04), 0)
            mstore(add(p, 0x24), _amountIn)
          }
          mstore(add(p, 0x44), 1)
          mstore(0x00, 0)
          let success := staticcall(gas(), _pool, p, 0x64, 0x00, 0x20)
          if success {
            _amountOut := mload(0x00)
          }
        }
        if (_amountOut == 0) {
          _amountOut = ICurvePlainPool(_pool).calc_token_amount(_amounts);
        }
      } else if (_tokens == 3) {
        uint256[3] memory _amounts;
        _amounts[_indexIn] = _amountIn;
        _amountOut = ICurvePlainPool(_pool).calc_token_amount(_amounts, true);
      } else {
        uint256[4] memory _amounts;
        _amounts[_indexIn] = _amountIn;
        _amountOut = ICurvePlainPool(_pool).calc_token_amount(_amounts, true);
      }
    } else if (_poolType == 9) {
      _amountOut = IERC4626(_pool).previewDeposit(_amountIn);
    }
  }

  /// @dev Wrap from one token to another token.
  /// @param _poolType The pool type.
  /// @param _encoding The customized encoding of the route.
  /// @param _amountIn The amount of input token.
  /// @param _recipient The address of output token receiver.
  /// @return _amountOut The amount of output token.
  function _wrap(
    uint256 _poolType,
    uint256 _encoding,
    uint256 _amountIn,
    address _recipient
  ) internal returns (uint256 _amountOut) {
    (address _tokenIn, address _tokenOut) = _getTokenPair(_poolType, 1, _encoding);
    address _pool = address(_encoding & 1461501637330902918203684832716283019655932542975);

    if ((_poolType == 4 || _poolType == 8) && ((_encoding >> 169) & 1) == 1) {
      // tokenIn is (W)ETH and we are going to use ETH.
      _unwrapIfNeeded(_amountIn);
    } else {
      _wrapTokenIfNeeded(_tokenIn, _amountIn);
    }

    uint256 _balanceBefore = IERC20(_tokenOut).balanceOf(address(this));
    if (4 <= _poolType && _poolType <= 8) {
      _pool = _getTokenMinter(_pool);
      uint256 _tokens = ((_encoding >> 160) & 7) + 1;
      uint256 _indexIn = (_encoding >> 163) & 7;
      require(2 <= _tokens && _tokens <= 4, "invalid tokens");

      if (_poolType == 5) {
        bool _use_underlying = ((_encoding >> 169) & 1) == 1;
        _approve(_tokenIn, _pool, _amountIn);
        if (_tokens == 2) {
          uint256[2] memory _amounts;
          _amounts[_indexIn] = _amountIn;
          ICurveAPool(_pool).add_liquidity(_amounts, 0, _use_underlying);
        } else if (_tokens == 3) {
          uint256[3] memory _amounts;
          _amounts[_indexIn] = _amountIn;
          ICurveAPool(_pool).add_liquidity(_amounts, 0, _use_underlying);
        } else {
          uint256[4] memory _amounts;
          _amounts[_indexIn] = _amountIn;
          ICurveAPool(_pool).add_liquidity(_amounts, 0, _use_underlying);
        }
      } else {
        bool _use_eth = (_poolType == 4 || _poolType == 8) && (((_encoding >> 169) & 1) == 1);
        if (!_use_eth) {
          _approve(_tokenIn, _pool, _amountIn);
        }
        if (_tokens == 2) {
          uint256[2] memory _amounts;
          _amounts[_indexIn] = _amountIn;
          if (_use_eth) {
            if (_poolType == 8) {
              ICurveCryptoPool(_pool).add_liquidity{ value: _amountIn }(_amounts, 0, true);
            } else {
              ICurvePlainPool(_pool).add_liquidity{ value: _amountIn }(_amounts, 0);
            }
          } else {
            ICurvePlainPool(_pool).add_liquidity(_amounts, 0);
          }
        } else if (_tokens == 3) {
          uint256[3] memory _amounts;
          _amounts[_indexIn] = _amountIn;
          if (_use_eth) {
            if (_poolType == 8) {
              ICurveTriCryptoPool(_pool).add_liquidity{ value: _amountIn }(_amounts, 0, true);
            } else {
              ICurvePlainPool(_pool).add_liquidity{ value: _amountIn }(_amounts, 0);
            }
          } else {
            ICurvePlainPool(_pool).add_liquidity(_amounts, 0);
          }
        } else {
          uint256[4] memory _amounts;
          _amounts[_indexIn] = _amountIn;
          if (_use_eth) {
            ICurvePlainPool(_pool).add_liquidity{ value: _amountIn }(_amounts, 0);
          } else {
            ICurvePlainPool(_pool).add_liquidity(_amounts, 0);
          }
        }
      }
    } else if (_poolType == 9) {
      _approve(_tokenIn, _pool, _amountIn);
      _amountOut = IERC4626(_pool).deposit(_amountIn, _recipient);
      return _amountOut;
    } else {
      revert("invalid poolType");
    }

    _amountOut = IERC20(_tokenOut).balanceOf(address(this)) - _balanceBefore;
    if (_recipient != address(this)) {
      IERC20(_tokenOut).safeTransfer(_recipient, _amountOut);
    }
  }

  /*******************************************
   * Internal Functions for Token Unwrapping *
   *******************************************/

  /// @dev Query the amount of output token by unwrapping.
  /// @param _poolType The pool type.
  /// @param _encoding The customized encoding of the route.
  /// @param _amountIn The amount of input token.
  /// @return _amountOut The amount of output token.
  function _queryUnwrap(
    uint256 _poolType,
    uint256 _encoding,
    uint256 _amountIn
  ) internal view returns (uint256 _amountOut) {
    address _pool = address(_encoding & 1461501637330902918203684832716283019655932542975);

    if (4 <= _poolType && _poolType <= 8) {
      if (_poolType != 6) {
        _pool = _getTokenMinter(_pool);
      }
      uint256 _indexOut = (_encoding >> 166) & 7;
      if (_poolType == 8) {
        _amountOut = ICurveCryptoPool(_pool).calc_withdraw_one_coin(_amountIn, _indexOut);
      } else {
        _amountOut = ICurvePlainPool(_pool).calc_withdraw_one_coin(_amountIn, int128(_indexOut));
      }
    } else if (_poolType == 9) {
      _amountOut = IERC4626(_pool).previewRedeem(_amountIn);
    }
  }

  /// @dev Unwrap from one token to another token.
  /// @param _poolType The pool type.
  /// @param _encoding The customized encoding of the route.
  /// @param _amountIn The amount of input token.
  /// @param _recipient The address of output token receiver.
  /// @return _amountOut The amount of output token.
  function _unwrap(
    uint256 _poolType,
    uint256 _encoding,
    uint256 _amountIn,
    address _recipient
  ) internal returns (uint256 _amountOut) {
    (address _tokenIn, address _tokenOut) = _getTokenPair(_poolType, 2, _encoding);
    address _pool = address(_encoding & 1461501637330902918203684832716283019655932542975);

    uint256 _balanceBefore = IERC20(_tokenOut).balanceOf(address(this));
    if (4 <= _poolType && _poolType <= 8) {
      if (_poolType != 6) {
        _pool = _getTokenMinter(_pool);
      }
      uint256 _tokens = ((_encoding >> 160) & 7) + 1;
      uint256 _indexOut = (_encoding >> 166) & 7;
      require(2 <= _tokens && _tokens <= 4, "invalid tokens");

      if (_poolType == 4) {
        ICurvePlainPool(_pool).remove_liquidity_one_coin(_amountIn, int128(_indexOut), 0);
      } else if (_poolType == 5) {
        bool _use_underlying = ((_encoding >> 169) & 1) == 1;
        ICurveAPool(_pool).remove_liquidity_one_coin(_amountIn, int128(_indexOut), 0, _use_underlying);
      } else if (_poolType == 6) {
        _approve(_tokenIn, _pool, _amountIn);
        ICurveYPoolDeposit(_pool).remove_liquidity_one_coin(_amountIn, int128(_indexOut), 0, true);
      } else if (_poolType == 7) {
        ICurveMetaPoolSwap(_pool).remove_liquidity_one_coin(_amountIn, int128(_indexOut), 0);
      } else {
        ICurveCryptoPool(_pool).remove_liquidity_one_coin(_amountIn, _indexOut, 0);
      }
    } else if (_poolType == 9) {
      _amountOut = IERC4626(_pool).redeem(_amountIn, _recipient, address(this));
      return _amountOut;
    } else {
      revert("invalid poolType");
    }

    if (_tokenOut == WETH) {
      _wrapTokenIfNeeded(_tokenOut, address(this).balance);
    }

    _amountOut = IERC20(_tokenOut).balanceOf(address(this)) - _balanceBefore;
    if (_recipient != address(this)) {
      IERC20(_tokenOut).safeTransfer(_recipient, _amountOut);
    }
  }
}
