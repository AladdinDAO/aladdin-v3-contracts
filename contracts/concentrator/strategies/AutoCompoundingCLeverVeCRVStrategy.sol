// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

import "../../curve-wrapper/interfaces/ICrvDepositor.sol";
import "../../curve-wrapper/interfaces/ICrvLockerLiquidityStaking.sol";
import "../../interfaces/ICurveFactoryPlainPool.sol";
import "../../interfaces/IZap.sol";

import "./AutoCompoundingStrategyBase.sol";

// solhint-disable no-empty-blocks

contract AutoCompoundingCLeverVeCRVStrategy is AutoCompoundingStrategyBase, Ownable {
  using SafeERC20 for IERC20;

  /*************
   * Constants *
   *************/

  /// @inheritdoc IConcentratorStrategy
  // solhint-disable const-name-snakecase
  string public constant override name = "AutoCompoundingCLeverVeCRV";

  /// @dev The address of CRV token.
  address private constant CRV = 0xD533a949740bb3306d119CC777fa900bA034cd52;

  /// @notice The address of cveCRV token.
  address public immutable cveCRV;

  /// @notice The address of CLeverVeCRVLiquidityStaking contract.
  address public immutable staker;

  /// @notice The address of CrvDepositor contract.
  address public immutable depositor;

  /*************
   * Variables *
   *************/

  /// @notice The address of cveCRV/CRV pool.
  address public pool;

  /// @notice The token index of CRV.
  uint8 public indexCRV;

  /***************
   * Constructor *
   ***************/

  constructor(
    address _operator,
    address _cveCRV,
    address _staker,
    address _depositor
  ) {
    cveCRV = _cveCRV;
    staker = _staker;
    depositor = _depositor;

    address[] memory _rewards = new address[](1);
    _rewards[0] = CRV;
    ConcentratorStrategyBase._initialize(_operator, _rewards);

    IERC20(_cveCRV).safeApprove(_staker, uint256(-1));
    IERC20(CRV).safeApprove(_depositor, uint256(-1));
  }

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @inheritdoc IConcentratorStrategy
  function deposit(address, uint256 _amount) external override onlyOperator {
    if (_amount > 0) {
      ICrvLockerLiquidityStaking(staker).deposit(_amount, address(this));
    }
  }

  /// @inheritdoc IConcentratorStrategy
  function withdraw(address _recipient, uint256 _amount) external override onlyOperator {
    if (_amount > 0) {
      ICrvLockerLiquidityStaking(staker).withdraw(_amount, _recipient, false);
    }
  }

  /// @inheritdoc IConcentratorStrategy
  function harvest(address, address _intermediate) external override onlyOperator returns (uint256 _amount) {
    require(_intermediate == CRV, "intermediate not CRV");

    _amount = IERC20(CRV).balanceOf(address(this));
    ICrvLockerLiquidityStaking(staker).claim();
    _amount = IERC20(CRV).balanceOf(address(this)) - _amount;

    address _pool = pool;
    uint256 _swapAmountOut;
    if (_pool != address(0)) {
      uint8 _indexCRV = indexCRV;
      _swapAmountOut = ICurveFactoryPlainPool(_pool).get_dy(int128(_indexCRV), int128(1 - _indexCRV), _amount);
    }
    if (_swapAmountOut > _amount) {
      uint8 _indexCRV = indexCRV;
      // swap to cveCRV
      IERC20(CRV).safeApprove(_pool, 0);
      IERC20(CRV).safeApprove(_pool, _amount);
      _amount = ICurveFactoryPlainPool(_pool).exchange(
        int128(_indexCRV),
        int128(1 - _indexCRV),
        _amount,
        0,
        address(this)
      );
      // deposit
      ICrvLockerLiquidityStaking(staker).deposit(_amount, address(this));
    } else {
      // deposit to cveCRV
      ICrvDepositor(depositor).deposit(_amount, address(this), staker);
    }
  }

  /************************
   * Restricted Functions *
   ************************/

  /// @notice Update the address of cveCRV/CRV pool.
  /// @param _pool The address of cveCRV/CRV pool.
  function setPool(address _pool) external onlyOwner {
    uint8 _indexCRV = ICurveFactoryPlainPool(_pool).coins(0) == CRV ? 0 : 1;

    pool = _pool;
    indexCRV = _indexCRV;
  }
}
