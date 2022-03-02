// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

import "../interfaces/IZap.sol";
import "../interfaces/IConvexCRVDepositor.sol";
import "../interfaces/ICurve3Pool.sol";
import "../interfaces/ICurveFactoryPool.sol";
import "../interfaces/ICurveTriCrypto.sol";
import "../interfaces/ICurveV2Pool.sol";

// solhint-disable reason-string
/// @dev This Zap Contract is for AladdinCRV Contract, can be called by delegatecall
contract AladdinCRVZap is IZap {
  using SafeERC20 for IERC20;

  // The address of cvxCRV token.
  address private constant CVXCRV = 0x62B9c7356A2Dc64a1969e19C23e4f579F9810Aa7;
  // The address of CRV token.
  address private constant CRV = 0xD533a949740bb3306d119CC777fa900bA034cd52;
  // The address of CVX token.
  address private constant CVX = 0x4e3FBD56CD56c3e72c1403e103b45Db9da5B9D2B;
  // The address of USDT token.
  address private constant USDT = 0xdAC17F958D2ee523a2206206994597C13D831ec7;
  // The address of 3CRV token.
  address private constant THREE_CRV = 0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490;

  // The address of Curve CRV/ETH Pool
  address private constant CURVE_CRV_ETH_POOL = 0x8301AE4fc9c624d1D396cbDAa1ed877821D7C511;
  // The address of Curve CVX/ETH Pool
  address private constant CURVE_CVX_ETH_POOL = 0xB576491F1E6e5E62f1d8F26062Ee822B40B0E0d4;
  // The address of Curve cvxCRV/CRV Pool
  address private constant CURVE_CVXCRV_CRV_POOL = 0x9D0464996170c6B9e75eED71c68B99dDEDf279e8;
  // The address of Curve DAI/USDC/USDT Pool
  address private constant TRI_POOL = 0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7;
  // The address of Curve tricrypto2 Pool USDT/WBTC/WETH
  address private constant TRICRYPTO_POOL = 0xD51a44d3FaE010294C616388b506AcdA1bfAAE46;

  // The address of Convex CRV => cvxCRV Contract.
  address private constant CRV_DEPOSITOR = 0x8014595F2AB54cD7c604B00E9fb932176fDc86Ae;

  /********************************** Mutated Functions **********************************/

  function zap(
    address _fromToken,
    uint256 _amountIn,
    address _toToken,
    uint256 _minOut
  ) external payable override returns (uint256) {
    if (_fromToken == THREE_CRV && _toToken == address(0)) {
      // 3CRV => USDT/USDT/DAI => ETH
      return _swap3CRVToETH(_amountIn, _minOut);
    } else if (_fromToken == CVX && _toToken == address(0)) {
      // CVX => ETH
      return _swapCVXToETH(_amountIn, _minOut);
    } else if (_fromToken == address(0) && _toToken == CRV) {
      // ETH => CRV
      return _swapETHToCRV(_amountIn, _minOut);
    } else if (_fromToken == CVXCRV && _toToken == CRV) {
      // cvxCRV => CRV
      return _swapCvxCRVToCRV(_amountIn, _minOut);
    } else if (_fromToken == CVXCRV && _toToken == CVX) {
      // cvxCRV => CVX
      return _swapCvxCRVToCVX(_amountIn, _minOut);
    } else if (_fromToken == CVXCRV && _toToken == address(0)) {
      // cvxCRV => ETH
      return _swapCvxCRVToETH(_amountIn, _minOut);
    } else if (_fromToken == CRV && _toToken == CVXCRV) {
      // CRV => CVXCRV
      return _swapCRVToCvxCRV(_amountIn, _minOut);
    } else {
      revert("AladdinCRVZap: token pair not supported");
    }
  }

  /********************************** Internal Functions **********************************/

  function _swap3CRVToETH(uint256 _amountIn, uint256 _minOut) internal returns (uint256) {
    // 3CRV => USDT => ETH
    uint256 _usdtAmount = ICurve3Pool(TRI_POOL).calc_withdraw_one_coin(_amountIn, 2);
    uint256 _ethAmount = ICurveTriCrypto(TRICRYPTO_POOL).get_dy(0, 2, _usdtAmount);
    require(_ethAmount >= _minOut, "AladdinCRVZap: insufficient output");

    _approve(THREE_CRV, TRI_POOL, _amountIn);
    uint256 _before = IERC20(USDT).balanceOf(address(this));
    ICurve3Pool(TRI_POOL).remove_liquidity_one_coin(_amountIn, 2, 0);
    _usdtAmount = IERC20(USDT).balanceOf(address(this)) - _before;

    _approve(USDT, TRICRYPTO_POOL, _usdtAmount);
    _before = address(this).balance;
    ICurveTriCrypto(TRICRYPTO_POOL).exchange(0, 2, _usdtAmount, 0, true);
    _ethAmount = address(this).balance - _before;
    return _ethAmount;
  }

  function _swapCVXToETH(uint256 _amountIn, uint256 _minOut) internal returns (uint256) {
    // CVX => ETH
    uint256 _ethAmount = ICurveV2Pool(CURVE_CVX_ETH_POOL).get_dy(1, 0, _amountIn);
    require(_ethAmount >= _minOut, "AladdinCRVZap: insufficient output");

    _approve(CVX, CURVE_CVX_ETH_POOL, _amountIn);
    _ethAmount = ICurveV2Pool(CURVE_CVX_ETH_POOL).exchange_underlying(1, 0, _amountIn, 0);
    return _ethAmount;
  }

  function _swapETHToCRV(uint256 _amountIn, uint256 _minOut) internal returns (uint256) {
    // ETH => CRV
    uint256 _crvAmount = ICurveV2Pool(CURVE_CRV_ETH_POOL).get_dy(0, 1, _amountIn);
    require(_crvAmount >= _minOut, "AladdinCRVZap: insufficient output");

    _crvAmount = ICurveV2Pool(CURVE_CRV_ETH_POOL).exchange_underlying{ value: _amountIn }(0, 1, _amountIn, 0);
    return _crvAmount;
  }

  function _swapCvxCRVToCRV(uint256 _amountIn, uint256 _minOut) internal returns (uint256) {
    // CVXCRV => CRV
    uint256 _crvAmount = ICurveFactoryPool(CURVE_CVXCRV_CRV_POOL).get_dy(1, 0, _amountIn);
    require(_crvAmount >= _minOut, "AladdinCRVZap: insufficient output");

    _approve(CVXCRV, CURVE_CVXCRV_CRV_POOL, _amountIn);
    _crvAmount = ICurveFactoryPool(CURVE_CVXCRV_CRV_POOL).exchange(1, 0, _amountIn, 0, address(this));
    return _crvAmount;
  }

  function _swapCvxCRVToCVX(uint256 _amountIn, uint256 _minOut) internal returns (uint256) {
    // CVXCRV => CRV => ETH => CVX
    uint256 _ethAmount = _swapCvxCRVToETH(_amountIn, 0);
    uint256 _cvxAmount = ICurveV2Pool(CURVE_CVX_ETH_POOL).get_dy(0, 1, _ethAmount);
    require(_cvxAmount >= _minOut, "AladdinCRVZap: insufficient output");

    _cvxAmount = ICurveV2Pool(CURVE_CVX_ETH_POOL).exchange_underlying{ value: _ethAmount }(0, 1, _ethAmount, 0);
    return _cvxAmount;
  }

  function _swapCvxCRVToETH(uint256 _amountIn, uint256 _minOut) internal returns (uint256) {
    // CVXCRV => CRV => ETH
    uint256 _crvAmount = _swapCvxCRVToCRV(_amountIn, 0);
    uint256 _ethAmount = ICurveV2Pool(CURVE_CRV_ETH_POOL).get_dy(1, 0, _crvAmount);
    require(_ethAmount >= _minOut, "AladdinCRVZap: insufficient output");

    _approve(CRV, CURVE_CRV_ETH_POOL, _crvAmount);
    _ethAmount = ICurveV2Pool(CURVE_CRV_ETH_POOL).exchange_underlying(1, 0, _crvAmount, 0);
    return _ethAmount;
  }

  function _swapCRVToCvxCRV(uint256 _amountIn, uint256 _minOut) internal returns (uint256) {
    // CRV swap to CVXCRV or stake to CVXCRV
    uint256 _amountOut = ICurveFactoryPool(CURVE_CVXCRV_CRV_POOL).get_dy(0, 1, _amountIn);
    bool useCurve = _amountOut > _amountIn;
    require(_amountOut >= _minOut || _amountIn >= _minOut, "AladdinCRVZap: insufficient output");

    if (useCurve) {
      _approve(CRV, CURVE_CVXCRV_CRV_POOL, _amountIn);
      _amountOut = ICurveFactoryPool(CURVE_CVXCRV_CRV_POOL).exchange(0, 1, _amountIn, 0, address(this));
    } else {
      _approve(CRV, CRV_DEPOSITOR, _amountIn);
      uint256 _lockIncentive = IConvexCRVDepositor(CRV_DEPOSITOR).lockIncentive();
      // if use `lock = false`, will possible take fee
      // if use `lock = true`, some incentive will be given
      _amountOut = IERC20(CVXCRV).balanceOf(address(this));
      if (_lockIncentive == 0) {
        // no lock incentive, use `lock = false`
        IConvexCRVDepositor(CRV_DEPOSITOR).deposit(_amountIn, false, address(0));
      } else {
        // no lock incentive, use `lock = true`
        IConvexCRVDepositor(CRV_DEPOSITOR).deposit(_amountIn, true, address(0));
      }
      _amountOut = IERC20(CVXCRV).balanceOf(address(this)) - _amountOut; // never overflow here
    }
    return _amountOut;
  }

  function _approve(
    address _token,
    address _spender,
    uint256 _amount
  ) internal {
    IERC20(_token).safeApprove(_spender, 0);
    IERC20(_token).safeApprove(_spender, _amount);
  }

  // solhint-disable-next-line no-empty-blocks
  receive() external payable {}
}
