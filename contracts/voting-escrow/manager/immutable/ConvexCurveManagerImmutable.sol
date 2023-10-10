// SPDX-License-Identifier: MIT

pragma solidity =0.8.20;

import { Ownable2Step } from "@openzeppelin/contracts-v4/access/Ownable2Step.sol";
import { IERC20 } from "@openzeppelin/contracts-v4/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts-v4/token/ERC20/utils/SafeERC20.sol";

import { IMultipleRewardDistributor } from "../../../common/rewards/distributor/IMultipleRewardDistributor.sol";
import { IConvexVirtualBalanceRewardPool } from "../../../interfaces/convex/IConvexVirtualBalanceRewardPool.sol";
import { IStashTokenWrapper } from "../../../interfaces/convex/IStashTokenWrapper.sol";
import { IConvexBasicRewards } from "../../../interfaces/IConvexBasicRewards.sol";
import { IConvexBooster } from "../../../interfaces/IConvexBooster.sol";
import { ILiquidityManager } from "../../interfaces/ILiquidityManager.sol";

import { WordCodec } from "../../../common/codec/WordCodec.sol";

import { LiquidityManagerBaseImmutable } from "./LiquidityManagerBaseImmutable.sol";

contract ConvexCurveManagerImmutable is LiquidityManagerBaseImmutable {
  using SafeERC20 for IERC20;
  using WordCodec for bytes32;

  /*************
   * Constants *
   *************/

  /// @dev The address of Convex Booster.
  address private constant BOOSTER = 0xF403C135812408BFbE8713b5A23a04b3D48AAE31;

  /// @dev The offset of pid in `_miscData`.
  uint256 private constant PID_OFFSET = 61;

  /// @dev The rewarder of pid in `_miscData`.
  uint256 private constant REWARDER_OFFSET = 77;

  /// @notice The pid in Convex Booster.
  uint256 public immutable pid;

  /// @notice The address of rewarder.
  address public immutable rewarder;

  /*************
   * Variables *
   *************/

  /// @dev the list of reward tokens.
  address[] private rewards;

  /***************
   * Constructor *
   ***************/

  constructor(
    address _operator,
    address _token,
    address _rewarder
  ) LiquidityManagerBaseImmutable(_operator, _token) {
    pid = IConvexBasicRewards(_rewarder).pid();
    rewarder = _rewarder;

    IERC20(_token).safeApprove(BOOSTER, type(uint256).max);
    syncRewardToken();
  }

  /*************************
   * Public View Functions *
   *************************/

  /// @inheritdoc ILiquidityManager
  function getRewardTokens() external view returns (address[] memory) {
    return rewards;
  }

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @notice Sync reward tokens from ConvexBasicRewards contract.
  function syncRewardToken() public {
    delete rewards;

    rewards.push(IConvexBasicRewards(rewarder).rewardToken());

    uint256 _length = IConvexBasicRewards(rewarder).extraRewardsLength();
    for (uint256 i = 0; i < _length; i++) {
      address _rewarder = IConvexBasicRewards(rewarder).extraRewards(i);
      address _wrapper = IConvexVirtualBalanceRewardPool(_rewarder).rewardToken();
      rewards.push(IStashTokenWrapper(_wrapper).token());
    }
  }

  /// @inheritdoc ILiquidityManager
  function manage(address _receiver) public override {
    uint256 _balance = IERC20(token).balanceOf(address(this));
    if (_balance == 0) return;

    // deposit to booster
    IConvexBooster(BOOSTER).deposit(pid, _balance, true);

    // send incentive
    uint256 _length = rewards.length;
    for (uint256 i = 0; i < _length; ++i) {
      address _rewardToken = rewards[i];
      uint256 _incentive = incentive[_rewardToken];
      if (_incentive > 0) {
        IERC20(_rewardToken).safeTransfer(_receiver, _incentive);
        incentive[_rewardToken] = 0;
      }
    }
  }

  /// @inheritdoc ILiquidityManager
  function harvest(address _receiver) external {
    // try to deposit first
    uint256 _balance = IERC20(token).balanceOf(address(this));
    if (_balance > 0) {
      IConvexBooster(BOOSTER).deposit(pid, _balance, true);
    }

    // harvest
    IConvexBasicRewards(rewarder).getReward();

    // distribute rewards
    uint256 _harvesterRatio = getHarvesterRatio();
    uint256 _managerRatio = getManagerRatio();
    uint256 _length = rewards.length;
    for (uint256 i = 0; i < _length; ++i) {
      address _rewardToken = rewards[i];
      uint256 _rewardAmount = IERC20(_rewardToken).balanceOf(address(this));
      if (_rewardAmount == 0) continue;

      unchecked {
        uint256 _incentive = (_rewardAmount * _managerRatio) / FEE_PRECISION;
        if (_incentive > 0) incentive[_rewardToken] += _incentive;

        uint256 _bounty = (_rewardAmount * _harvesterRatio) / FEE_PRECISION;
        if (_bounty > 0) {
          IERC20(_rewardToken).safeTransfer(_receiver, _bounty);
        }

        IMultipleRewardDistributor(operator).depositReward(_rewardToken, _rewardAmount - _incentive - _bounty);
      }
    }
  }

  /**********************
   * Internal Functions *
   **********************/

  /// @inheritdoc LiquidityManagerBaseImmutable
  function _managedBalance() internal view virtual override returns (uint256) {
    unchecked {
      return IERC20(token).balanceOf(address(this)) + IConvexBasicRewards(rewarder).balanceOf(address(this));
    }
  }

  /// @inheritdoc LiquidityManagerBaseImmutable
  function _deposit(
    address,
    uint256,
    bool _manage
  ) internal virtual override {
    if (_manage) {
      // deposit to underlying strategy
      uint256 _balance = IERC20(token).balanceOf(address(this));
      if (_balance > 0) {
        IConvexBooster(BOOSTER).deposit(pid, _balance, true);
      }
    }
  }

  /// @inheritdoc LiquidityManagerBaseImmutable
  function _withdraw(address _receiver, uint256 _amount) internal virtual override {
    if (_amount > 0) {
      uint256 _balance = IERC20(token).balanceOf(address(this));
      if (_amount > _balance) {
        unchecked {
          IConvexBasicRewards(rewarder).withdrawAndUnwrap(_amount - _balance, false);
        }
      }
      IERC20(token).safeTransfer(_receiver, _amount);
    }
  }
}
