// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;
pragma abicoder v2;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

import "./ConcentratorStrategy.sol";
import "../../interfaces/concentrator/IAladdinCRVConvexVault.sol";
import "../../interfaces/concentrator/IAladdinCRV.sol";
import "../../interfaces/ICurveBasePool.sol";
import "../../interfaces/IZap.sol";

// solhint-disable reason-string

/// @title Concentrator Batch Strategy for CLever.
///
/// @dev This contract will wait the pending amount above threshold and do batch deposit.
contract ConcentratorBatchStrategy is Ownable, ConcentratorStrategy {
  using SafeERC20 for IERC20;

  uint256 public threshold;

  constructor(
    address _zap,
    address _vault,
    uint256 _pid,
    uint256 _percentage,
    uint256 _threshold,
    address _curvePool,
    address _token,
    address _underlyingToken,
    address _operator
  ) ConcentratorStrategy(_zap, _vault, _pid, _percentage, _curvePool, _token, _underlyingToken, _operator) {
    threshold = _threshold;
  }

  /// @inheritdoc ICLeverYieldStrategy
  function deposit(
    address,
    uint256 _amount,
    bool _isUnderlying
  ) external virtual override onlyOperator returns (uint256 _yieldAmount) {
    _yieldAmount = _zapBeforeDeposit(_amount, _isUnderlying);

    if (IERC20(yieldToken).balanceOf(address(this)) >= threshold) {
      IAladdinCRVConvexVault(vault).deposit(pid, IERC20(yieldToken).balanceOf(address(this)));
    }
  }

  /// @inheritdoc ICLeverYieldStrategy
  function withdraw(
    address _recipient,
    uint256 _amount,
    bool _asUnderlying
  ) external virtual override onlyOperator returns (uint256 _returnAmount) {
    uint256 _balance = IERC20(yieldToken).balanceOf(address(this));
    if (_balance < _amount) {
      uint256 _diff = _withdrawFromConcentrator(pid, _amount - _balance);
      // concentrator has withdraw fee, we need to fix the amount.
      _amount = _balance + _diff;
    }

    _returnAmount = _zapAfterWithdraw(_recipient, _amount, _asUnderlying);
  }

  function updateThreshold(uint256 _threshold) external onlyOwner {
    threshold = _threshold;
  }

  function _totalYieldToken() internal view virtual override returns (uint256) {
    return _totalYieldTokenInConcentrator(pid) + IERC20(yieldToken).balanceOf(address(this));
  }
}
