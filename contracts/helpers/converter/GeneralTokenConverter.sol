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
import { ICurveBasePool } from "../../interfaces/ICurveBasePool.sol";
import { ICurveYPoolSwap } from "../../interfaces/ICurveYPool.sol";
import { IUniswapV2Pair } from "../../interfaces/IUniswapV2Pair.sol";
import { IUniswapV3Pool } from "../../interfaces/IUniswapV3Pool.sol";
import { IUniswapV3Router } from "../../interfaces/IUniswapV3Router.sol";
import { IWETH } from "../../interfaces/IWETH.sol";

import { ConverterBase } from "./ConverterBase.sol";

// solhint-disable var-name-mixedcase
// solhint-disable not-rely-on-time

/// @title GeneralTokenConverter
/// @notice This implements token converting for `pool_type` from 0 to 14.
/// For other types, it will retrieve the implementation from
/// `ConverterRegistry` contract and delegate call.
contract GeneralTokenConverter is Ownable, ConverterBase, ITokenConverter {
  using SafeERC20 for IERC20;

  /*************
   * Constants *
   *************/

  /// @inheritdoc ITokenConverter
  address public immutable override registry;

  /// @dev The address of Balancer V2 Vault
  address private constant BALANCER_VAULT = 0xBA12222222228d8Ba445958a75a0704d566BF2C8;

  /// @dev The address of Uniswap V3 Router
  address private constant UNISWAP_V3_ROUTER = 0xE592427A0AEce92De3Edee1F18E0157C05861564;

  /*************
   * Variables *
   *************/

  uint256 public supportedPoolTypes;

  /***************
   * Constructor *
   ***************/

  constructor(address _registry) {
    registry = _registry;
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
  function queryConvert(uint256 _encoding, uint256 _amountIn) external view override returns (uint256 _amountOut) {
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
        abi.encodeWithSelector(ITokenConverter.convert.selector, _recipient, _encoding, _amountIn)
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

  /// @inheritdoc ITokenConverter
  function withdrawFund(address _token, address _recipient) external override {
    require(msg.sender == registry, "only registry");

    if (_token == address(0)) {
      (bool success, ) = _recipient.call{ value: address(this).balance }("");
      require(success, "withdraw ETH failed");
    } else {
      IERC20(_token).safeTransfer(_recipient, IERC20(_token).balanceOf(address(this)));
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
        _tokenIn = _tokens[(_encoding >> 162) & 3];
        _tokenIn = _tokens[(_encoding >> 164) & 3];
      } else if (_poolType == 3) {
        // BalancerV2
        bytes32 _poolId = IBalancerPool(_pool).getPoolId();
        (address[] memory _tokens, , ) = IBalancerVault(BALANCER_VAULT).getPoolTokens(_poolId);
        _tokenIn = _tokens[(_encoding >> 162) & 3];
        _tokenOut = _tokens[(_encoding >> 164) & 3];
      } else if (_poolType <= 8) {
        // Curve
        _tokenIn = _getCurveTokenByIndex(_poolType, (_encoding >> 162) & 3, _encoding);
        _tokenOut = _getCurveTokenByIndex(_poolType, (_encoding >> 164) & 3, _encoding);
      }
    } else if (_action == 1) {
      _tokenOut = _pool;
      if (4 <= _poolType && _poolType <= 8) {
        _pool = _getTokenMinter(_pool);
        _tokenIn = _getCurveTokenByIndex(_poolType, (_encoding >> 162) & 3, _encoding);
      } else if (_poolType == 9) {
        _tokenIn = IERC4626(_pool).asset();
      } else {
        _tokenOut = address(0);
      }
    } else if (_action == 2) {
      _tokenIn = _pool;
      if (4 <= _poolType && _poolType <= 8) {
        _pool = _getTokenMinter(_pool);
        _tokenOut = _getCurveTokenByIndex(_poolType, (_encoding >> 164) & 3, _encoding);
      } else if (_poolType == 9) {
        _tokenOut = IERC4626(_pool).asset();
      } else {
        _tokenIn = address(0);
      }
    }
  }

  /// @dev Internal function to return the minter for curve lp token.
  /// @param _token The address of token.
  /// @return _minter The address of minter for the token.
  function _getTokenMinter(address _token) internal view returns (address _minter) {
    // solhint-disable-next-line no-inline-assembly
    assembly {
      // keccack("minter()")
      mstore(0x00, 0x0754617200000000000000000000000000000000000000000000000000000000)
      let success := staticcall(gas(), _token, 0x00, 0x04, 0x00, 0x20)
      if success {
        _minter := mload(0x00)
      }
      if iszero(_minter) {
        _minter := _token
      }
    }
  }

  /// @dev Internal function to get the curve token by index.
  /// @param _poolType The pool type.
  /// @param _index The index of the token.
  /// @param _encoding The customized encoding of the route.
  /// @return _token The address of the token.
  function _getCurveTokenByIndex(
    uint256 _poolType,
    uint256 _index,
    uint256 _encoding
  ) internal view returns (address _token) {
    address _pool = address(_encoding & 1461501637330902918203684832716283019655932542975);

    if ((_poolType == 5 || _poolType == 6) && (((_encoding >> 166) & 1) == 1)) {
      _token = ICurveAPool(_pool).underlying_coins(_index);
    } else {
      try ICurveBasePool(_pool).coins(_index) returns (address result) {
        _token = result;
      } catch {
        _token = ICurveBasePool(_pool).coins(int128(_index));
      }
    }
  }

  /*************************************
   * Internal Functions for Token Swap *
   *************************************/

  function _querySwap(
    uint256 _poolType,
    uint256 _encoding,
    uint256 _amountIn
  ) internal view returns (uint256) {}

  function _swap(
    uint256 _poolType,
    uint256 _encoding,
    uint256 _amountIn,
    address _recipient
  ) internal returns (uint256 _amountOut) {
    (address _tokenIn, address _tokenOut) = _getTokenPair(_poolType, 0, _encoding);
    address _pool = address(_encoding & 1461501637330902918203684832716283019655932542975);

    if ((_poolType == 4 || _poolType == 8) && ((_encoding >> 166) & 1) == 1) {
      // tokenIn is (W)ETH and we are going to use ETH.
      _unwrapIfNeeded(_amountIn);
    } else {
      _wrapTokenIfNeeded(_tokenIn, _amountIn);
    }

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
      uint24 _fee = IUniswapV3Pool(_pool).fee();
      _approve(_tokenIn, UNISWAP_V3_ROUTER, _amountIn);
      IUniswapV3Router.ExactInputSingleParams memory _params = IUniswapV3Router.ExactInputSingleParams(
        _tokenIn,
        _tokenOut,
        _fee,
        _recipient,
        // solhint-disable-next-line not-rely-on-time
        block.timestamp + 1,
        _amountIn,
        1,
        0
      );
      return IUniswapV3Router(UNISWAP_V3_ROUTER).exactInputSingle(_params);
    } else if (_poolType == 2) {
      // BalancerV1
      _approve(_tokenIn, _pool, _amountIn);
      (_amountOut, ) = IBalancerV1Pool(_pool).swapExactAmountIn(_tokenIn, _amountIn, _tokenOut, 0, uint256(-1));
    } else if (_poolType == 3) {
      bytes32 _poolId = IBalancerPool(_pool).getPoolId();
      _wrapTokenIfNeeded(_tokenIn, _amountIn);
      _approve(_tokenIn, BALANCER_VAULT, _amountIn);
      _amountOut = IBalancerVault(BALANCER_VAULT).swap(
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
      uint256 indexIn = (_encoding >> 162) & 3;
      uint256 indexOut = (_encoding >> 164) & 3;
      _approve(_tokenIn, _pool, _amountIn);
      if (_poolType == 4) {
        ICurveBasePool(_pool).exchange(int128(indexIn), int128(indexOut), _amountIn, 0);
      } else if (_poolType == 5) {}
      _amountOut = IERC20(_tokenOut).balanceOf(address(this));
    } else {
      revert("invalid poolType");
    }
  }

  /*****************************************
   * Internal Functions for Token Wrapping *
   *****************************************/

  function _queryWrap(
    uint256 _poolType,
    uint256 _encoding,
    uint256 _amountIn
  ) internal view returns (uint256) {}

  function _wrap(
    uint256 _poolType,
    uint256 _encoding,
    uint256 _amountIn,
    address _recipient
  ) internal returns (uint256) {}

  /*******************************************
   * Internal Functions for Token Unwrapping *
   *******************************************/

  function _queryUnwrap(
    uint256 _poolType,
    uint256 _encoding,
    uint256 _amountIn
  ) internal view returns (uint256) {}

  function _unwrap(
    uint256 _poolType,
    uint256 _encoding,
    uint256 _amountIn,
    address _recipient
  ) internal returns (uint256) {}
}
