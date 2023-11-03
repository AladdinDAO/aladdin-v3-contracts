// SPDX-License-Identifier: MIT

pragma solidity =0.8.20;

import { IERC20 } from "@openzeppelin/contracts-v4/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts-v4/token/ERC20/utils/SafeERC20.sol";

import { IMultipleRewardDistributor } from "../../common/rewards/distributor/IMultipleRewardDistributor.sol";
import { IConvexVirtualBalanceRewardPool } from "../../interfaces/convex/IConvexVirtualBalanceRewardPool.sol";
import { IStashTokenWrapper } from "../../interfaces/convex/IStashTokenWrapper.sol";
import { IConvexBasicRewards } from "../../interfaces/IConvexBasicRewards.sol";
import { IConvexBooster } from "../../interfaces/IConvexBooster.sol";
import { ILiquidityManager } from "../interfaces/ILiquidityManager.sol";

import { WordCodec } from "../../common/codec/WordCodec.sol";

import { LiquidityManagerBase } from "./LiquidityManagerBase.sol";

contract ConvexCurveManager is LiquidityManagerBase {
  using SafeERC20 for IERC20;
  using WordCodec for bytes32;

  /*************
   * Constants *
   *************/

  /// @dev The address of Convex CVX token.
  address private constant CVX = 0x4e3FBD56CD56c3e72c1403e103b45Db9da5B9D2B;

  /// @dev The address of Convex Booster.
  address private constant BOOSTER = 0xF403C135812408BFbE8713b5A23a04b3D48AAE31;

  /// @dev The offset of pid in `_miscData`.
  uint256 private constant PID_OFFSET = 61;

  /// @dev The rewarder of pid in `_miscData`.
  uint256 private constant REWARDER_OFFSET = 77;

  /*************
   * Variables *
   *************/

  /// @dev the list of reward tokens.
  address[] private rewards;

  /***************
   * Constructor *
   ***************/

  function initialize(
    address _operator,
    address _token,
    address _rewarder
  ) external initializer {
    __LiquidityManagerBase_init(_operator, _token);

    uint256 _pid = IConvexBasicRewards(_rewarder).pid();

    bytes32 _data = _miscData;
    _data = _data.insertUint(_pid, PID_OFFSET, 16);
    _data = _data.insertUint(uint256(uint160(_rewarder)), REWARDER_OFFSET, 160);
    _miscData = _data;

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

  /// @notice Return the pid in Convex Booster.
  function pid() public view returns (uint256) {
    return _miscData.decodeUint(PID_OFFSET, 16);
  }

  /// @notice Return the address of rewarder.
  function rewarder() public view returns (address) {
    return address(uint160(_miscData.decodeUint(REWARDER_OFFSET, 160)));
  }

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @notice Sync reward tokens from ConvexBasicRewards contract.
  function syncRewardToken() public {
    delete rewards;

    address staker = rewarder();
    rewards.push(IConvexBasicRewards(staker).rewardToken());

    uint256 _length = IConvexBasicRewards(staker).extraRewardsLength();
    bool _hasCVX = false;
    for (uint256 i = 0; i < _length; i++) {
      address _rewarder = IConvexBasicRewards(staker).extraRewards(i);
      address _wrapper = IConvexVirtualBalanceRewardPool(_rewarder).rewardToken();
      // old rewarders didn't use token wrapper
      try IStashTokenWrapper(_wrapper).token() returns (address _token) {
        if (_token == CVX) _hasCVX = true;
        rewards.push(_token);
      } catch {
        if (_wrapper == CVX) _hasCVX = true;
        rewards.push(_wrapper);
      }
    }
    if (!_hasCVX) rewards.push(CVX);

    _length = rewards.length;
    for (uint256 i = 0; i < _length; ++i) {
      address _token = rewards[i];
      IERC20(_token).safeApprove(operator, 0);
      IERC20(_token).safeApprove(operator, type(uint256).max);
    }
  }

  /// @inheritdoc ILiquidityManager
  function manage() public override {
    uint256 _balance = IERC20(token).balanceOf(address(this));
    if (_balance == 0) return;

    _manageUnderlying(address(0), _balance, false);
  }

  /// @inheritdoc ILiquidityManager
  function harvest(address _receiver) external {
    // try to deposit first
    uint256 _balance = IERC20(token).balanceOf(address(this));
    if (_balance > 0) {
      IConvexBooster(BOOSTER).deposit(pid(), _balance, true);
    }

    // harvest
    IConvexBasicRewards(rewarder()).getReward();

    // distribute rewards
    uint256 _harvesterRatio = getHarvesterRatio();
    uint256 _managerRatio = getManagerRatio();
    uint256 _length = rewards.length;
    address _operator = operator;
    for (uint256 i = 0; i < _length; ++i) {
      address _rewardToken = rewards[i];
      uint256 _rewardAmount = IERC20(_rewardToken).balanceOf(address(this)) - incentive[_rewardToken];
      if (_rewardAmount == 0) continue;

      unchecked {
        uint256 _incentive = (_rewardAmount * _managerRatio) / FEE_PRECISION;
        if (_incentive > 0) incentive[_rewardToken] += _incentive;

        uint256 _bounty = (_rewardAmount * _harvesterRatio) / FEE_PRECISION;
        if (_bounty > 0) {
          IERC20(_rewardToken).safeTransfer(_receiver, _bounty);
        }

        IMultipleRewardDistributor(_operator).depositReward(_rewardToken, _rewardAmount - _incentive - _bounty);
      }
    }
  }

  /**********************
   * Internal Functions *
   **********************/

  /// @inheritdoc LiquidityManagerBase
  function _managedBalance() internal view virtual override returns (uint256) {
    unchecked {
      return IERC20(token).balanceOf(address(this)) + IConvexBasicRewards(rewarder()).balanceOf(address(this));
    }
  }

  /// @inheritdoc LiquidityManagerBase
  function _deposit(
    address _receiver,
    uint256,
    bool _manage
  ) internal virtual override {
    if (_manage) {
      // deposit to underlying strategy
      uint256 _balance = IERC20(token).balanceOf(address(this));
      if (_balance > 0) {
        _manageUnderlying(_receiver, _balance, true);
      }
    }
  }

  /// @inheritdoc LiquidityManagerBase
  function _withdraw(address _receiver, uint256 _amount) internal virtual override {
    if (_amount > 0) {
      uint256 _balance = IERC20(token).balanceOf(address(this));
      if (_amount > _balance) {
        unchecked {
          IConvexBasicRewards(rewarder()).withdrawAndUnwrap(_amount - _balance, false);
        }
      }
      IERC20(token).safeTransfer(_receiver, _amount);
    }
  }

  /// @dev Internal function to manage underlying assets
  function _manageUnderlying(
    address _receiver,
    uint256 _balance,
    bool _incentived
  ) internal {
    // deposit to booster
    IConvexBooster(BOOSTER).deposit(pid(), _balance, true);

    // send incentive
    if (_incentived) {
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
  }
}
