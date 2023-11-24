// SPDX-License-Identifier: MIT

pragma solidity =0.8.20;

import { IERC20 } from "@openzeppelin/contracts-v4/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts-v4/token/ERC20/utils/SafeERC20.sol";

import { IConcentratorStrategy } from "../../interfaces/concentrator/IConcentratorStrategy.sol";
import { IConvexVirtualBalanceRewardPool } from "../../interfaces/convex/IConvexVirtualBalanceRewardPool.sol";
import { ICvxRewardPool } from "../../interfaces/convex/ICvxRewardPool.sol";
import { IStashTokenWrapper } from "../../interfaces/convex/IStashTokenWrapper.sol";
import { IConvexBasicRewards } from "../../interfaces/IConvexBasicRewards.sol";

import { AutoCompoundingStrategyBaseV2 } from "../strategies/AutoCompoundingStrategyBaseV2.sol";

contract CvxStakingStrategy is AutoCompoundingStrategyBaseV2 {
  using SafeERC20 for IERC20;

  /*************
   * Constants *
   *************/

  /// @inheritdoc IConcentratorStrategy
  // solhint-disable const-name-snakecase
  string public constant override name = "CvxStaking";

  /// @dev The address of cvxCRV token.
  address private constant cvxCRV = 0x62B9c7356A2Dc64a1969e19C23e4f579F9810Aa7;

  /// @dev The address of CVX token.
  address private constant CVX = 0x4e3FBD56CD56c3e72c1403e103b45Db9da5B9D2B;

  /// @dev The address of cvxCRV staking pool.
  address private constant cvxCRVRewardPool = 0x3Fe65692bfCD0e6CF84cB1E7d24108E434A7587e;

  /// @notice The address of CvxRewardPool contract.
  address public immutable staker;

  /***************
   * Constructor *
   ***************/

  constructor(address _operator, address _staker) initializer {
    staker = _staker;

    address[] memory _rewards = new address[](1);
    _rewards[0] = cvxCRV;

    __ConcentratorStrategyBase_init(_operator, _rewards);

    // approval
    IERC20(CVX).safeApprove(_staker, type(uint256).max);

    // protect token
    isTokenProtected[CVX] = true;
    isTokenProtected[cvxCRV] = true;
  }

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @notice Sync reward tokens from CvxFxnStaking contract.
  function syncRewardToken() external {
    delete rewards;
    rewards.push(ICvxRewardPool(staker).rewardToken());

    uint256 _length = ICvxRewardPool(staker).extraRewardsLength();
    for (uint256 i = 0; i < _length; i++) {
      address _rewarder = ICvxRewardPool(staker).extraRewards(i);
      address _wrapper = IConvexVirtualBalanceRewardPool(_rewarder).rewardToken();
      rewards.push(IStashTokenWrapper(_wrapper).token());
    }
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
  function harvest(address _converter, address _intermediate)
    external
    override
    onlyOperator
    returns (uint256 _harvested)
  {
    // -1. withdraw cvxCRV from staking pool
    uint256 _balance = IConvexBasicRewards(cvxCRVRewardPool).balanceOf(address(this));
    if (_balance > 0) {
      // claim and sweep extra rewards
      IConvexBasicRewards(cvxCRVRewardPool).withdraw(_balance, true);
      address[] memory _extraRewards = new address[](3);
      _extraRewards[0] = 0xD533a949740bb3306d119CC777fa900bA034cd52; // CRV
      _extraRewards[1] = 0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490; // 3CRV
      _extraRewards[2] = CVX;
      _sweepToken(_extraRewards);
    }

    // 0. sweep balances
    address[] memory _rewards = rewards;
    _sweepToken(_rewards);

    // 1. claim rewards from staking staker contract.
    ICvxRewardPool(staker).getReward(false);
    uint256[] memory _amounts = new uint256[](rewards.length);
    for (uint256 i = 0; i < rewards.length; i++) {
      _amounts[i] = IERC20(_rewards[i]).balanceOf(address(this));
    }

    // 2. convert all rewards to staking token.
    _harvested = _harvest(_converter, _intermediate, CVX, _rewards, _amounts);

    // 3. deposit into convex
    if (_harvested > 0) {
      ICvxRewardPool(staker).stake(_harvested);
    }
  }
}
