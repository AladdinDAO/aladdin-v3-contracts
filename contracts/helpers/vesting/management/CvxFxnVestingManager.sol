// SPDX-License-Identifier: MIT

pragma solidity =0.8.20;

import { IERC20 } from "@openzeppelin/contracts-v4/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts-v4/token/ERC20/utils/SafeERC20.sol";

import { ICvxFxnStaking } from "../../../interfaces/convex/ICvxFxnStaking.sol";
import { IConvexFXNDepositor } from "../../../interfaces/convex/IConvexFXNDepositor.sol";
import { IVestingManager } from "../IVestingManager.sol";

// solhint-disable const-name-snakecase

contract CvxFxnVestingManager is IVestingManager {
  using SafeERC20 for IERC20;

  /*************
   * Constants *
   *************/

  /// @dev The address of f(x)'s `FXN` token.
  address private constant FXN = 0x365AccFCa291e7D3914637ABf1F7635dB165Bb09;

  /// @dev The address of Convex's `cvxFXN` token.
  address private constant cvxFXN = 0x183395DbD0B5e93323a7286D1973150697FFFCB3;

  /// @dev The address of Convex's `cvxFxnStaking` contract.
  address private constant CVXFXN_STAKING = 0xEC60Cd4a5866fb3B0DD317A46d3B474a24e06beF;

  /// @dev The address of Convex's `FxnDepositor` contract.
  address private constant FXN_DEPOSITOR = 0x56B3c8eF8A095f8637B6A84942aA898326B82b91;

  /*************************
   * Public View Functions *
   *************************/

  /// @inheritdoc IVestingManager
  function originalToken() external pure override returns (address) {
    return FXN;
  }

  /// @inheritdoc IVestingManager
  function managedToken() external pure override returns (address) {
    return CVXFXN_STAKING;
  }

  /// @inheritdoc IVestingManager
  function balanceOf(address _proxy) external view returns (uint256) {
    return IERC20(CVXFXN_STAKING).balanceOf(_proxy);
  }

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @inheritdoc IVestingManager
  function manage(uint256 _amount, address _receiver) external {
    address _redirect = ICvxFxnStaking(CVXFXN_STAKING).rewardRedirect(address(this));
    if (_redirect != _receiver) {
      ICvxFxnStaking(CVXFXN_STAKING).setRewardRedirect(_receiver);
    }

    IERC20(FXN).safeApprove(FXN_DEPOSITOR, 0);
    IERC20(FXN).safeApprove(FXN_DEPOSITOR, _amount);
    IConvexFXNDepositor(FXN_DEPOSITOR).deposit(_amount, false);

    IERC20(cvxFXN).safeApprove(CVXFXN_STAKING, 0);
    IERC20(cvxFXN).safeApprove(CVXFXN_STAKING, _amount);
    ICvxFxnStaking(CVXFXN_STAKING).stake(_amount);
  }

  /// @inheritdoc IVestingManager
  function withdraw(uint256 _amount, address _receiver) external {
    IERC20(CVXFXN_STAKING).safeTransfer(_receiver, _amount);
  }

  /// @inheritdoc IVestingManager
  function getReward(address _receiver) external {
    ICvxFxnStaking(CVXFXN_STAKING).getReward(address(this), _receiver);
  }
}
