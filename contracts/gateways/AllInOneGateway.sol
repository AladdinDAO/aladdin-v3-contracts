// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

import "../clever/interfaces/IMetaCLever.sol";
import "../concentrator/interfaces/IAladdinCRVConvexVault.sol";
import "../zap/TokenZapLogic.sol";
import "./ZapGatewayBase.sol";

interface IGauge {
  // solhint-disable-next-line func-name-mixedcase
  function lp_token() external view returns (address);

  function deposit(
    uint256 _value,
    address _recipient,
    // solhint-disable-next-line var-name-mixedcase
    bool _claim_rewards
  ) external;
}

interface IMetaCLeverDetailed is IMetaCLever {
  function yieldStrategies(uint256 _strategyIndex)
    external
    view
    returns (
      // Whether the strategy is active.
      bool isActive,
      // The address of yield strategy contract.
      address strategy,
      // The address of underlying token.
      address underlyingToken,
      // The address of yield token.
      address yieldToken,
      // The total share of yield token of this strategy.
      uint256 totalShare,
      // The total amount of active yield tokens in CLever.
      uint256 activeYieldTokenAmount,
      // The total amount of yield token could be harvested.
      uint256 harvestableYieldTokenAmount,
      // The expected amount of underlying token should be deposited to this strategy.
      uint256 expectedUnderlyingTokenAmount
    );
}

