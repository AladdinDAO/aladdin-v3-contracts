// SPDX-License-Identifier: MIT

pragma solidity =0.8.20;

import { IERC20 } from "@openzeppelin/contracts-v4/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts-v4/token/ERC20/utils/SafeERC20.sol";

import { IConcentratorStrategy } from "../../interfaces/concentrator/IConcentratorStrategy.sol";
import { ICvxCrvStakingWrapper } from "../../interfaces/ICvxCrvStakingWrapper.sol";
import { IZap } from "../../interfaces/IZap.sol";

import { ConcentratorStrategyBase } from "../strategies/ConcentratorStrategyBase.sol";

contract CvxCrvStakingWrapperStrategy is ConcentratorStrategyBase {
  using SafeERC20 for IERC20;

  /// @inheritdoc IConcentratorStrategy
  // solhint-disable const-name-snakecase
  string public constant override name = "CvxCrvStakingWrapper";

  /// @dev The address of cvxCRV token.
  address private constant cvxCRV = 0x62B9c7356A2Dc64a1969e19C23e4f579F9810Aa7;

  /// @dev The address of CRV token.
  address private constant CRV = 0xD533a949740bb3306d119CC777fa900bA034cd52;

  /// @dev The address of CVX token.
  address private constant CVX = 0x4e3FBD56CD56c3e72c1403e103b45Db9da5B9D2B;

  /// @dev The address of 3CRV token.
  address private constant THREE_CRV = 0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490;

  /// @notice The address of CvxCrvStakingWrapper contract.
  address public immutable wrapper;

  constructor(address _operator, address _wrapper) {
    wrapper = _wrapper;

    address[] memory _rewards = new address[](3);
    _rewards[0] = CRV;
    _rewards[1] = CVX;
    _rewards[2] = THREE_CRV;

    __ConcentratorStrategyBase_init(_operator, _rewards);

    IERC20(cvxCRV).safeApprove(_wrapper, type(uint256).max);
  }

  /// @inheritdoc IConcentratorStrategy
  function deposit(address, uint256 _amount) external override onlyOperator {
    ICvxCrvStakingWrapper(wrapper).stake(_amount, address(this));
  }

  /// @inheritdoc IConcentratorStrategy
  function withdraw(address _recipient, uint256 _amount) external override onlyOperator {
    ICvxCrvStakingWrapper(wrapper).withdraw(_amount);
    IERC20(cvxCRV).safeTransfer(_recipient, _amount);
  }

  /// @inheritdoc IConcentratorStrategy
  function harvest(address _zapper, address _intermediate) external override onlyOperator returns (uint256 _harvested) {
    // 0. sweep balances
    address[] memory _rewards = rewards;
    _sweepToken(_rewards);

    // 1. claim rewards from staking wrapper contract.
    ICvxCrvStakingWrapper(wrapper).getReward(address(this));
    uint256[] memory _amounts = new uint256[](rewards.length);
    for (uint256 i = 0; i < rewards.length; i++) {
      _amounts[i] = IERC20(_rewards[i]).balanceOf(address(this));
    }

    // 2. zap all rewards to intermediate token.
    for (uint256 i = 0; i < rewards.length; i++) {
      address _rewardToken = _rewards[i];
      uint256 _amount = _amounts[i];
      if (_rewardToken == _intermediate) {
        _harvested += _amount;
      } else if (_amount > 0) {
        IERC20(_rewardToken).safeTransfer(_zapper, _amount);
        _harvested += IZap(_zapper).zap(_rewardToken, _amount, _intermediate, 0);
      }
    }

    // 3. transfer intermediate token back to operator.
    _transferToken(_intermediate, _msgSender(), _harvested);
  }

  /// @notice Set the reward weight for 3CRV group.
  /// @dev The best weight can be computed as
  ///   S0 = sum_{u != me} bal[u] * (1 - w[u])
  ///   S1 = sum_{u != me} bal[u] * w[u]
  ///   R0 is the USD value of reward group 0, R1 is the USD value of reward group 1
  ///   We want to maximize
  ///               bal[me] * (1 - x)             bal[me] * x
  ///   f(x) = R0 * ---------------------- + R1 * ----------------, where 0 <= x <= 1
  ///               S0 + bal[me] * (1 - x)        S1 + bal[me] * x
  ///   The global optimal x* is the root of f'(x) = 0, which means x* is the root of
  ///     R1 * S1 * (S0 + bal[me] * (1 - x))^2 = R0 * S0 * (S1 + bal[me] * x)^2
  ///   Assume k = sqrt(R1 * S1 / R0 / S0),
  ///          k * (bal[me] + S0) - S1
  ///     x* = -----------------------
  ///             bal[me] * (1 + k)
  function setRewardWeight(uint256 _weight) external onlyOwner {
    ICvxCrvStakingWrapper(wrapper).setRewardWeight(_weight);
  }
}
