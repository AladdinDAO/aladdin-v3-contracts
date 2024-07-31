// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.25;

import { FxStablePool } from "../pool/FxStablePool.sol";

import { WordCodec } from "../../../common/codec/WordCodec.sol";
import { MarketV2 } from "../../v2/MarketV2.sol";
import { WrappedTokenTreasuryV2 } from "../../v2/WrappedTokenTreasuryV2.sol";

contract FxStablePoolMigrate is FxStablePool {
  using WordCodec for bytes32;

  /**********
   * Errors *
   **********/

  /// @dev Thrown when migration is failed.
  error ErrorMigrationFailed();

  /***************
   * Constructor *
   ***************/

  constructor(address _vault) FxStablePool(_vault) {}

  /************************
   * Restricted Functions *
   ************************/

  /// @notice Migrate from existing fxUSD market.
  function migrate(WrappedTokenTreasuryV2 treasury, MarketV2 market) external reinitializer(2) {
    // from FxBasePool
    if (baseToken != treasury.baseToken()) revert ErrorMigrationFailed();
    if (fractionalToken != treasury.fToken()) revert ErrorMigrationFailed();
    if (leveragedToken != treasury.xToken()) revert ErrorMigrationFailed();
    if (priceOracle != treasury.priceOracle()) revert ErrorMigrationFailed();
    if (rateProvider != treasury.rateProvider()) revert ErrorMigrationFailed();

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

    // from FxStablePoolMigrate
    fxUSD = market.fxUSD();
  }
}
