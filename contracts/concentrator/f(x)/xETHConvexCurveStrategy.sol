// SPDX-License-Identifier: MIT

pragma solidity =0.8.20;

import { IERC20 } from "@openzeppelin/contracts-v4/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts-v4/token/ERC20/utils/SafeERC20.sol";

import { IConcentratorStrategy } from "../../interfaces/concentrator/IConcentratorStrategy.sol";
import { IConvexVirtualBalanceRewardPool } from "../../interfaces/convex/IConvexVirtualBalanceRewardPool.sol";
import { IStashTokenWrapper } from "../../interfaces/convex/IStashTokenWrapper.sol";
import { IConvexBasicRewards } from "../../interfaces/IConvexBasicRewards.sol";
import { IConvexBooster } from "../../interfaces/IConvexBooster.sol";

import { ManualCompoundingStrategyBaseV2 } from "../strategies/ManualCompoundingStrategyBaseV2.sol";

contract xETHConvexCurveStrategy is ManualCompoundingStrategyBaseV2 {
  using SafeERC20 for IERC20;

  /*************
   * Constants *
   *************/

  /// @inheritdoc IConcentratorStrategy
  // solhint-disable const-name-snakecase
  string public constant override name = "xETHConvexCurveStrategy";

  /// @dev The address of Convex CVX token.
  address private constant CVX = 0x4e3FBD56CD56c3e72c1403e103b45Db9da5B9D2B;

  /// @dev The address of Convex Booster.
  address private constant BOOSTER = 0xF403C135812408BFbE8713b5A23a04b3D48AAE31;

  /*************
   * Variables *
   *************/

  /// @notice The address of CvxRewardPool contract.
  address public staker;

  /// @notice The pid of Convex reward pool.
  uint256 public pid;

  /// @notice The address of staking token.
  address public token;

  /***************
   * Constructor *
   ***************/

  function initialize(
    address _operator,
    address _token,
    address _staker
  ) external initializer {
    staker = _staker;
    pid = IConvexBasicRewards(_staker).pid();
    token = _token;

    __ConcentratorStrategyBase_init(_operator, new address[](0));
    syncRewardToken();

    // approval
    IERC20(_token).safeApprove(BOOSTER, type(uint256).max);
  }

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @notice Sync reward tokens from reward pool contract.
  function syncRewardToken() public {
    delete rewards;
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
      isTokenProtected[_token] = true;
      IERC20(_token).safeApprove(operator, 0);
      IERC20(_token).safeApprove(operator, type(uint256).max);
    }
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
      IConvexBasicRewards(staker).withdrawAndUnwrap(_amount, false);
      IERC20(token).safeTransfer(_recipient, _amount);
    }
  }

  /// @inheritdoc IConcentratorStrategy
  function harvest(address _converter, address _intermediate)
    external
    override
    onlyOperator
    returns (uint256 _harvested)
  {
    // 0. sweep balances
    address[] memory _rewards = rewards;
    _sweepToken(_rewards);

    // 1. claim rewards from staking staker contract.
    IConvexBasicRewards(staker).getReward();
    uint256[] memory _amounts = new uint256[](rewards.length);
    for (uint256 i = 0; i < rewards.length; i++) {
      _amounts[i] = IERC20(_rewards[i]).balanceOf(address(this));
    }

    // 2. convert all rewards to staking token.
    _harvested = _harvest(_converter, _intermediate, _rewards, _amounts);
  }
}
