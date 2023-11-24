// SPDX-License-Identifier: MIT

pragma solidity =0.8.20;

import { IERC20 } from "@openzeppelin/contracts-v4/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts-v4/token/ERC20/utils/SafeERC20.sol";

import { IConcentratorStrategy } from "../../../interfaces/concentrator/IConcentratorStrategy.sol";
import { ICurveGauge } from "../../../interfaces/ICurveGauge.sol";
import { ICurveTokenMinter } from "../../../interfaces/ICurveTokenMinter.sol";
import { IZap } from "../../../interfaces/IZap.sol";
import { ICLeverAMOStrategy } from "../interfaces/ICLeverAMOStrategy.sol";

import { ConcentratorStrategyBase } from "../../strategies/ConcentratorStrategyBase.sol";

// solhint-disable no-empty-blocks
// solhint-disable reason-string

contract CLeverGaugeStrategy is ConcentratorStrategyBase, ICLeverAMOStrategy {
  using SafeERC20 for IERC20;

  /// @inheritdoc IConcentratorStrategy
  // solhint-disable const-name-snakecase
  string public constant override name = "CLeverGauge";

  /// @dev The address of CLEV token.
  address private constant CLEV = 0x72953a5C32413614d24C29c84a66AE4B59581Bbf;

  /// @dev The address of CRV minter.
  address private constant MINTER = 0x4aa2afd5616bEEC2321a9EfD7349400d4F18566A;

  /// @notice The address of staking token.
  address public token;

  /// @notice The address of Curve gauge contract.
  address public gauge;

  function initialize(
    address _operator,
    address _token,
    address _gauge,
    address[] memory _rewards
  ) external initializer {
    require(_rewards[0] == CLEV, "CLeverGaugeStrategy: first reward not CLEV");
    __ConcentratorStrategyBase_init(_operator, _rewards);

    IERC20(_token).safeApprove(_gauge, type(uint256).max);

    token = _token;
    gauge = _gauge;
  }

  /// @inheritdoc ICLeverAMOStrategy
  function strategyBalance() external view override returns (uint256) {
    return ICurveGauge(gauge).balanceOf(address(this));
  }

  /// @inheritdoc IConcentratorStrategy
  function updateRewards(address[] memory _rewards)
    public
    virtual
    override(IConcentratorStrategy, ConcentratorStrategyBase)
    onlyOperator
  {
    require(_rewards[0] == CLEV, "CLeverGaugeStrategy: first reward not CLEV");

    ConcentratorStrategyBase.updateRewards(_rewards);
  }

  /// @inheritdoc IConcentratorStrategy
  function deposit(address, uint256 _amount) external override onlyOperator {
    if (_amount > 0) {
      ICurveGauge(gauge).deposit(_amount);
    }
  }

  /// @inheritdoc IConcentratorStrategy
  function withdraw(address _recipient, uint256 _amount) external override onlyOperator {
    if (_amount > 0) {
      ICurveGauge(gauge).withdraw(_amount);
      IERC20(token).safeTransfer(_recipient, _amount);
    }
  }

  /// @inheritdoc IConcentratorStrategy
  function harvest(address _zapper, address _intermediate) external override onlyOperator returns (uint256 _harvested) {
    require(_intermediate != CLEV, "CLeverGaugeStrategy: intermediate is CLEV");

    // 1. claim rewards from Convex rewards contract.
    address[] memory _rewards = rewards;
    uint256[] memory _amounts = new uint256[](rewards.length);
    for (uint256 i = 0; i < rewards.length; i++) {
      _amounts[i] = IERC20(_rewards[i]).balanceOf(address(this));
    }
    address _gauge = gauge;
    ICurveTokenMinter(MINTER).mint(_gauge);
    // some gauge has no extra rewards
    try ICurveGauge(_gauge).claim_rewards() {} catch {}
    for (uint256 i = 0; i < rewards.length; i++) {
      _amounts[i] = IERC20(_rewards[i]).balanceOf(address(this)) - _amounts[i];
    }

    // 2. zap all rewards except CLEV to intermediate token.
    for (uint256 i = 1; i < rewards.length; i++) {
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
    if (_harvested > 0) {
      if (_intermediate == address(0)) {
        // solhint-disable-next-line avoid-low-level-calls
        (bool _success, ) = msg.sender.call{ value: _harvested }("");
        require(_success, "ConcentratorStrategy: transfer ETH failed");
      } else {
        IERC20(_intermediate).safeTransfer(msg.sender, _harvested);
      }
    }

    // 3. transfer CLEV token back to operator.
    if (_amounts[0] > 0) {
      IERC20(CLEV).safeTransfer(msg.sender, _amounts[0]);
    }
  }
}
