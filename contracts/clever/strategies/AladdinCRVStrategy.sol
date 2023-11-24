// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

import "./YieldStrategyBase.sol";
import "../../concentrator/interfaces/IAladdinCRV.sol";

// solhint-disable no-empty-blocks

/// @title AladdinCRV Strategy for CLever.
///
/// @notice In this strategy we use CRV as underlying token and aCRV as yield token.
///
/// @dev The real underlying token for aCRV is cvxCRV, but we treat 1 cvxCRV as 1 CRV since we trust the Convex Contract.
/// However, cvxCRV may not pegged with CRV in secondary market (Normally, 1 cvxCRV < 1CRV in Curve cvxCRV pool).
contract AladdinCRVStrategy is YieldStrategyBase {
  using SafeERC20 for IERC20;

  /// @dev The address of CRV on mainnet.
  address private constant CRV = 0xD533a949740bb3306d119CC777fa900bA034cd52;

  /// @dev The address of aCRV on mainnet.
  // solhint-disable-next-line const-name-snakecase
  address private constant aCRV = 0x2b95A1Dcc3D405535f9ed33c219ab38E8d7e0884;

  constructor(address _operator) YieldStrategyBase(aCRV, CRV, _operator) {
    // The aCRV is maintained by our team, it's safe to approve uint256.max.
    IERC20(CRV).safeApprove(aCRV, uint256(-1));
  }

  /// @inheritdoc ICLeverYieldStrategy
  function underlyingPrice() external view override returns (uint256) {
    uint256 _totalUnderlying = IAladdinCRV(aCRV).totalUnderlying();
    uint256 _totalSupply = IERC20(aCRV).totalSupply();
    return (_totalUnderlying * 1e18) / _totalSupply;
  }

  /// @inheritdoc ICLeverYieldStrategy
  function totalUnderlyingToken() external view override returns (uint256) {
    return IAladdinCRV(aCRV).balanceOfUnderlying(address(this));
  }

  /// @inheritdoc ICLeverYieldStrategy
  function totalYieldToken() external view override returns (uint256) {
    return IERC20(aCRV).balanceOf(address(this));
  }

  /// @inheritdoc ICLeverYieldStrategy
  function deposit(
    address,
    uint256 _amount,
    bool _isUnderlying
  ) external override onlyOperator returns (uint256 _yieldAmount) {
    if (_isUnderlying) {
      _yieldAmount = IAladdinCRV(aCRV).depositWithCRV(address(this), _amount);
    } else {
      _yieldAmount = _amount;
    }
  }

  /// @inheritdoc ICLeverYieldStrategy
  function withdraw(
    address _recipient,
    uint256 _amount,
    bool _asUnderlying
  ) external override onlyOperator returns (uint256 _returnAmount) {
    if (_asUnderlying) {
      _returnAmount = IAladdinCRV(aCRV).withdraw(_recipient, _amount, 0, IAladdinCRV.WithdrawOption.WithdrawAsCRV);
    } else {
      IERC20(aCRV).safeTransfer(_recipient, _amount);
      _returnAmount = _amount;
    }
  }

  /// @inheritdoc ICLeverYieldStrategy
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
