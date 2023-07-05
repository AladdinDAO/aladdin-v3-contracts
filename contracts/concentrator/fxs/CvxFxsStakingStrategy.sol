// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

import { IConcentratorStrategy } from "../interfaces/IConcentratorStrategy.sol";
import { IConvexFXSDepositor } from "../../interfaces/convex/IConvexFXSDepositor.sol";
import { ICvxFxsStaking } from "../../interfaces/convex/ICvxFxsStaking.sol";
import { ICurveCryptoPool } from "../../interfaces/ICurveCryptoPool.sol";
import { IZap } from "../../interfaces/IZap.sol";

import { ConcentratorStrategyBase } from "../strategies/ConcentratorStrategyBase.sol";

contract CvxFxsStakingStrategy is ConcentratorStrategyBase {
  using SafeERC20 for IERC20;

  /*************
   * Constants *
   *************/

  /// @inheritdoc IConcentratorStrategy
  // solhint-disable const-name-snakecase
  string public constant override name = "CvxFxsStaking";

  /// @dev The address of FXS token.
  address private constant FXS = 0x3432B6A60D23Ca0dFCa7761B7ab56459D9C964D0;

  /// @dev The address of cvxFXS token.
  address private constant cvxFXS = 0xFEEf77d3f69374f66429C91d732A244f074bdf74;

  /// @dev The address of Curve FXS/cvxFXS pool.
  address private constant CURVE_FXS_cvxFXS_POOL = 0xd658A338613198204DCa1143Ac3F01A722b5d94A;

  /// @dev The address of Convex FXS => cvxFXS Contract.
  address private constant FXS_DEPOSITOR = 0x8f55d7c21bDFf1A51AFAa60f3De7590222A3181e;

  /// @notice The address of CvxFxsStaking contract.
  address public constant staker = 0x49b4d1dF40442f0C31b1BbAEA3EDE7c38e37E31a;

  /***************
   * Constructor *
   ***************/

  constructor(address _operator) {
    address[] memory _rewards = new address[](2);
    _rewards[0] = 0x3432B6A60D23Ca0dFCa7761B7ab56459D9C964D0; // FXS
    _rewards[1] = 0x4e3FBD56CD56c3e72c1403e103b45Db9da5B9D2B; // CVX

    _initialize(_operator, _rewards);

    IERC20(cvxFXS).safeApprove(staker, uint256(-1));
  }

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @notice Sync reward tokens from CvxFxsStaking contract.
  function syncRewardToken() external {
    delete rewards;

    uint256 _length = ICvxFxsStaking(staker).rewardTokenLength();
    for (uint256 i = 0; i < _length; i++) {
      rewards.push(ICvxFxsStaking(staker).rewardTokens(i));
    }
  }

  /// @inheritdoc IConcentratorStrategy
  function deposit(address, uint256 _amount) external override onlyOperator {
    if (_amount > 0) {
      ICvxFxsStaking(staker).stake(_amount);
    }
  }

  /// @inheritdoc IConcentratorStrategy
  function withdraw(address _recipient, uint256 _amount) external override onlyOperator {
    if (_amount > 0) {
      ICvxFxsStaking(staker).withdraw(_amount);
      IERC20(cvxFXS).safeTransfer(_recipient, _amount);
    }
  }

  /// @inheritdoc IConcentratorStrategy
  function harvest(address _zapper, address _intermediate) external override onlyOperator returns (uint256 _harvested) {
    require(_intermediate == FXS, "intermediate not FXS");

    // 1. claim rewards from staking contract.
    address[] memory _rewards = rewards;
    uint256[] memory _amounts = new uint256[](rewards.length);
    for (uint256 i = 0; i < rewards.length; i++) {
      _amounts[i] = IERC20(_rewards[i]).balanceOf(address(this));
    }
    ICvxFxsStaking(staker).getReward(address(this));
    for (uint256 i = 0; i < rewards.length; i++) {
      _amounts[i] = IERC20(_rewards[i]).balanceOf(address(this)) - _amounts[i];
    }

    // 2. zap all rewards (except cvxFXS) to FXS
    uint256 _amountFXS;
    for (uint256 i = 0; i < rewards.length; i++) {
      address _rewardToken = _rewards[i];
      uint256 _amount = _amounts[i];
      if (_rewardToken == FXS) {
        _amountFXS += _amount;
      } else if (_rewardToken == cvxFXS) {
        _harvested += _amount;
      } else if (_amount > 0) {
        IERC20(_rewardToken).safeTransfer(_zapper, _amount);
        _amountFXS += IZap(_zapper).zap(_rewardToken, _amount, FXS, 0);
      }
    }

    // 3. swap FXS to cvxFXS
    if (_amountFXS > 0) {
      _harvested += _swapFXSToCvxFXS(_amountFXS, address(this));
    }

    // 4. deposit
    if (_harvested > 0) {
      ICvxFxsStaking(staker).stake(_harvested);
    }

    return _harvested;
  }

  /**********************
   * Internal Functions *
   **********************/

  /// @dev Internal function to swap FXS to cvxFXS
  /// @param _amountIn The amount of FXS to swap.
  /// @param _recipient The address of recipient who will recieve the cvxFXS.
  function _swapFXSToCvxFXS(uint256 _amountIn, address _recipient) internal returns (uint256) {
    // CRV swap to cvxFXS or stake to cvxFXS
    uint256 _amountOut = ICurveCryptoPool(CURVE_FXS_cvxFXS_POOL).get_dy(0, 1, _amountIn);
    bool useCurve = _amountOut > _amountIn;

    if (useCurve) {
      IERC20(FXS).safeApprove(CURVE_FXS_cvxFXS_POOL, 0);
      IERC20(FXS).safeApprove(CURVE_FXS_cvxFXS_POOL, _amountIn);
      _amountOut = ICurveCryptoPool(CURVE_FXS_cvxFXS_POOL).exchange_underlying(0, 1, _amountIn, 0, _recipient);
    } else {
      uint256 _lockIncentive = IConvexFXSDepositor(FXS_DEPOSITOR).incentiveFxs();
      // if use `lock = false`, will possible take fee
      // if use `lock = true`, some incentive will be given
      _amountOut = IERC20(cvxFXS).balanceOf(address(this));
      if (_lockIncentive == 0) {
        // no lock incentive, use `lock = false`
        IConvexFXSDepositor(FXS_DEPOSITOR).deposit(_amountIn, false);
      } else {
        // no lock incentive, use `lock = true`
        IConvexFXSDepositor(FXS_DEPOSITOR).deposit(_amountIn, true);
      }
      _amountOut = IERC20(cvxFXS).balanceOf(address(this)) - _amountOut; // never overflow here
      if (_recipient != address(this)) {
        IERC20(cvxFXS).safeTransfer(_recipient, _amountOut);
      }
    }
    return _amountOut;
  }
}
