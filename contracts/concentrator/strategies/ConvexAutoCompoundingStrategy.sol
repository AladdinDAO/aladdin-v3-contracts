// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

import "../../interfaces/IConvexBasicRewards.sol";
import "../../interfaces/IConvexBooster.sol";
import "../../interfaces/IZap.sol";

import "./ConcentratorStrategyBase.sol";

// solhint-disable no-empty-blocks

contract ConvexAutoCompoundingStrategy is ConcentratorStrategyBase {
  using SafeERC20 for IERC20;

  /// @dev The address of Convex Booster.
  address private constant BOOSTER = 0xF403C135812408BFbE8713b5A23a04b3D48AAE31;

  /// @notice The pid of Convex reward pool.
  uint256 public pid;

  /// @notice The address of staking token.
  address public token;

  /// @notice The address of Convex rewards contract.
  address public rewarder;

  // fallback function to receive eth.
  receive() external payable {}

  function initialize(
    address _operator,
    address _rewarder,
    address[] memory _rewards
  ) external initializer {
    ConcentratorStrategyBase._initialize(_operator, _rewards);

    address _token = IConvexBasicRewards(_rewarder).stakingToken();
    IERC20(_token).safeApprove(BOOSTER, uint256(-1));

    pid = IConvexBasicRewards(_rewarder).pid();
    token = _token;
    rewarder = _rewarder;
  }

  /// @inheritdoc IConcentratorStrategy
  function deposit(address, uint256 _amount) external override onlyOperator {
    IConvexBooster(BOOSTER).deposit(pid, _amount, true);
  }

  /// @inheritdoc IConcentratorStrategy
  function withdraw(address _recipient, uint256 _amount) external override onlyOperator {
    IConvexBasicRewards(rewarder).withdrawAndUnwrap(_amount, false);
    IERC20(token).safeTransfer(_recipient, _amount);
  }

  /// @inheritdoc IConcentratorStrategy
  function harvest(address _zapper, address _intermediate) external override onlyOperator returns (uint256 _amount) {
    // 1. claim rewards from Convex rewards contract.
    address[] memory _rewards = rewards;
    uint256[] memory _balances = new uint256[](rewards.length);
    for (uint256 i = 0; i < rewards.length; i++) {
      _balances[i] = IERC20(_rewards[i]).balanceOf(address(this));
    }
    IConvexBasicRewards(rewarder).getReward();

    // 2. zap all rewards to intermediate token.
    for (uint256 i = 0; i < rewards.length; i++) {
      address _rewardToken = _rewards[i]; // saving gas
      uint256 _pending = IERC20(_rewardToken).balanceOf(address(this)) - _balances[i];
      IERC20(_rewardToken).safeTransfer(_zapper, _pending);
      _amount += IZap(_zapper).zap(_rewardToken, _pending, _intermediate, 0);
    }

    // 3. add liquidity to staking token.
    address _token = token;
    if (_intermediate == address(0)) {
      _amount = IZap(_zapper).zap{ value: _amount }(_intermediate, _amount, _token, 0);
    } else {
      IERC20(_intermediate).safeTransfer(_zapper, _amount);
      _amount = IZap(_zapper).zap(_intermediate, _amount, _token, 0);
    }

    // 4. deposit into convex
    IConvexBooster(BOOSTER).deposit(pid, _amount, true);
  }
}
