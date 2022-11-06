// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import "./YieldStrategyBase.sol";

contract StakeDAOCRVStrategy is YieldStrategyBase {
  constructor(
    address _yieldToken,
    address _underlyingToken,
    address _operator
  ) YieldStrategyBase(_yieldToken, _underlyingToken, _operator) {}

  function underlyingPrice() external view override returns (uint256) {}

  function totalUnderlyingToken() external view override returns (uint256) {}

  function totalYieldToken() external view override returns (uint256) {}

  function deposit(
    address _recipient,
    uint256 _amount,
    bool _isUnderlying
  ) external override returns (uint256 _yieldAmount) {}

  function withdraw(
    address _recipient,
    uint256 _amount,
    bool _asUnderlying
  ) external override returns (uint256 _returnAmount) {}

  function harvest()
    external
    override
    returns (
      uint256 _underlyingAmount,
      address[] memory _rewardTokens,
      uint256[] memory _amounts
    )
  {}
}
