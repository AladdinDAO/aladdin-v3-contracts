// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import { IERC20 } from "@openzeppelin/contracts-v4/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts-v4/token/ERC20/utils/SafeERC20.sol";

import { IConcentratorStrategy } from "../../interfaces/concentrator/IConcentratorStrategy.sol";
import { IConvexBasicRewards } from "../../interfaces/IConvexBasicRewards.sol";
import { IConvexBooster } from "../../interfaces/IConvexBooster.sol";
import { IZap } from "../../interfaces/IZap.sol";

import { AutoCompoundingStrategyBase } from "./AutoCompoundingStrategyBase.sol";

// solhint-disable no-empty-blocks

contract AutoCompoundingConvexCurveStrategy is AutoCompoundingStrategyBase {
  using SafeERC20 for IERC20;

  /// @inheritdoc IConcentratorStrategy
  // solhint-disable const-name-snakecase
  string public constant override name = "AutoCompoundingConvexCurve";

  /// @dev The address of Convex Booster.
  address private constant BOOSTER = 0xF403C135812408BFbE8713b5A23a04b3D48AAE31;

  /// @notice The pid of Convex reward pool.
  uint256 public pid;

  /// @notice The address of staking token.
  address public token;

  /// @notice The address of Convex rewards contract.
  address public rewarder;

  function initialize(
    address _operator,
    address _token,
    address _rewarder,
    address[] memory _rewards
  ) external initializer {
    __ConcentratorStrategyBase_init(_operator, _rewards);

    IERC20(_token).safeApprove(BOOSTER, type(uint256).max);

    pid = IConvexBasicRewards(_rewarder).pid();
    token = _token;
    rewarder = _rewarder;
  }

  /// @inheritdoc IConcentratorStrategy
  function deposit(address, uint256 _amount) external override onlyOperator {
    if (_amount > 0) {
      IConvexBooster(BOOSTER).deposit(pid, _amount, true);
    }
  }

  /// @inheritdoc IConcentratorStrategy
  function withdraw(address _recipient, uint256 _amount) external override onlyOperator {
    if (_amount > 0) {
      IConvexBasicRewards(rewarder).withdrawAndUnwrap(_amount, false);
      IERC20(token).safeTransfer(_recipient, _amount);
    }
  }

  /// @inheritdoc IConcentratorStrategy
  function harvest(address _zapper, address _intermediate) external override onlyOperator returns (uint256 _amount) {
    // 0. sweep balances
    address[] memory _rewards = rewards;
    _sweepToken(_rewards);

    // 1. claim rewards from Convex rewards contract.
    IConvexBasicRewards(rewarder).getReward();
    uint256[] memory _amounts = new uint256[](rewards.length);
    for (uint256 i = 0; i < rewards.length; i++) {
      _amounts[i] = IERC20(_rewards[i]).balanceOf(address(this));
    }

    // 2. zap all rewards to staking token.
    _amount = _harvest(_zapper, _intermediate, token, _rewards, _amounts);

    // 3. deposit into convex
    if (_amount > 0) {
      IConvexBooster(BOOSTER).deposit(pid, _amount, true);
    }
  }
}
