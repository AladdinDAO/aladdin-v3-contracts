// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import "../../curve-wrapper/interfaces/ICrvDepositor.sol";
import "../../interfaces/ICurveFactoryPlainPool.sol";

import "../AladdinCompounderWithStrategy.sol";

contract CompounderForCLeverVeCRV is AladdinCompounderWithStrategy {
  using SafeERC20Upgradeable for IERC20Upgradeable;

  /*************
   * Constants *
   *************/

  /// @dev The address of CRV token.
  address private constant CRV = 0xD533a949740bb3306d119CC777fa900bA034cd52;

  /// @notice The address of cveCRV token.
  address public immutable cveCRV;

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

  constructor(address _cveCRV, address _depositor) {
    cveCRV = _cveCRV;
    depositor = _depositor;
  }

  function initialize(
    address _zap,
    address _strategy,
    string memory _name,
    string memory _symbol
  ) external initializer {
    AladdinCompounderWithStrategy._initialize(_zap, _strategy, _name, _symbol);
  }

  /*************************
   * Public View Functions *
   *************************/

  /// @inheritdoc IAladdinCompounder
  function asset() public view override returns (address) {
    return cveCRV;
  }

  /****************************
   * Public Mutated Functions *
   ****************************/

  function depositWithCRV(address _recipient, uint256 _amount) public nonReentrant returns (uint256) {
    _distributePendingReward();

    if (_amount == uint256(-1)) {
      _amount = IERC20Upgradeable(CRV).balanceOf(msg.sender);
    }
    IERC20Upgradeable(CRV).safeTransferFrom(msg.sender, address(this), _amount);

    address _strategy = strategy;
    _amount = _swapCRVToCveCRV(_amount, _strategy);
    IConcentratorStrategy(_strategy).deposit(_recipient, _amount);

    return _mintShares(_amount, _recipient);
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

  /**********************
   * Internal Functions *
   **********************/

  /// @inheritdoc AladdinCompounderWithStrategy
  function _intermediate() internal pure override returns (address) {
    return CRV;
  }

  /// @dev Internal function to swap CRV to cveCRV
  /// @param _amountIn The amount of CRV to swap.
  /// @param _recipient The address of recipient who will recieve the cveCRV.
  function _swapCRVToCveCRV(uint256 _amountIn, address _recipient) internal returns (uint256) {
    address _pool = pool;
    uint256 _amountOut;
    if (_pool != address(0)) {
      uint8 _indexCRV = indexCRV;
      _amountOut = ICurveFactoryPlainPool(_pool).get_dy(int128(_indexCRV), int128(1 - _indexCRV), _amountIn);
    }

    if (_amountOut > _amountIn) {
      uint8 _indexCRV = indexCRV;
      IERC20Upgradeable(CRV).safeApprove(_pool, 0);
      IERC20Upgradeable(CRV).safeApprove(_pool, _amountIn);
      // swap to cveCRV
      _amountOut = ICurveFactoryPlainPool(_pool).exchange(
        int128(_indexCRV),
        int128(1 - _indexCRV),
        _amountIn,
        0,
        _recipient
      );
    } else {
      // deposit to cveCRV
      ICrvDepositor(depositor).deposit(_amountIn, _recipient);
      _amountOut = _amountIn;
    }

    return _amountOut;
  }
}
