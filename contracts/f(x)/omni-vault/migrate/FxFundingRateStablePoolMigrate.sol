// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.25;

import { FxFundingRateStablePool } from "../pool/FxFundingRateStablePool.sol";

import { WordCodec } from "../../../common/codec/WordCodec.sol";
import { MarketWithFundingCost } from "../../funding-cost-market/MarketWithFundingCost.sol";
import { TreasuryWithFundingCost } from "../../funding-cost-market/TreasuryWithFundingCost.sol";

contract FxFundingRateStablePoolMigrate is FxFundingRateStablePool {
  using WordCodec for bytes32;

  /**********
   * Errors *
   **********/

  /// @dev Thrown when migration is failed.
  error ErrorMigrationFailed();

  /***************
   * Constructor *
   ***************/

  constructor(address _vault) FxFundingRateStablePool(_vault) {}

  /************************
   * Restricted Functions *
   ************************/

  /// @notice Migrate from existing btcUSD market.
  function migrate(TreasuryWithFundingCost treasury, MarketWithFundingCost market) external reinitializer(3) {
    // from FxBasePool
    if (baseToken != treasury.baseToken()) revert ErrorMigrationFailed();
    if (fractionalToken != treasury.fToken()) revert ErrorMigrationFailed();
    if (leveragedToken != treasury.xToken()) revert ErrorMigrationFailed();
    if (priceOracle != treasury.priceOracle()) revert ErrorMigrationFailed();
    if (rateProvider != address(0)) revert ErrorMigrationFailed();

    referenceBaseTokenPrice = treasury.referenceBaseTokenPrice();
    effectiveBaseTokenCapacity = treasury.baseTokenCap();
    effectiveBaseTokenSupply = treasury.totalBaseToken();

    bytes32 cachedPendingRewardsData = pendingRewardsData;
    uint256 currentTokenRate = _getRate();
    pendingRewardsData = cachedPendingRewardsData.insertUint(currentTokenRate, LAST_TOKEN_RATE_OFFSET, 96);

    _updateStabilityRatio(market.stabilityRatio());
    _updateMintPauseRatio(market.stabilityRatio());
    (uint256 defaultFee, int256 deltaFee) = market.fTokenMintFeeRatio();
    _updateMintOrRedeemFeeRatio(false, false, defaultFee, deltaFee);
    (defaultFee, deltaFee) = market.xTokenMintFeeRatio();
    _updateMintOrRedeemFeeRatio(false, true, defaultFee, deltaFee);
    (defaultFee, deltaFee) = market.fTokenRedeemFeeRatio();
    _updateMintOrRedeemFeeRatio(true, false, defaultFee, deltaFee);
    (defaultFee, deltaFee) = market.xTokenRedeemFeeRatio();
    _updateMintOrRedeemFeeRatio(true, true, defaultFee, deltaFee);

    // from CrvUSDBorrowRateAdapter
    if (amm != treasury.amm()) revert ErrorMigrationFailed();
    _updateFundingCostScale(treasury.fundingCostScale());
    _captureFundingRate();

    // from FxFundingRateStablePoolMigrate
    fxUSD = market.fxUSD();
  }
}
