// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import { IERC20 } from "@openzeppelin/contracts-v4/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts-v4/token/ERC20/utils/SafeERC20.sol";

import { ICurveGauge } from "../../../interfaces/ICurveGauge.sol";
import { IStakeDAOSdTokenDepositor } from "../../../interfaces/IStakeDAOSdTokenDepositor.sol";
import { IVestingManager } from "../IVestingManager.sol";

// solhint-disable const-name-snakecase

contract SdFxnVestingManager is IVestingManager {
  using SafeERC20 for IERC20;

  /*************
   * Constants *
   *************/

  /// @dev The address of f(x)'s `FXN` token.
  address private constant FXN = 0x365AccFCa291e7D3914637ABf1F7635dB165Bb09;

  /// @dev The address of StakeDAO's `sdFXN` token.
  address private constant sdFXN = 0xe19d1c837B8A1C83A56cD9165b2c0256D39653aD;

  /// @dev The address of StakeDAO's sdFXN Gauge contract.
  address private constant SDFXN_GAUGE = 0xbcfE5c47129253C6B8a9A00565B3358b488D42E0;

  /// @dev The address of StakeDAO's `FXNDepositor` contract.
  address private constant FXN_DEPOSITOR = 0x7995192bE61EA0B28ce14183DDA51eDF78F1c7AB;

  /*************************
   * Public View Functions *
   *************************/

  /// @inheritdoc IVestingManager
  function originalToken() external pure override returns (address) {
    return FXN;
  }

  /// @inheritdoc IVestingManager
  function managedToken() external pure override returns (address) {
    return SDFXN_GAUGE;
  }

  /// @inheritdoc IVestingManager
  function balanceOf(address _proxy) external view returns (uint256) {
    return IERC20(SDFXN_GAUGE).balanceOf(_proxy);
  }

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @inheritdoc IVestingManager
  function manage(uint256 _amount, address _receiver) external {
    address _redirect = ICurveGauge(SDFXN_GAUGE).rewards_receiver(address(this));
    if (_redirect != _receiver) {
      ICurveGauge(SDFXN_GAUGE).set_rewards_receiver(_receiver);
    }

    IERC20(FXN).safeApprove(FXN_DEPOSITOR, 0);
    IERC20(FXN).safeApprove(FXN_DEPOSITOR, _amount);
    uint256 _incentive = IStakeDAOSdTokenDepositor(FXN_DEPOSITOR).incentiveToken();
    uint256 _incentivePercentage = IStakeDAOSdTokenDepositor(FXN_DEPOSITOR).lockIncentivePercent();
    if (_incentive > 0 || _incentivePercentage > 0) {
      IStakeDAOSdTokenDepositor(FXN_DEPOSITOR).deposit(_amount, true, true, address(this));
    } else {
      IStakeDAOSdTokenDepositor(FXN_DEPOSITOR).deposit(_amount, false, true, address(this));
    }
  }

  /// @inheritdoc IVestingManager
  function withdraw(uint256 _amount, address _receiver) external {
    IERC20(SDFXN_GAUGE).safeTransfer(_receiver, _amount);
  }

  /// @inheritdoc IVestingManager
  function getReward(address _receiver) external {
    ICurveGauge(SDFXN_GAUGE).claim_rewards(address(this), _receiver);
  }
}
