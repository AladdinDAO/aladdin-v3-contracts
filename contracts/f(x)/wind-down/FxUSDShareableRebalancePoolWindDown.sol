// SPDX-License-Identifier: MIT

pragma solidity =0.8.20;

import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable-v4/token/ERC20/IERC20Upgradeable.sol";
import { SafeERC20Upgradeable } from "@openzeppelin/contracts-upgradeable-v4/token/ERC20/utils/SafeERC20Upgradeable.sol";

import { IFxMarketV2 } from "../../interfaces/f(x)/IFxMarketV2.sol";
import { IFxTreasuryV2 } from "../../interfaces/f(x)/IFxTreasuryV2.sol";

import { ShareableRebalancePool } from "../rebalance-pool/ShareableRebalancePool.sol";

interface IFxTreasuryWindDownStatus {
  function windDownStatus() external view returns (uint8);
}

// solhint-disable not-rely-on-time

/// @title FxUSDShareableRebalancePoolWindDown
/// @notice Specialized FxUSD rebalance pool implementation for the ezETH wind-down.
contract FxUSDShareableRebalancePoolWindDown is ShareableRebalancePool {
  using SafeERC20Upgradeable for IERC20Upgradeable;

  /**********
   * Events *
   **********/

  event WindDown(uint256 liquidated, uint256 baseGained);

  event AdminClaim(address indexed token, uint256 amount);

  /**********
   * Errors *
   **********/

  error ErrorWindDownNotAllowed();
  error ErrorTreasuryNotWindDown();
  error ErrorTreasuryNotFinalized();
  error ErrorWindDownZeroAsset();
  error ErrorWindDownInvalidAsset();
  error ErrorWindDownUnexpectedAssetBalance();

  /***************
   * Constructor *
   ***************/

  constructor(
    address _fxn,
    address _ve,
    address _veHelper,
    address _minter
  ) ShareableRebalancePool(_fxn, _ve, _veHelper, _minter) {}

  /****************************
   * Public Mutated Functions *
   ****************************/

  function deposit(uint256, address) external pure override {
    revert ErrorWindDownNotAllowed();
  }

  function withdraw(uint256, address) external pure override {
    revert ErrorWindDownNotAllowed();
  }

  function withdrawFrom(
    address,
    uint256,
    address
  ) external pure override {
    revert ErrorWindDownNotAllowed();
  }

  function liquidate(uint256, uint256) external pure override returns (uint256, uint256) {
    revert ErrorWindDownNotAllowed();
  }

  function toggleVoteSharing(address) external pure override {
    revert ErrorWindDownNotAllowed();
  }

  function acceptSharedVote(address) external pure override {
    revert ErrorWindDownNotAllowed();
  }

  function rejectSharedVote() external pure override {
    revert ErrorWindDownNotAllowed();
  }

  function updateWrapper(address) external pure override {
    revert ErrorWindDownNotAllowed();
  }

  function updateLiquidatableCollateralRatio(uint256) external pure override {
    revert ErrorWindDownNotAllowed();
  }

  /// @notice Redeem all pool-held fToken through the market and distribute base token to stakers.
  /// @param _expectedAssetBalance Exact current pool asset balance, used as an operational slippage guard.
  /// @param _minBaseOut Minimum base token redeemed from the market.
  function windDown(uint256 _expectedAssetBalance, uint256 _minBaseOut)
    external
    onlyRole(DEFAULT_ADMIN_ROLE)
    returns (uint256 _liquidated, uint256 _baseOut)
  {
    _checkpoint(address(0));

    address _treasury = treasury;
    if (IFxTreasuryWindDownStatus(_treasury).windDownStatus() != 1) revert ErrorTreasuryNotWindDown();

    address _asset = asset;
    _liquidated = IERC20Upgradeable(_asset).balanceOf(address(this));
    if (_liquidated == 0) revert ErrorWindDownZeroAsset();
    if (_liquidated != _expectedAssetBalance) revert ErrorWindDownUnexpectedAssetBalance();

    address _market = market;
    IERC20Upgradeable(_asset).safeApprove(_market, 0);
    IERC20Upgradeable(_asset).safeApprove(_market, _liquidated);

    IFxTreasuryV2 _treasuryV2 = IFxTreasuryV2(_treasury);
    if (_asset != _treasuryV2.fToken()) revert ErrorWindDownInvalidAsset();
    (_baseOut, ) = IFxMarketV2(_market).redeemFToken(_liquidated, address(this), _minBaseOut);

    if (IERC20Upgradeable(_asset).balanceOf(address(this)) != 0) revert ErrorWindDownUnexpectedAssetBalance();

    _accumulateReward(baseToken, _baseOut);
    _notifyLoss(_liquidated);

    emit WindDown(_liquidated, _baseOut);
  }

  /// @notice Sweep remaining reward token balances after the treasury wind-down is finalized.
  function adminClaim() external onlyRole(DEFAULT_ADMIN_ROLE) {
    if (IFxTreasuryWindDownStatus(treasury).windDownStatus() != 2) revert ErrorTreasuryNotFinalized();

    _adminClaimRewardTokens(getActiveRewardTokens());
    _adminClaimRewardTokens(getHistoricalRewardTokens());
  }

  function _adminClaimRewardTokens(address[] memory _rewardTokens) internal {
    for (uint256 i = 0; i < _rewardTokens.length; i++) {
      address _token = _rewardTokens[i];
      uint256 _balance = IERC20Upgradeable(_token).balanceOf(address(this));
      if (_balance == 0) continue;

      IERC20Upgradeable(_token).safeTransfer(_msgSender(), _balance);
      emit AdminClaim(_token, _balance);
    }
  }
}
