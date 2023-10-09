// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;
pragma abicoder v2;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

import "../interfaces/IZap.sol";
import "../interfaces/IConvexCRVDepositor.sol";
import "../interfaces/ICurveBasePool.sol";
import "../interfaces/ICurveFactoryPlainPool.sol";
import "../interfaces/ICurveCryptoPool.sol";
import "../interfaces/IUniswapV2Pair.sol";
import "../interfaces/IUniswapV3Pool.sol";
import "../interfaces/IUniswapV3Router.sol";
import "../interfaces/IWETH.sol";

// solhint-disable reason-string

/// @dev This is a general zap contract for AladdinConvexVault,
///      everything will zip into ETH or CRV and send back to caller.
contract AladdinConvexVaultZap is Ownable, IZap {
  using SafeERC20 for IERC20;

  event UpdateRoute(address indexed _fromToken, address indexed _toToken, uint256[] route);

  // The address of CRV token.
  address private constant CRV = 0xD533a949740bb3306d119CC777fa900bA034cd52;
  // The address of WETH token.
  address private constant WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
  // The address of Uniswap V3 Router
  address private constant UNIV3_ROUTER = 0xE592427A0AEce92De3Edee1F18E0157C05861564;

  /// @dev This is the list of routes
  /// encoding for single route
  /// |   160 bits   |   4 bits  |  2 bits  |   2 bits  |
  /// | pool address | pool type | index in | index out |
  ///
  /// pool type:
  ///  0: Uniswap V2 like Pair, with fee 0.3%
  ///  1: Uniswap V3 Pair
  ///  2: Curve3Pool
  ///  3: CurveTriCrypto
  ///  4: CurveV2Pool
  ///  5: CurveFactoryPool
  mapping(address => mapping(address => uint256[])) public routes;

  /********************************** Mutated Functions **********************************/

  function zapWithRoutes(
    address _fromToken,
    uint256 _amountIn,
    address _toToken,
    uint256[] calldata _routes,
    uint256 _minOut
  ) external payable override returns (uint256) {}

  function zapFrom(
    address _fromToken,
    uint256 _amountIn,
    address _toToken,
    uint256 _minOut
  ) external payable override returns (uint256) {}

  function zap(
    address _fromToken,
    uint256 _amountIn,
    address _toToken,
    uint256 _minOut
  ) external payable override returns (uint256) {
    require(_toToken == WETH || _toToken == CRV, "AladdinConvexVaultZap: toToken unsupported");

    uint256[] memory _routes = routes[_fromToken][_toToken];
    require(_routes.length > 0, "AladdinConvexVaultZap: route unavailable");

    uint256 _amount = _amountIn;
    for (uint256 i = 0; i < _routes.length; i++) {
      _amount = _swap(_routes[i], _amount);
    }
    require(_amount >= _minOut, "AladdinConvexVaultZap: insufficient output");
    if (_toToken == WETH) {
      _unwrapIfNeeded(_amount);
      // solhint-disable-next-line avoid-low-level-calls
      (bool success, ) = msg.sender.call{ value: _amount }("");
      require(success, "AladdinConvexVaultZap: ETH transfer failed");
    } else {
      IERC20(CRV).safeTransfer(msg.sender, _amount);
    }
    return _amount;
  }

  /********************************** Restricted Functions **********************************/

  function updateRoute(
    address _fromToken,
    address _toToken,
    uint256[] memory route
  ) external onlyOwner {
    delete routes[_fromToken][_toToken];

    routes[_fromToken][_toToken] = route;

    emit UpdateRoute(_fromToken, _toToken, route);
  }

  /********************************** Internal Functions **********************************/
  function _swap(uint256 _route, uint256 _amountIn) internal returns (uint256) {
    address _pool = address(_route & uint256(1461501637330902918203684832716283019655932542975));
    uint256 _poolType = (_route >> 160) & 15;
    uint256 _indexIn = (_route >> 164) & 3;
    uint256 _indexOut = (_route >> 166) & 3;
    if (_poolType == 0) {
      return _swapUniswapV2Pair(_pool, _indexIn, _indexOut, _amountIn);
    } else if (_poolType == 1) {
      return _swapUniswapV3Pool(_pool, _indexIn, _indexOut, _amountIn);
    } else if (_poolType == 2) {
      return _swapCurve3Pool(_pool, _indexIn, _indexOut, _amountIn);
    } else if (_poolType == 3) {
      return _swapTriCryptoPool(_pool, _indexIn, _indexOut, _amountIn);
    } else if (_poolType == 4) {
      return _swapCurveV2Pool(_pool, _indexIn, _indexOut, _amountIn);
    } else if (_poolType == 5) {
      return _swapCurveFactoryPool(_pool, _indexIn, _indexOut, _amountIn);
    } else {
      revert("AladdinConvexVaultZap: invalid poolType");
    }
  }

  function _swapUniswapV2Pair(
    address _pool,
    uint256 _indexIn,
    uint256 _indexOut,
    uint256 _amountIn
  ) internal returns (uint256) {
    uint256 _rIn;
    uint256 _rOut;
    address _tokenIn;
    if (_indexIn < _indexOut) {
      (_rIn, _rOut, ) = IUniswapV2Pair(_pool).getReserves();
      _tokenIn = IUniswapV2Pair(_pool).token0();
    } else {
      (_rOut, _rIn, ) = IUniswapV2Pair(_pool).getReserves();
      _tokenIn = IUniswapV2Pair(_pool).token1();
    }
    // TODO: handle fee on transfer token
    uint256 _amountOut = _amountIn * 997;
    _amountOut = (_amountOut * _rOut) / (_rIn * 1000 + _amountOut);

    _wrapTokenIfNeeded(_tokenIn, _amountIn);
    IERC20(_tokenIn).safeTransfer(_pool, _amountIn);
    if (_indexIn < _indexOut) {
      IUniswapV2Pair(_pool).swap(0, _amountOut, address(this), new bytes(0));
    } else {
      IUniswapV2Pair(_pool).swap(_amountOut, 0, address(this), new bytes(0));
    }
    return _amountOut;
  }

  function _swapUniswapV3Pool(
    address _pool,
    uint256 _indexIn,
    uint256 _indexOut,
    uint256 _amountIn
  ) internal returns (uint256) {
    address _tokenIn;
    address _tokenOut;
    uint24 _fee = IUniswapV3Pool(_pool).fee();
    if (_indexIn < _indexOut) {
      _tokenIn = IUniswapV3Pool(_pool).token0();
      _tokenOut = IUniswapV3Pool(_pool).token1();
    } else {
      _tokenIn = IUniswapV3Pool(_pool).token1();
      _tokenOut = IUniswapV3Pool(_pool).token0();
    }
    _wrapTokenIfNeeded(_tokenIn, _amountIn);
    _approve(_tokenIn, UNIV3_ROUTER, _amountIn);
    IUniswapV3Router.ExactInputSingleParams memory _params = IUniswapV3Router.ExactInputSingleParams(
      _tokenIn,
      _tokenOut,
      _fee,
      address(this),
      // solhint-disable-next-line not-rely-on-time
      block.timestamp + 1,
      _amountIn,
      1,
      0
    );
    return IUniswapV3Router(UNIV3_ROUTER).exactInputSingle(_params);
  }

  function _swapCurve3Pool(
    address _pool,
    uint256 _indexIn,
    uint256 _indexOut,
    uint256 _amountIn
  ) internal returns (uint256) {
    address _tokenIn = ICurveBasePool(_pool).coins(_indexIn);
    address _tokenOut = ICurveBasePool(_pool).coins(_indexOut);

    _wrapTokenIfNeeded(_tokenIn, _amountIn);
    _approve(_tokenIn, _pool, _amountIn);

    uint256 _before = IERC20(_tokenOut).balanceOf(address(this));
    ICurveBasePool(_pool).exchange(int128(_indexIn), int128(_indexOut), _amountIn, 0);
    return IERC20(_tokenOut).balanceOf(address(this)) - _before;
  }

  function _swapTriCryptoPool(
    address _pool,
    uint256 _indexIn,
    uint256 _indexOut,
    uint256 _amountIn
  ) internal returns (uint256) {
    address _tokenIn = ICurveTriCryptoPool(_pool).coins(_indexIn);
    address _tokenOut = ICurveTriCryptoPool(_pool).coins(_indexOut);

    _wrapTokenIfNeeded(_tokenIn, _amountIn);
    _approve(_tokenIn, _pool, _amountIn);

    uint256 _before = IERC20(_tokenOut).balanceOf(address(this));
    ICurveTriCryptoPool(_pool).exchange(_indexIn, _indexOut, _amountIn, 0, false);
    return IERC20(_tokenOut).balanceOf(address(this)) - _before;
  }

  function _swapCurveV2Pool(
    address _pool,
    uint256 _indexIn,
    uint256 _indexOut,
    uint256 _amountIn
  ) internal returns (uint256) {
    address _tokenIn = ICurveCryptoPool(_pool).coins(_indexIn);
    address _tokenOut = ICurveCryptoPool(_pool).coins(_indexOut);

    _wrapTokenIfNeeded(_tokenIn, _amountIn);
    _approve(_tokenIn, _pool, _amountIn);

    uint256 _before = IERC20(_tokenOut).balanceOf(address(this));
    ICurveCryptoPool(_pool).exchange(_indexIn, _indexOut, _amountIn, 0);
    return IERC20(_tokenOut).balanceOf(address(this)) - _before;
  }

  function _swapCurveFactoryPool(
    address _pool,
    uint256 _indexIn,
    uint256 _indexOut,
    uint256 _amountIn
  ) internal returns (uint256) {
    address _tokenIn = ICurveFactoryPlainPool(_pool).coins(_indexIn);

    _wrapTokenIfNeeded(_tokenIn, _amountIn);
    _approve(_tokenIn, _pool, _amountIn);

    return ICurveFactoryPlainPool(_pool).exchange(int128(_indexIn), int128(_indexOut), _amountIn, 0, address(this));
  }

  function _wrapTokenIfNeeded(address _token, uint256 _amount) internal {
    if (_token == WETH && IERC20(_token).balanceOf(address(this)) < _amount) {
      IWETH(WETH).deposit{ value: _amount }();
    }
  }

  function _unwrapIfNeeded(uint256 _amount) internal {
    if (address(this).balance < _amount) {
      IWETH(WETH).withdraw(_amount);
    }
  }

  function _approve(
    address _token,
    address _spender,
    uint256 _amount
  ) internal {
    if (IERC20(_token).allowance(address(this), _spender) < _amount) {
      IERC20(_token).safeApprove(_spender, 0);
      IERC20(_token).safeApprove(_spender, _amount);
    }
  }

  // solhint-disable-next-line no-empty-blocks
  receive() external payable {}
}
