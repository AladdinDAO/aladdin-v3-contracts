// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

import "../../curve-wrapper/interfaces/ICurveGaugeLiquidityStaking.sol";

import "./ManualCompoundingStrategyBase.sol";

// solhint-disable no-empty-blocks
// solhint-disable reason-string

contract ManualCompoundingAladdinCurveStrategy is ManualCompoundingStrategyBase {
  using SafeERC20 for IERC20;

  /*************
   * Constants *
   *************/

  /// @inheritdoc IConcentratorStrategy
  // solhint-disable const-name-snakecase
  string public constant override name = "ManualCompoundingAladdinCurve";

  /// @dev The address of CRV token.
  address private constant CRV = 0xD533a949740bb3306d119CC777fa900bA034cd52;

  /*************
   * Variables *
   *************/

  /// @notice The address of staking token.
  address public token;

  /// @notice The address of liquidity staking contract.
  address public staker;

  function initialize(
    address _operator,
    address _token,
    address _staker
  ) external initializer {
    address[] memory _rewards = new address[](1);
    _rewards[0] = CRV;

    ConcentratorStrategyBase._initialize(_operator, _rewards);

    IERC20(_token).safeApprove(_staker, uint256(-1));

    token = _token;
    staker = _staker;
  }

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @inheritdoc IConcentratorStrategy
  function deposit(address, uint256 _amount) external override onlyOperator {
    if (_amount > 0) {
      ICurveGaugeLiquidityStaking(staker).deposit(_amount, address(this));
    }
  }

  /// @inheritdoc IConcentratorStrategy
  function withdraw(address _recipient, uint256 _amount) external override onlyOperator {
    if (_amount > 0) {
      ICurveGaugeLiquidityStaking(staker).withdraw(_amount, _recipient, false);
    }
  }

  /// @inheritdoc IConcentratorStrategy
  function harvest(address, address _intermediate) external override onlyOperator returns (uint256 _amount) {
    require(_intermediate == CRV, "intermediate not CRV");

    _amount = IERC20(CRV).balanceOf(address(this));
    ICurveGaugeLiquidityStaking(staker).claim();
    _amount = IERC20(CRV).balanceOf(address(this)) - _amount;

    IERC20(CRV).safeTransfer(msg.sender, _amount);
  }
}
