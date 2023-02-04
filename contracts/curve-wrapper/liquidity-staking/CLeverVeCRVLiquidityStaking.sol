// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import "@openzeppelin/contracts-upgradeable/proxy/Initializable.sol";

import "../interfaces/ICrvLockerLiquidityStaking.sol";
import "../interfaces/ICurveLockerProxy.sol";

import "./BaseLiquidityStaking.sol";
import "../../common/OptimizedERC20.sol";

contract CLeverVeCRVLiquidityStaking is
  Initializable,
  OptimizedERC20,
  BaseLiquidityStaking,
  ICrvLockerLiquidityStaking
{
  using SafeERC20Upgradeable for IERC20Upgradeable;

  /*************
   * Constants *
   *************/

  /// @dev The address of CRV token.
  address private constant CRV = 0xD533a949740bb3306d119CC777fa900bA034cd52;

  /// @notice The address of CurveLockerProxy contract.
  address public immutable proxy;

  /// @inheritdoc ILiquidityStaking
  address public immutable override stakingToken;

  /***************
   * Constructor *
   ***************/

  constructor(address _proxy, address _aldveCRV) {
    proxy = _proxy;
    stakingToken = _aldveCRV;
  }

  function initialize() external initializer {
    BaseLiquidityStaking._initialize();

    name = "Staked CLever veCRV";
    symbol = "stk-cveCRV";
  }

  /*************************
   * Public View Functions *
   *************************/

  /// @inheritdoc ILiquidityStaking
  function rewardToken() public pure override(BaseLiquidityStaking, ILiquidityStaking) returns (address) {
    return CRV;
  }

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @inheritdoc ILiquidityStaking
  function deposit(uint256 _amount, address _recipient) external override {
    if (_amount == uint256(-1)) {
      _amount = IERC20Upgradeable(stakingToken).balanceOf(msg.sender);
    }
    require(_amount > 0, "deposit zero amount");

    _checkpoint(msg.sender);

    IERC20Upgradeable(stakingToken).safeTransferFrom(msg.sender, address(this), _amount);

    _mint(_recipient, _amount);

    emit Deposit(msg.sender, _recipient, _amount);
  }

  /// @inheritdoc ILiquidityStaking
  function withdraw(
    uint256 _amount,
    address _recipient,
    bool _claimReward
  ) external override {
    if (_amount == uint256(-1)) {
      _amount = balanceOf[msg.sender];
    }
    require(_amount > 0, "withdraw zero amount");

    _checkpoint(msg.sender);

    _burn(msg.sender, _amount);

    IERC20Upgradeable(stakingToken).safeTransfer(_recipient, _amount);

    emit Withdraw(msg.sender, _recipient, _amount);

    if (_claimReward) {
      _claim(msg.sender, _recipient);
    }
  }

  /// @inheritdoc ICrvLockerLiquidityStaking
  function claimFees(address _distributor, address _token) external override onlyBooster returns (uint256) {
    return ICurveLockerProxy(proxy).claimFees(_distributor, _token, booster);
  }

  /**********************
   * Internal Functions *
   **********************/

  /// @inheritdoc OptimizedERC20
  function _beforeTokenTransfer(
    address _from,
    address _to,
    uint256
  ) internal override {
    // no need to checkpoint when burn/mint.
    if (_from != address(0) && _to != address(0)) {
      _checkpoint(_from);

      if (_from != _to) _checkpoint(_to);
    }
  }

  /// @inheritdoc BaseLiquidityStaking
  function _totalSupply() internal view override returns (uint256) {
    return totalSupply;
  }

  /// @inheritdoc BaseLiquidityStaking
  function _balanceOf(address _account) internal view override returns (uint256) {
    return balanceOf[_account];
  }
}
