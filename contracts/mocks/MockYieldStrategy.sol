// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "../clever/strategies/YieldStrategyBase.sol";

contract MockYieldStrategy is YieldStrategyBase {
  constructor(address _token, address _operator) YieldStrategyBase(_token, _token, _operator) {}

  function underlyingPrice() external view override returns (uint256) {
    return 10**18;
  }

  function totalUnderlyingToken() external view override returns (uint256) {
    return IERC20(underlyingToken).balanceOf(address(this));
  }

  function totalYieldToken() external view override returns (uint256) {
    return IERC20(underlyingToken).balanceOf(address(this));
  }

  function deposit(
    address,
    uint256 _amount,
    bool _isUnderlying
  ) external override onlyOperator returns (uint256 _yieldAmount) {
    _yieldAmount = _amount;
  }

  function withdraw(
    address _recipient,
    uint256 _amount,
    bool _asUnderlying
  ) external override onlyOperator returns (uint256 _returnAmount) {
    IERC20(underlyingToken).transfer(_recipient, _amount);
    _returnAmount = _amount;
  }

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
