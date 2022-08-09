// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "../clever/strategies/YieldStrategyBase.sol";
import "./MockYieldToken.sol";

contract MockYieldStrategyForCLever is YieldStrategyBase {
  address[] public extraRewardTokens;

  constructor(
    address _yieldToken,
    address _underlyingToken,
    address _operator,
    address[] memory _extraRewardTokens
  ) YieldStrategyBase(_yieldToken, _underlyingToken, _operator) {
    IERC20(_underlyingToken).approve(_yieldToken, uint256(-1));
    extraRewardTokens = _extraRewardTokens;
  }

  function underlyingPrice() external view override returns (uint256) {
    return (IERC20(underlyingToken).balanceOf(yieldToken) * 1e18) / IERC20(yieldToken).totalSupply();
  }

  function totalUnderlyingToken() external view override returns (uint256) {
    return
      (IERC20(underlyingToken).balanceOf(yieldToken) * IERC20(yieldToken).balanceOf(address(this))) /
      IERC20(yieldToken).totalSupply();
  }

  function totalYieldToken() external view override returns (uint256) {
    return IERC20(yieldToken).balanceOf(address(this));
  }

  function deposit(
    address,
    uint256 _amount,
    bool _isUnderlying
  ) external override onlyOperator returns (uint256 _yieldAmount) {
    if (_isUnderlying) {
      _yieldAmount = MockYieldToken(yieldToken).deposit(_amount);
    } else {
      _yieldAmount = _amount;
    }
  }

  function withdraw(
    address _recipient,
    uint256 _amount,
    bool _asUnderlying
  ) external override onlyOperator returns (uint256 _returnAmount) {
    if (_asUnderlying) {
      _returnAmount = MockYieldToken(yieldToken).withdraw(_amount);
      IERC20(underlyingToken).transfer(_recipient, _returnAmount);
    } else {
      IERC20(yieldToken).transfer(_recipient, _amount);
      _returnAmount = _amount;
    }
  }

  function harvest()
    external
    virtual
    override
    onlyOperator
    returns (
      uint256 _underlyingAmount,
      address[] memory _rewardTokens,
      uint256[] memory _amounts
    )
  {
    _underlyingAmount = IERC20(underlyingToken).balanceOf(address(this));
    if (_underlyingAmount > 0) {
      IERC20(underlyingToken).transfer(msg.sender, _underlyingAmount);
    }

    _rewardTokens = extraRewardTokens;
    _amounts = new uint256[](_rewardTokens.length);
    for (uint256 i = 0; i < _rewardTokens.length; i++) {
      _amounts[i] = IERC20(_rewardTokens[i]).balanceOf(address(this));
      if (_amounts[i] > 0) {
        IERC20(_rewardTokens[i]).transfer(msg.sender, _amounts[i]);
      }
    }
  }
}
