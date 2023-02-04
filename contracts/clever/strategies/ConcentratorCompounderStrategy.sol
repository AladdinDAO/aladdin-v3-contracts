// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

import "../../concentrator/interfaces/IAladdinCompounder.sol";

import "./YieldStrategyBase.sol";

// solhint-disable no-empty-blocks

contract ConcentratorCompounderStrategy is YieldStrategyBase {
  using SafeERC20 for IERC20;

  constructor(
    address _underlying,
    address _compounder,
    address _operator
  ) YieldStrategyBase(_compounder, _underlying, _operator) {
    IERC20(_underlying).safeApprove(_compounder, uint256(-1));
  }

  /// @inheritdoc IYieldStrategy
  function underlyingPrice() external view override returns (uint256) {
    return (IAladdinCompounder(yieldToken).totalAssets() * 1e18) / IERC20(yieldToken).totalSupply();
  }

  /// @inheritdoc IYieldStrategy
  function totalUnderlyingToken() external view override returns (uint256) {
    uint256 _balance = IERC20(yieldToken).balanceOf(address(this));
    return IAladdinCompounder(yieldToken).convertToAssets(_balance);
  }

  /// @inheritdoc IYieldStrategy
  function totalYieldToken() external view override returns (uint256) {
    return IERC20(yieldToken).balanceOf(address(this));
  }

  /// @inheritdoc IYieldStrategy
  function deposit(
    address,
    uint256 _amount,
    bool _isUnderlying
  ) external override onlyOperator returns (uint256 _yieldAmount) {
    if (_isUnderlying) {
      _yieldAmount = IAladdinCompounder(yieldToken).deposit(_amount, address(this));
    } else {
      _yieldAmount = _amount;
    }
  }

  /// @inheritdoc IYieldStrategy
  function withdraw(
    address _recipient,
    uint256 _amount,
    bool _asUnderlying
  ) external override onlyOperator returns (uint256 _returnAmount) {
    if (_asUnderlying) {
      _returnAmount = IAladdinCompounder(yieldToken).redeem(_amount, _recipient, address(this));
    } else {
      IERC20(yieldToken).safeTransfer(_recipient, _amount);
      _returnAmount = _amount;
    }
  }

  /// @inheritdoc IYieldStrategy
  function harvest()
    external
    virtual
    override
    onlyOperator
    returns (
      uint256,
      address[] memory,
      uint256[] memory
    )
  {}
}
