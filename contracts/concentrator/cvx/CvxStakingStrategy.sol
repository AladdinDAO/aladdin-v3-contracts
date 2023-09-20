// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

import { IConcentratorStrategy } from "../interfaces/IConcentratorStrategy.sol";
import { ICvxRewardPool } from "../../interfaces/convex/ICvxRewardPool.sol";
import { IZap } from "../../interfaces/IZap.sol";

import { AutoCompoundingStrategyBase } from "../strategies/AutoCompoundingStrategyBase.sol";

contract CvxStakingStrategy is AutoCompoundingStrategyBase {
  using SafeERC20 for IERC20;

  /// @inheritdoc IConcentratorStrategy
  // solhint-disable const-name-snakecase
  string public constant override name = "CvxStaking";

  /// @dev The address of cvxCRV token.
  address private constant cvxCRV = 0x62B9c7356A2Dc64a1969e19C23e4f579F9810Aa7;

  /// @dev The address of CVX token.
  address private constant CVX = 0x4e3FBD56CD56c3e72c1403e103b45Db9da5B9D2B;

  /// @notice The address of CvxRewardPool contract.
  address public immutable staker;

  constructor(address _operator, address _staker) {
    staker = _staker;

    address[] memory _rewards = new address[](1);
    _rewards[0] = cvxCRV;

    _initialize(_operator, _rewards);

    IERC20(CVX).safeApprove(_staker, uint256(-1));
  }

  /// @inheritdoc IConcentratorStrategy
  function deposit(address, uint256 _amount) external override onlyOperator {
    if (_amount > 0) {
      ICvxRewardPool(staker).stake(_amount);
    }
  }

  /// @inheritdoc IConcentratorStrategy
  function withdraw(address _recipient, uint256 _amount) external override onlyOperator {
    if (_amount > 0) {
      ICvxRewardPool(staker).withdraw(_amount, false);
      IERC20(CVX).safeTransfer(_recipient, _amount);
    }
  }

  /// @inheritdoc IConcentratorStrategy
  function harvest(address _zapper, address _intermediate) external override onlyOperator returns (uint256 _harvested) {
    // 1. claim rewards from staking staker contract.
    address[] memory _rewards = rewards;
    uint256[] memory _amounts = new uint256[](rewards.length);
    for (uint256 i = 0; i < rewards.length; i++) {
      _amounts[i] = IERC20(_rewards[i]).balanceOf(address(this));
    }
    ICvxRewardPool(staker).getReward(false);
    for (uint256 i = 0; i < rewards.length; i++) {
      _amounts[i] = IERC20(_rewards[i]).balanceOf(address(this)) - _amounts[i];
    }

    // 2. zap all rewards to staking token.
    _harvested = _harvest(_zapper, _intermediate, CVX, _rewards, _amounts);

    // 3. deposit into convex
    if (_harvested > 0) {
      ICvxRewardPool(staker).stake(_harvested);
    }
  }
}
