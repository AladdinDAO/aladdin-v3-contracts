// SPDX-License-Identifier: MIT

pragma solidity =0.8.20;

import { Ownable2Step } from "@openzeppelin/contracts-v4/access/Ownable2Step.sol";
import { IERC20 } from "@openzeppelin/contracts-v4/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts-v4/token/ERC20/utils/SafeERC20.sol";

import { ILiquidityManager } from "../interfaces/ILiquidityManager.sol";
import { IConvexBaseRewardPool } from "../../interfaces/v0.8/IConvexBaseRewardPool.sol";
import { IConvexBooster } from "../../interfaces/v0.8/IConvexBooster.sol";

import { LiquidityManagerBase } from "./LiquidityManagerBase.sol";

contract ConvexCurveManager is LiquidityManagerBase {
  using SafeERC20 for IERC20;

  /*************
   * Constants *
   *************/

  /// @notice The address of Convex RewardPool.
  address public immutable rewarder;

  /// @notice The pid in Convex Booster.
  uint256 public immutable pid;

  /// @dev The address of Convex Booster.
  address private constant BOOSTER = 0xF403C135812408BFbE8713b5A23a04b3D48AAE31;

  /***************
   * Constructor *
   ***************/

  constructor(
    address _operator,
    address _token,
    address _rewarder
  ) LiquidityManagerBase(_operator, _token) {
    rewarder = _rewarder;
    pid = IConvexBaseRewardPool(_rewarder).pid();

    IERC20(_token).safeApprove(BOOSTER, type(uint256).max);
  }

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @inheritdoc ILiquidityManager
  function manage() external {
    uint256 _balance = IERC20(token).balanceOf(address(this));
    IConvexBooster(BOOSTER).deposit(pid, _balance, true);

    // @todo give incentive to caller
    // @todo only deposit part of the tokens.
  }

  /**********************
   * Internal Functions *
   **********************/

  /// @inheritdoc LiquidityManagerBase
  function _managedBalance() internal view virtual override returns (uint256) {
    unchecked {
      return IERC20(token).balanceOf(address(this)) + IConvexBaseRewardPool(rewarder).balanceOf(address(this));
    }
  }

  /// @inheritdoc LiquidityManagerBase
  function _deposit(address, uint256 _amount) internal virtual override {
    // do nothing
  }

  /// @inheritdoc LiquidityManagerBase
  function _withdraw(address _receiver, uint256 _amount) internal virtual override {
    if (_amount > 0) {
      uint256 _balance = IERC20(token).balanceOf(address(this));
      if (_amount > _balance) {
        unchecked {
          IConvexBaseRewardPool(rewarder).withdrawAndUnwrap(_amount - _balance, false);
        }
      }
      IERC20(token).safeTransfer(_receiver, _amount);
    }
  }
}
