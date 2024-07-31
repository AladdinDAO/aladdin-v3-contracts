// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.25;

import { MathUpgradeable } from "@openzeppelin/contracts-upgradeable-v4/utils/math/MathUpgradeable.sol";

import { WordCodec } from "../../../common/codec/WordCodec.sol";
import { FxBasePool } from "./FxBasePool.sol";

abstract contract FxGeneralPool is FxBasePool {
  using WordCodec for bytes32;

  /**********
   * Errors *
   **********/

  /// @dev Thrown when leveraged token redeem is paused in stability mode.
  error ErrorLeveragedTokenRedeemPausedInStabilityMode();

  /// @dev Thrown when mint fractional token in paused mode.
  error ErrorFractionalTokenMintPaused();

  /// @dev Thrown when mint leveraged token in paused mode.
  error ErrorLeveragedTokenMintPaused();

  /// @dev Thrown when redeem fractional token in paused mode.
  error ErrorFractionalTokenRedeemPaused();

  /// @dev Thrown when redeem leveraged token in paused mode.
  error ErrorLeveragedTokenRedeemPaused();

  /// @dev Thrown when arithmetic overflow.
  error ErrorOverflow();

  /*************
   * Constants *
   *************/

  /// @dev The maximum possible value of effective base token amount to enter stability mode.
  uint256 internal constant MAX_BASE_AMOUNT_STABILITY_MODE = type(uint256).max / FEE_PRECISION;

  /*************
   * Variables *
   *************/

  /// @dev Slots for future use.
  uint256[50] private _gap;

  /**********************
   * Internal Functions *
   **********************/

  /// @inheritdoc FxBasePool
  function _beforeMintAndRedeem(
    Action, /*action*/
    uint256 baseBalance,
    uint256, /*fSupply*/
    uint256 /*xSupply*/
  ) internal virtual override {
    bytes32 cachedPendingRewardsData = pendingRewardsData;
    uint256 lastTokenRate = cachedPendingRewardsData.decodeUint(LAST_TOKEN_RATE_OFFSET, 96);
    uint256 currentTokenRate = _getRate();
    if (lastTokenRate == currentTokenRate) return;

    uint256 pendingRewards = cachedPendingRewardsData.decodeUint(PENDING_REWARDS_OFFSET, 96);
    uint256 baseSupply = effectiveBaseTokenSupply;
    uint256 currentBaseSupply = _scaleUp(baseBalance - pendingRewards);
    if (currentBaseSupply > baseSupply) {
      unchecked {
        pendingRewards += _scaleDown((currentBaseSupply - baseSupply));
      }
    }

    cachedPendingRewardsData = cachedPendingRewardsData.insertUint(pendingRewards, PENDING_REWARDS_OFFSET, 96);
    pendingRewardsData = cachedPendingRewardsData.insertUint(currentTokenRate, LAST_TOKEN_RATE_OFFSET, 96);
  }

  /// @inheritdoc FxBasePool
  function _onFractionalTokenMint(
    address, /*sender*/
    address, /*recipient*/
    uint256 baseSupply,
    uint256 fSupply,
    uint256 xSupply,
    uint256 amount,
    bytes calldata /*userData*/
  )
    internal
    virtual
    override
    returns (
      uint256 amountIn,
      uint256 amountOut,
      uint256 dueProtocolFeeAmount
    )
  {
    (bool isPaused, ) = getMintStatus();
    if (isPaused) {
      revert ErrorFractionalTokenMintPaused();
    }

    SwapState memory state = _getSwapState(Action.MintFractionalToken, baseSupply, fSupply, xSupply);
    uint256 stabilityRatio = getStabilityRatio();
    uint256 mintPauseRatio = getMintPauseRatio();
    (uint256 maxBaseInBeforeStabilityMode, ) = _mintableFractionalTokenToCollateralRatio(state, stabilityRatio);
    uint256 maxBaseInBeforePause;
    // usually `mintPauseRatio` equals to `stabilityRatio`
    if (mintPauseRatio == stabilityRatio) maxBaseInBeforePause = maxBaseInBeforeStabilityMode;
    else {
      (maxBaseInBeforePause, ) = _mintableFractionalTokenToCollateralRatio(state, mintPauseRatio);
    }

    amountIn = amount;
    // @note We actually should consider `maxBaseInBeforePause` with fee, but it is difficult to compute the value
    // when `mintPauseRatio < stabilityRatio`. We simply use `maxBaseInBeforePause` to make code clean. And we can
    // always change the value `mintPauseRatio` slight smaller to achieve the same target.
    if (amountIn > maxBaseInBeforePause) {
      amountIn = maxBaseInBeforePause;
    }
    // early return if cannot mint
    if (amountIn == 0) return (amountIn, amountOut, dueProtocolFeeAmount);

    // Compute protocol fee, We have different fee ratio in stability mode
    unchecked {
      (uint256 feeRatio, int256 deltaFeeRatio) = getMintOrRedeemFeeRatio(false, false);
      dueProtocolFeeAmount = _getMintFee(
        amountIn,
        feeRatio,
        uint256(int256(feeRatio) + deltaFeeRatio),
        maxBaseInBeforeStabilityMode
      );
    }

    // Compute the amount of fractional token to mint
    unchecked {
      amountOut = _mintableFractionalToken(state, amountIn - dueProtocolFeeAmount);
    }
  }

  /// @inheritdoc FxBasePool
  function _onLeveragedTokenMint(
    address, /*sender*/
    address, /*recipient*/
    uint256 baseSupply,
    uint256 fSupply,
    uint256 xSupply,
    uint256 amount,
    bytes calldata /*userData*/
  )
    internal
    virtual
    override
    returns (
      uint256 amountIn,
      uint256 amountOut,
      uint256 dueProtocolFeeAmount,
      uint256 bonusEligibleAmount
    )
  {
    (, bool isPaused) = getMintStatus();
    if (isPaused) {
      revert ErrorLeveragedTokenMintPaused();
    }

    SwapState memory state = _getSwapState(Action.MintFractionalToken, baseSupply, fSupply, xSupply);
    uint256 stabilityRatio = getStabilityRatio();
    (uint256 maxBaseInBeforeStabilityMode, ) = _mintableLeveragedTokenToCollateralRatio(state, stabilityRatio);

    amountIn = amount;
    // Compute protocol fee, We have different fee ratio in stability mode
    unchecked {
      (uint256 feeRatio, int256 deltaFeeRatio) = getMintOrRedeemFeeRatio(false, true);
      dueProtocolFeeAmount = _getMintFee(
        amountIn,
        uint256(int256(feeRatio) + deltaFeeRatio),
        feeRatio,
        maxBaseInBeforeStabilityMode
      );
    }

    // Compute the amount of leveraged token to mint
    unchecked {
      uint256 amountInWithoutFee = amountIn - dueProtocolFeeAmount;
      amountOut = _mintableFractionalToken(state, amountInWithoutFee);
      bonusEligibleAmount = MathUpgradeable.min(amountInWithoutFee, maxBaseInBeforeStabilityMode);
    }
  }

  /// @inheritdoc FxBasePool
  function _onFractionalTokenRedeem(
    address, /*sender*/
    address, /*recipient*/
    uint256 baseSupply,
    uint256 fSupply,
    uint256 xSupply,
    uint256 amount,
    bytes calldata /*userData*/
  )
    internal
    virtual
    override
    returns (
      uint256 amountIn,
      uint256 amountOut,
      uint256 dueProtocolFeeAmount,
      uint256 bonusEligibleAmount
    )
  {
    (bool isPaused, , ) = getRedeemStatus();
    if (isPaused) {
      revert ErrorFractionalTokenRedeemPaused();
    }

    SwapState memory state = _getSwapState(Action.MintFractionalToken, baseSupply, fSupply, xSupply);
    uint256 stabilityRatio = getStabilityRatio();
    (
      uint256 maxEffectiveBaseOut,
      uint256 maxFractionalTokenInBeforeStabilityMode
    ) = _redeemableFractionalTokenToCollateralRatio(state, stabilityRatio);

    amountIn = amount;
    // compute protocol fee ratio
    uint256 protocolFeeRatio;
    unchecked {
      (uint256 feeRatio, int256 deltaFeeRatio) = getMintOrRedeemFeeRatio(true, false);
      protocolFeeRatio = _getRedeemFeeRatio(
        amountIn,
        uint256(int256(feeRatio) + deltaFeeRatio),
        feeRatio,
        maxFractionalTokenInBeforeStabilityMode
      );
    }

    // compute redeem
    uint256[] memory amounts = new uint256[](2);
    amounts[0] = amountIn;
    amountOut = _redeemableBaseToken(state, amounts);
    bonusEligibleAmount = MathUpgradeable.min(amountOut, maxEffectiveBaseOut);

    // deduct protocol fee
    unchecked {
      dueProtocolFeeAmount = (amountOut * protocolFeeRatio) / FEE_PRECISION;
      amountOut -= dueProtocolFeeAmount;
    }
  }

  /// @inheritdoc FxBasePool
  function _onLeveragedTokenRedeem(
    address, /*sender*/
    address, /*recipient*/
    uint256 baseSupply,
    uint256 fSupply,
    uint256 xSupply,
    uint256 amount,
    bytes calldata /*userData*/
  )
    internal
    virtual
    override
    returns (
      uint256 amountIn,
      uint256 amountOut,
      uint256 dueProtocolFeeAmount
    )
  {
    (, bool isPaused, bool isPausedInStabilityMode) = getRedeemStatus();
    if (isPaused) {
      revert ErrorLeveragedTokenRedeemPaused();
    }

    SwapState memory state = _getSwapState(Action.MintFractionalToken, baseSupply, fSupply, xSupply);
    uint256 stabilityRatio = getStabilityRatio();
    (, uint256 maxLeveragedTokenInBeforeStabilityMode) = _redeemableLeveragedTokenToCollateralRatio(
      state,
      stabilityRatio
    );

    // compute real amount in
    amountIn = amount;
    if (isPausedInStabilityMode) {
      uint256 collateralRatio = _collateralRatio(state.baseSupply, state.fSupply, state.xSupply);
      if (collateralRatio <= stabilityRatio) revert ErrorLeveragedTokenRedeemPausedInStabilityMode();

      // @note We actually should consider `maxLeveragedTokenInBeforeStabilityMode` with fee, but it is difficult
      // to compute the value. We simply use `maxLeveragedTokenInBeforeStabilityMode` to make code clean.
      // Also in normal case, The `isPausedInStabilityMode` flag is disabled.
      if (amountIn > maxLeveragedTokenInBeforeStabilityMode) {
        amountIn = maxLeveragedTokenInBeforeStabilityMode;
      }
    }

    // compute protocol fee ratio
    uint256 protocolFeeRatio;
    unchecked {
      (uint256 feeRatio, int256 deltaFeeRatio) = getMintOrRedeemFeeRatio(true, true);
      protocolFeeRatio = _getRedeemFeeRatio(
        amountIn,
        feeRatio,
        uint256(int256(feeRatio) + deltaFeeRatio),
        maxLeveragedTokenInBeforeStabilityMode
      );
    }

    // compute redeem
    uint256[] memory amounts = new uint256[](2);
    amounts[1] = amountIn;
    amountOut = _redeemableBaseToken(state, amounts);

    // deduct protocol fee
    unchecked {
      dueProtocolFeeAmount = (amountOut * protocolFeeRatio) / FEE_PRECISION;
      amountOut -= dueProtocolFeeAmount;
    }
  }

  /// @inheritdoc FxBasePool
  function _onHarvest(
    uint256, /*baseBalance*/
    uint256, /*fSupply*/
    uint256 /*xSupply*/
  ) internal virtual override returns (uint256 harvested) {
    bytes32 cachedPendingRewardsData = pendingRewardsData;
    harvested = cachedPendingRewardsData.decodeUint(PENDING_REWARDS_OFFSET, 96);
    pendingRewardsData = cachedPendingRewardsData.insertUint(0, PENDING_REWARDS_OFFSET, 96);
  }

  /// @dev Internal function to compute the mint fee, both fractional token and leveraged token.
  ///
  /// + If `amountInWithoutFee` is in range `[0, maxBaseInBeforeStabilityMode)`, we apply `feeRatioSmall`.
  /// + If `amountInWithoutFee` is in range `[maxBaseInBeforeStabilityMode, infinity)`, we apply `feeRatioLarge`.
  ///
  /// @param amountInWithFee The amount of effective base token with fee.
  /// @param feeRatioSmall The smaller fee ratio.
  /// @param feeRatioLarge The larger fee ratio.
  /// @param maxBaseInBeforeStabilityMode The amount of effective base token to enter (fractional token) or
  ///        leave (leveraged token) stability mode.
  /// @return dueProtocolFeeAmount The amount of fee should take.
  function _getMintFee(
    uint256 amountInWithFee,
    uint256 feeRatioSmall,
    uint256 feeRatioLarge,
    uint256 maxBaseInBeforeStabilityMode
  ) private pure returns (uint256 dueProtocolFeeAmount) {
    if (maxBaseInBeforeStabilityMode > MAX_BASE_AMOUNT_STABILITY_MODE) {
      revert ErrorOverflow();
    }

    // It is impossible to overflow, so we use `unchecked` here.
    // Reason:
    // + `amountInWithFee` usually fits in range `type(uint128).max`, guaranteed in `FxOmniVault` contract.
    // + We already check the value of `maxBaseInBeforeStabilityMode`.
    unchecked {
      if (maxBaseInBeforeStabilityMode == 0) {
        // This will commonly happen while mint leveraged token.
        dueProtocolFeeAmount = (amountInWithFee * feeRatioLarge) / FEE_PRECISION;
      } else {
        // Here x is the amount of effective base token with fee to enter stability mode
        // x * (1 - feeRatioNormalMode) <= maxBaseInBeforeStabilityMode
        // x <= floor(maxBaseInBeforeStabilityMode / (1 - feeRatioNormalMode))
        uint256 x = (maxBaseInBeforeStabilityMode * FEE_PRECISION) / (FEE_PRECISION - feeRatioSmall);

        // compute fee
        if (amountInWithFee <= x) {
          // This will commonly happen while mint fractional token.
          dueProtocolFeeAmount = (amountInWithFee * feeRatioSmall) / FEE_PRECISION;
        } else {
          dueProtocolFeeAmount = (x * feeRatioSmall) / FEE_PRECISION;
          dueProtocolFeeAmount += ((amountInWithFee - x) * feeRatioLarge) / FEE_PRECISION;
        }
      }
    }
  }

  /// @dev Internal function to compute the redeem fee ratio, both fractional token and leveraged token.
  ///
  /// + If `amountIn` is in range `[0, maxBaseInBeforeStabilityMode)`, we apply `feeRatioSmall`.
  /// + If `amountIn` is in range `[maxBaseInBeforeStabilityMode, infinity)`, we apply `feeRatioLarge`.
  ///
  /// @param amountIn The amount of fractional or leveraged tokens.
  /// @param feeRatioSmall The smaller fee ratio.
  /// @param feeRatioLarge The larger fee ratio.
  /// @param maxInBeforeStabilityMode The maximum amount of fractional or leveraged tokens can be redeemed
  ///        to enter (leveraged token) or leave (fractional token) stability mode.
  /// @return feeRatio The computed fee ratio for base token redeemed.
  function _getRedeemFeeRatio(
    uint256 amountIn,
    uint256 feeRatioSmall,
    uint256 feeRatioLarge,
    uint256 maxInBeforeStabilityMode
  ) private pure returns (uint256 feeRatio) {
    if (amountIn <= maxInBeforeStabilityMode) {
      return feeRatioSmall;
    }

    // It is impossible to overflow, so we use `unchecked` here.
    unchecked {
      uint256 feeAmount = maxInBeforeStabilityMode * feeRatioSmall;
      feeAmount += (amountIn - maxInBeforeStabilityMode) * feeRatioLarge;
      return feeAmount / amountIn;
    }
  }

  /// @dev Internal function to compute the amount of fractional tokens can be minted before reaching the
  ///      target collateral ratio. If the current collateral ratio is smaller than or equals to target
  ///      collateral ratio, we should return 0.
  /// @param state The current `SwapState` struct.
  /// @param targetCollateralRatio The target collateral ratio, multiplied by 1e18.
  /// @return baseTokenIn The amount of effective base token needed.
  /// @return fTokenOut The amount of fractional tokens can be minted.
  function _mintableFractionalTokenToCollateralRatio(SwapState memory state, uint256 targetCollateralRatio)
    internal
    view
    virtual
    returns (uint256 baseTokenIn, uint256 fTokenOut);

  /// @dev Internal function to compute the amount of leveraged tokens can be minted before reaching the
  ///      target collateral ratio. If the current collateral ratio is larger than or equals to target
  ///      collateral ratio, we should return 0.
  /// @param state The current `SwapState` struct.
  /// @param targetCollateralRatio The target collateral ratio, multiplied by 1e18.
  /// @return baseTokenIn The amount of effective base token needed.
  /// @return xTokenOut The amount of leveraged tokens can be minted.
  function _mintableLeveragedTokenToCollateralRatio(SwapState memory state, uint256 targetCollateralRatio)
    internal
    view
    virtual
    returns (uint256 baseTokenIn, uint256 xTokenOut);

  /// @dev Internal function to compute the amount of fractional tokens to be redeemed before reaching the
  ///      target collateral ratio. If the current collateral ratio is larger than or equals to target
  ///      collateral ratio, we should return 0.
  /// @param state The current `SwapState` struct.
  /// @param targetCollateralRatio The target collateral ratio, multiplied by 1e18.
  /// @return baseTokenOut The amount of effective base token redeemed.
  /// @return fTokenIn The amount of fractional tokens can be redeemed.
  function _redeemableFractionalTokenToCollateralRatio(SwapState memory state, uint256 targetCollateralRatio)
    internal
    view
    virtual
    returns (uint256 baseTokenOut, uint256 fTokenIn);

  /// @dev Internal function to compute the amount of leveraged tokens to be redeemed before reaching the
  ///      target collateral ratio. If the current collateral ratio is smaller than or equals to target
  ///      collateral ratio, we should return 0.
  /// @param state The current `SwapState` struct.
  /// @param targetCollateralRatio The target collateral ratio, multiplied by 1e18.
  /// @return baseTokenOut The amount of effective base token redeemed.
  /// @return xTokenIn The amount of leveraged tokens can be redeemed.
  function _redeemableLeveragedTokenToCollateralRatio(SwapState memory state, uint256 targetCollateralRatio)
    internal
    view
    virtual
    returns (uint256 baseTokenOut, uint256 xTokenIn);

  /// @dev Internal function to compute the amount of fractional tokens can be minted.
  /// @param state The current `SwapState` struct.
  /// @param amountIn The amount of effective base token.
  /// @return amountOut The amount of fractional tokens minted.
  function _mintableFractionalToken(SwapState memory state, uint256 amountIn)
    internal
    view
    virtual
    returns (uint256 amountOut);

  /// @dev Internal function to compute the amount of leveraged tokens can be minted.
  /// @param state The current `SwapState` struct.
  /// @param amountIn The amount of effective base token.
  /// @return amountOut The amount of leveraged tokens minted.
  function _mintableLeveragedToken(SwapState memory state, uint256 amountIn)
    internal
    view
    virtual
    returns (uint256 amountOut);

  /// @dev Internal function to compute the amount of effective base token can be redeemed.
  /// @param state The current `SwapState` struct.
  /// @param amountsIn The amount of fractional token and leveraged token.
  /// @return amountOut The amount of effective base token redeemed.
  function _redeemableBaseToken(SwapState memory state, uint256[] memory amountsIn)
    internal
    view
    virtual
    returns (uint256 amountOut);
}
