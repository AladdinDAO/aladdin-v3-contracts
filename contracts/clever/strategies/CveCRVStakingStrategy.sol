// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

import "../../curve-wrapper/interfaces/ICrvLockerLiquidityStaking.sol";
import "../../curve-wrapper/interfaces/ICrvDepositor.sol";

import "./YieldStrategyBase.sol";

contract CveCRVStakingStrategy is YieldStrategyBase {
  using SafeERC20 for IERC20;

  /// @dev The address of CRV on mainnet.
  address private constant CRV = 0xD533a949740bb3306d119CC777fa900bA034cd52;

  /// @dev The address of CrvDepositor contract.
  address private immutable depositer;

  /// @dev The address of CLeverVeCRVLiquidityStaking contract.
  address private immutable staker;

  constructor(
    address _cveCRV,
    address _depositer,
    address _staker,
    address _operator
  ) YieldStrategyBase(_cveCRV, CRV, _operator) {
    IERC20(CRV).safeApprove(_depositer, uint256(-1));
    IERC20(_cveCRV).safeApprove(_staker, uint256(-1));

    staker = _staker;
    depositer = _depositer;
  }

  /// @inheritdoc IYieldStrategy
  function underlyingPrice() external pure override returns (uint256) {
    return 1e18;
  }

  /// @inheritdoc IYieldStrategy
  function totalUnderlyingToken() external view override returns (uint256) {
    return IERC20(staker).balanceOf(address(this));
  }

  /// @inheritdoc IYieldStrategy
  function totalYieldToken() external view override returns (uint256) {
    return IERC20(staker).balanceOf(address(this));
  }

  /// @inheritdoc IYieldStrategy
  function deposit(
    address,
    uint256 _amount,
    bool _isUnderlying
  ) external override onlyOperator returns (uint256 _yieldAmount) {
    if (_isUnderlying) {
      ICrvDepositor(depositer).deposit(_amount, address(this), staker);
    } else {
      ICrvLockerLiquidityStaking(staker).deposit(_amount, address(this));
    }
    _yieldAmount = _amount;
  }

  /// @inheritdoc IYieldStrategy
  function withdraw(
    address _recipient,
    uint256 _amount,
    bool _asUnderlying
  ) external override onlyOperator returns (uint256 _returnAmount) {
    require(!_asUnderlying, "unable to withdraw to CRV");
    ICrvLockerLiquidityStaking(staker).withdraw(_amount, _recipient, false);

    _returnAmount = _amount;
  }

  /// @inheritdoc IYieldStrategy
  function migrate(address _strategy) external virtual override onlyOperator returns (uint256 _yieldAmount) {
    _yieldAmount = IERC20(staker).balanceOf(address(this));
    ICrvLockerLiquidityStaking(staker).withdraw(_yieldAmount, _strategy, false);
  }

  /// @inheritdoc IYieldStrategy
  function onMigrateFinished(uint256 _yieldAmount) external virtual override onlyOperator {
    ICrvLockerLiquidityStaking(staker).deposit(_yieldAmount, address(this));
  }

  /// @inheritdoc IYieldStrategy
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
    uint256 _balance = IERC20(CRV).balanceOf(msg.sender);
    ICrvLockerLiquidityStaking(staker).claim(address(this), msg.sender);
    _underlyingAmount = IERC20(CRV).balanceOf(msg.sender) - _balance;

    _rewardTokens = new address[](0);
    _amounts = new uint256[](0);
  }
}
