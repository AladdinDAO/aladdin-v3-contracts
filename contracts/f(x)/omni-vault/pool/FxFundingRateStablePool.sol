// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.25;

import { IFxOmniVault } from "../../../interfaces/f(x)/omni-vault/IFxOmniVault.sol";

import { WordCodec } from "../../../common/codec/WordCodec.sol";
import { CrvUSDBorrowRateAdapter } from "../../funding-cost-market/funding-rate-adapter/CrvUSDBorrowRateAdapter.sol";
import { FxBasePool } from "./FxBasePool.sol";
import { FxStablePool } from "./FxStablePool.sol";

contract FxFundingRateStablePool is FxStablePool, CrvUSDBorrowRateAdapter {
  using WordCodec for bytes32;

  /*************
   * Constants *
   *************/

  /// @dev The maximum value of leverage ratio.
  uint256 internal constant MAX_LEVERAGE_RATIO = 100e18;

  /*************
   * Variables *
   *************/

  /// @dev Slots for future use.
  uint256[50] private _gap;

  /***************
   * Constructor *
   ***************/

  constructor(address _vault) FxStablePool(_vault) {}

  function initializeFxFundingRateStablePool(address _amm) external reinitializer(2) {
    __CrvUSDBorrowRateAdaptor_init(_amm);
  }

  /**********************
   * Internal Functions *
   **********************/

  /// @inheritdoc FxBasePool
  function _beforeMintAndRedeem(
    Action action,
    uint256 baseBalance,
    uint256 fSupply,
    uint256 xSupply
  ) internal virtual override {
    super._beforeMintAndRedeem(action, baseBalance, fSupply, xSupply);

    SwapState memory state = _getSwapState(action, effectiveBaseTokenSupply, fSupply, xSupply);
    uint256 fundingCosts = _getFundingCosts(state);

    bytes32 cachedPendingRewardsData = pendingRewardsData;
    uint256 pendingRewards = cachedPendingRewardsData.decodeUint(PENDING_REWARDS_OFFSET, 96);
    unchecked {
      pendingRewards += _scaleDown(fundingCosts);
    }
    pendingRewardsData = cachedPendingRewardsData.insertUint(pendingRewards, PENDING_REWARDS_OFFSET, 96);
    unchecked {
      effectiveBaseTokenSupply = state.baseSupply - fundingCosts;
    }

    _captureFundingRate();
  }

  /// @inheritdoc FxBasePool
  function _onInitialize(
    address sender,
    address recipient,
    uint256 baseSupply,
    bytes memory userData
  ) internal virtual override returns (uint256 baseNav, uint256[] memory amountsOut) {
    (baseNav, amountsOut) = super._onInitialize(sender, recipient, baseSupply, userData);

    _captureFundingRate();
  }

  /// @inheritdoc FxBasePool
  function _getSwapState(
    Action action,
    uint256 baseSupply,
    uint256 fSupply,
    uint256 xSupply
  ) internal view virtual override returns (SwapState memory state) {
    state = _getSwapState(action, baseSupply, fSupply, xSupply, false);
  }

  /// @inheritdoc FxBasePool
  function _collateralRatio(
    uint256 baseSupply,
    uint256 fSupply,
    uint256 xSupply
  ) internal view virtual override returns (uint256 ratio) {
    if (borrowRateSnapshot.timestamp == block.timestamp) {
      return super._collateralRatio(baseSupply, fSupply, xSupply);
    }

    unchecked {
      if (fSupply == 0) return PRECISION * PRECISION;
      if (baseSupply == 0) return PRECISION;
    }

    SwapState memory state = _getSwapState(Action.None, baseSupply, fSupply, xSupply);
    uint256 fundingCosts = _getFundingCosts(state);
    unchecked {
      ratio = ((baseSupply - fundingCosts) * state.baseNav) / fSupply;
    }
  }

  /// @inheritdoc FxBasePool
  function _getFractionalTokenNetAssetValue() internal view virtual override returns (uint256 nav) {
    uint256 baseSupply = effectiveBaseTokenSupply;
    uint256[] memory balances = IFxOmniVault(vault).getPoolBalances(address(this));
    uint256 fSupply = balances[1];
    uint256 xSupply = balances[2];

    SwapState memory state = _getSwapState(Action.None, baseSupply, fSupply, xSupply, true);
    uint256 fundingCosts = _getFundingCosts(state);
    baseSupply -= fundingCosts;

    uint256 baseVal = baseSupply * state.baseNav;
    if (baseVal <= fSupply * PRECISION) {
      nav = baseVal / fSupply;
    } else {
      nav = PRECISION;
    }
  }

  /// @inheritdoc FxBasePool
  function _getLeveragedTokenNetAssetValue() internal view virtual override returns (uint256 nav) {
    uint256 baseSupply = effectiveBaseTokenSupply;
    uint256[] memory balances = IFxOmniVault(vault).getPoolBalances(address(this));
    uint256 fSupply = balances[1];
    uint256 xSupply = balances[2];

    SwapState memory state = _getSwapState(Action.None, baseSupply, fSupply, xSupply, true);
    uint256 fundingCosts = _getFundingCosts(state);
    baseSupply -= fundingCosts;

    uint256 baseVal = baseSupply * state.baseNav;
    uint256 fVal = fSupply * PRECISION;
    if (baseVal <= fVal) {
      nav = 0;
    } else {
      nav = (baseVal - fVal) / xSupply;
    }
  }

  /// @dev Internal function to compute current leverage ratio for leveraged token.
  ///
  /// @dev We use `baseTwapNav` to compute leverage ratio to avoid manipulation.
  ///
  /// @param baseSupply The supply of effective base token.
  /// @param baseTwapNav The twap nav for effective base token.
  /// @param fSupply The supply for fractional token.
  /// @return ratio The current leverage ratio.
  function _leverageRatio(
    uint256 baseSupply,
    uint256 baseTwapNav,
    uint256 fSupply
  ) internal pure returns (uint256 ratio) {
    // ratio = (1 - rho * beta * (1 + r)) / (1 - rho), and beta = 0
    // ratio = 1 / (1 - rho)
    uint256 rho = (fSupply * PRECISION * PRECISION) / (baseSupply * baseTwapNav);
    if (rho >= PRECISION) {
      // under collateral, assume infinite leverage
      ratio = MAX_LEVERAGE_RATIO;
    } else {
      ratio = (PRECISION * PRECISION) / (PRECISION - rho);
      if (ratio > MAX_LEVERAGE_RATIO) ratio = MAX_LEVERAGE_RATIO;
    }
  }

  /// @dev Internal function to compute the funding costs.
  /// @param state The current `SwapState` struct.
  function _getFundingCosts(SwapState memory state) internal view returns (uint256 fundingCosts) {
    // usually the leverage should always >= 1.0, but if < 1.0, the function will revert.
    uint256 _leverage = _leverageRatio(state.baseSupply, state.baseTwapNav, state.fSupply);
    uint256 _fundingRate = getFundingRate();
    // funding cost = (xToken Value * (leverage - 1) / leverage * funding rate * scale) / baseNav
    fundingCosts = ((state.xNav * state.xSupply * (_leverage - PRECISION)) / _leverage);
    fundingCosts = (fundingCosts * _fundingRate) / PRECISION;
    fundingCosts /= state.baseNav;
  }

  /// @dev Internal function to get the `SwapState` struct for future use.
  /// @param action The current operation we are considering.
  /// @param baseSupply The supply for effective base token.
  /// @param fSupply The supply for fractional token.
  /// @param xSupply The supply for leveraged token.
  /// @param useTwap Whether to use baseTwapNav for baseNav.
  /// @return state The expected `SwapState` struct.
  function _getSwapState(
    Action action,
    uint256 baseSupply,
    uint256 fSupply,
    uint256 xSupply,
    bool useTwap
  ) private view returns (SwapState memory state) {
    (state.baseTwapNav, state.baseNav) = _getPrice(action);
    if (useTwap) state.baseNav = state.baseTwapNav;

    state.baseSupply = baseSupply;
    state.fSupply = fSupply;
    state.xSupply = xSupply;
    state.fNav = PRECISION;

    if (baseSupply == 0) {
      state.xNav = PRECISION;
    } else {
      if (xSupply == 0) {
        // no xToken, treat the nav of xToken as 1.0
        state.xNav = PRECISION;
      } else {
        unchecked {
          uint256 _baseVal = baseSupply * state.baseNav;
          uint256 _fVal = fSupply * PRECISION;
          if (_baseVal > _fVal) {
            state.xNav = (_baseVal - _fVal) / xSupply;
          } else {
            // under collateral
            state.xNav = 0;
          }
        }
      }
    }
  }
}