contract AllInOneGateway is ZapGatewayBase {
  using SafeERC20 for IERC20;

  constructor(address _logic) {
    logic = _logic;
  }

  /// @notice Deposit `_srcToken` into CLeverCRV with zapping to yield token first.
  /// @param _clever The address of MetaCLever.
  /// @param _srcToken The address of start token. Use zero address, if you want deposit with ETH.
  /// @param _amountIn The amount of `_srcToken` to deposit.
  /// @param _routes The routes used to do zap.
  /// @param _minShareOut The minimum amount of pool shares should receive.
  /// @return The amount of pool shares received.
  function depositCLever(
    address _clever,
    uint256 _strategyIndex,
    address _srcToken,
    uint256 _amountIn,
    address _dstToken,
    uint256[] calldata _routes,
    uint256 _minShareOut
  ) external payable returns (uint256) {
    require(_amountIn > 0, "deposit zero amount");
    bool _isUnderlying;
    {
      (, , address _underlyingToken, address _yieldToken, , , , ) = IMetaCLeverDetailed(_clever).yieldStrategies(
        _strategyIndex
      );
      if (_dstToken == _underlyingToken) _isUnderlying = true;
      else if (_dstToken == _yieldToken) _isUnderlying = false;
      else revert("invalid destination token");
    }

    // 1. transfer srcToken into this contract
    _amountIn = _transferTokenIn(_srcToken, _amountIn);

    // 2. zap srcToken to yieldToken
    uint256 _amountToken = _zap(_routes, _amountIn);
    require(IERC20(_dstToken).balanceOf(address(this)) >= _amountToken, "zap to dst token failed");

    // 3. deposit into Concentrator vault
    IERC20(_dstToken).safeApprove(_clever, 0);
    IERC20(_dstToken).safeApprove(_clever, _amountToken);
    uint256 _sharesOut = IMetaCLever(_clever).deposit(
      _strategyIndex,
      msg.sender,
      _amountToken,
      _minShareOut,
      _isUnderlying
    );

    require(_sharesOut >= _minShareOut, "insufficient share");
    return _sharesOut;
  }

  /// @notice Deposit `_srcToken` into Concentrator vault with zap.
  /// @param _vault The address of vault.
  /// @param _pid The pool id to deposit.
  /// @param _srcToken The address of start token. Use zero address, if you want deposit with ETH.
  /// @param _lpToken The address of lp token of corresponding pool.
  /// @param _amountIn The amount of `_srcToken` to deposit.
  /// @param _routes The routes used to do zap.
  /// @param _minShareOut The minimum amount of pool shares should receive.
  /// @return The amount of pool shares received.
  function depositConcentrator(
    address _vault,
    uint256 _pid,
    address _srcToken,
    address _lpToken,
    uint256 _amountIn,
    uint256[] calldata _routes,
    uint256 _minShareOut
  ) external payable returns (uint256) {
    require(_amountIn > 0, "deposit zero amount");

    // 1. transfer srcToken into this contract
    _amountIn = _transferTokenIn(_srcToken, _amountIn);

    // 2. zap srcToken to lp
    uint256 _amountLP = _zap(_routes, _amountIn);
    require(IERC20(_lpToken).balanceOf(address(this)) >= _amountLP, "zap to lp token failed");

    // 3. deposit into Concentrator vault
    IERC20(_lpToken).safeApprove(_vault, 0);
    IERC20(_lpToken).safeApprove(_vault, _amountLP);
    uint256 _sharesOut = IAladdinCRVConvexVault(_vault).deposit(_pid, msg.sender, _amountLP);

    require(_sharesOut >= _minShareOut, "insufficient share");
    return _sharesOut;
  }

  /// @notice Deposit `_srcToken` into Curve Gauge with zap.
  /// @param _gauge The address of gauge.
  /// @param _srcToken The address of start token. Use zero address, if you want deposit with ETH.
  /// @param _amountIn The amount of `_srcToken` to deposit.
  /// @param _routes The routes used to do zap.
  /// @param _minLPOut The minimum amount of lp token should receive.
  /// @return The amount of lp token received.
  function depositCurveGauge(
    address _gauge,
    address _srcToken,
    uint256 _amountIn,
    uint256[] calldata _routes,
    uint256 _minLPOut
  ) external payable returns (uint256) {
    require(_amountIn > 0, "deposit zero amount");

    // 1. transfer srcToken into this contract
    _amountIn = _transferTokenIn(_srcToken, _amountIn);

    // 2. zap srcToken to lp
    address _lpToken = IGauge(_gauge).lp_token();
    uint256 _amountLP = _zap(_routes, _amountIn);
    require(IERC20(_lpToken).balanceOf(address(this)) >= _amountLP, "zap to lp token failed");
    require(_amountLP >= _minLPOut, "insufficient share");

    // 3. deposit into Concentrator vault
    IERC20(_lpToken).safeApprove(_gauge, 0);
    IERC20(_lpToken).safeApprove(_gauge, _amountLP);
    IGauge(_gauge).deposit(_amountLP, msg.sender, false);
    return _amountLP;
  }

  /// @notice Deposit `_srcToken` into Compounder with zap.
  /// @param _compounder The address of Compounder.
  /// @param _srcToken The address of start token. Use zero address, if you want deposit with ETH.
  /// @param _amountIn The amount of `_srcToken` to deposit.
  /// @param _routes The routes used to do zap.
  /// @param _minShareOut The minimum amount of pool shares should receive.
  /// @return The amount of pool shares received.
  function depositCompounder(
    address _compounder,
    address _srcToken,
    uint256 _amountIn,
    uint256[] calldata _routes,
    uint256 _minShareOut
  ) external payable returns (uint256) {
    require(_amountIn > 0, "deposit zero amount");
    address _lpToken = IAladdinCompounder(_compounder).asset();

    // 1. transfer srcToken into this contract
    _amountIn = _transferTokenIn(_srcToken, _amountIn);

    // 2. zap srcToken to lp
    uint256 _amountLP = _zap(_routes, _amountIn);
    require(IERC20(_lpToken).balanceOf(address(this)) >= _amountLP, "zap to lp token failed");

    // 3. deposit into Concentrator vault
    IERC20(_lpToken).safeApprove(_compounder, 0);
    IERC20(_lpToken).safeApprove(_compounder, _amountLP);
    uint256 _sharesOut = IAladdinCompounder(_compounder).deposit(_amountLP, msg.sender);

    require(_sharesOut >= _minShareOut, "insufficient share");
    return _sharesOut;
  }

  /// @notice Withdraw asset from Compounder and zap to `_dstToken`.
  /// @param _compounder The address of Compounder.
  /// @param _dstToken The address of destination token. Use zero address, if you want withdraw as ETH.
  /// @param _sharesIn The amount of pool share to withdraw.
  /// @param _routes The routes used to do zap.
  /// @param _minAmountOut The minimum amount of assets should receive.
  /// @return The amount of assets received.
  function withdrawCompounder(
    address _compounder,
    address _dstToken,
    uint256 _sharesIn,
    uint256[] calldata _routes,
    uint256 _minAmountOut
  ) external returns (uint256) {
    if (_sharesIn == uint256(-1)) {
      _sharesIn = IERC20(_compounder).balanceOf(msg.sender);
    }

    require(_sharesIn > 0, "withdraw zero amount");

    // 1. withdraw from Compounder
    uint256 _amountLP = IAladdinCompounder(_compounder).redeem(_sharesIn, address(this), msg.sender);

    // 2. zap to dstToken
    uint256 _amountOut = _zap(_routes, _amountLP);
    require(_amountOut >= _minAmountOut, "insufficient output");

    // 3. transfer to caller.
    _transferTokenOut(_dstToken, _amountOut);

    return _amountOut;
  }
}
