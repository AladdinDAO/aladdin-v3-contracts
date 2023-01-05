// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

import "../../curve-wrapper/interfaces/ICrvLockerLiquidityStaking.sol";
import "../../interfaces/IZap.sol";

import "./AutoCompoundingStrategyBase.sol";

// solhint-disable no-empty-blocks

contract AutoCompoundingAladdinVeCRVStrategy is AutoCompoundingStrategyBase {
  using SafeERC20 for IERC20;

  /*************
   * Constants *
   *************/

  /// @inheritdoc IConcentratorStrategy
  // solhint-disable const-name-snakecase
  string public constant override name = "AutoCompoundingAladdinVeCRV";

  /// @dev The address of CRV token.
  address private constant CRV = 0xD533a949740bb3306d119CC777fa900bA034cd52;

  /// @notice The address of aldveCRV token.
  address public immutable aldveCRV;

  /// @notice The address of AldVeCRVLiquidityStaking contract.
  address public immutable lockStaker;

  /*************
   * Variables *
   *************/

  /***************
   * Constructor *
   ***************/

  constructor(address _aldveCRV, address _lockStaker) {
    aldveCRV = _aldveCRV;
    lockStaker = _lockStaker;
  }

  function initialize(address _operator) external initializer {
    address[] memory _rewards = new address[](1);
    _rewards[0] = CRV;
    ConcentratorStrategyBase._initialize(_operator, _rewards);

    IERC20(aldveCRV).safeApprove(lockStaker, uint256(-1));
  }

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @inheritdoc IConcentratorStrategy
  function deposit(address, uint256 _amount) external override onlyOperator {
    if (_amount > 0) {
      ICrvLockerLiquidityStaking(lockStaker).deposit(_amount, address(this));
    }
  }

  /// @inheritdoc IConcentratorStrategy
  function withdraw(address _recipient, uint256 _amount) external override onlyOperator {
    if (_amount > 0) {
      ICrvLockerLiquidityStaking(lockStaker).withdraw(_amount, _recipient, false);
    }
  }

  /// @inheritdoc IConcentratorStrategy
  function harvest(address, address _intermediate) external override onlyOperator returns (uint256 _amount) {
    require(_intermediate == CRV, "intermediate not CRV");

    uint256 _amountCRV = IERC20(CRV).balanceOf(address(this));
    ICrvLockerLiquidityStaking(lockStaker).claim();
    _amountCRV = IERC20(CRV).balanceOf(address(this)) - _amountCRV;

    // swap or deposit to aldveCRV
    _amount = 0;
  }
}
