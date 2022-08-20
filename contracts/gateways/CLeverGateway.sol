// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

import "../clever/interfaces/IMetaCLever.sol";
import "../zap/TokenZapLogic.sol";
import "./ZapGatewayBase.sol";

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

contract CLeverGateway is ZapGatewayBase {
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
  function deposit(
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
}
