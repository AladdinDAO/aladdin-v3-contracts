// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.25;

import { WordCodec } from "../../../common/codec/WordCodec.sol";
import { FxVolatilePool } from "../pool/FxVolatilePool.sol";

interface IVolatileTreasuryLegacy {
  function fToken() external view returns (address);

  function xToken() external view returns (address);

  function lastPermissionedPrice() external view returns (uint256);

  function baseTokenCap() external view returns (uint256);

  function totalBaseToken() external view returns (uint256);
}

interface IVolatileMarketLegacy {
  function marketConfig()
    external
    view
    returns (
      uint64 stabilityRatio,
      uint64 liquidationRatio,
      uint64 selfLiquidationRatio,
      uint64 recapRatio
    );

  function fTokenMintFeeRatio() external view returns (uint128 defaultFeeRatio, int128 extraFeeRatio);

  function xTokenMintFeeRatio() external view returns (uint128 defaultFeeRatio, int128 extraFeeRatio);

  function fTokenRedeemFeeRatio() external view returns (uint128 defaultFeeRatio, int128 extraFeeRatio);

  function xTokenRedeemFeeRatio() external view returns (uint128 defaultFeeRatio, int128 extraFeeRatio);
}

contract FxVolatilePoolMigrate is FxVolatilePool {
  using WordCodec for bytes32;

  /**********
   * Errors *
   **********/

  /// @dev Thrown when migration is failed.
  error ErrorMigrationFailed();

  /*************
   * Constants *
   *************/

  address private constant wstETH = 0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0;

  /***************
   * Constructor *
   ***************/

  constructor(address _vault) FxVolatilePool(_vault) {}

  /************************
   * Restricted Functions *
   ************************/

  /// @notice Migrate from existing fETH/xETH market.
  function migrate(IVolatileTreasuryLegacy treasury, IVolatileMarketLegacy market) external reinitializer(2) {
    // from FxBasePool
    if (baseToken != wstETH) revert ErrorMigrationFailed();
    if (fractionalToken != treasury.fToken()) revert ErrorMigrationFailed();
    if (leveragedToken != treasury.xToken()) revert ErrorMigrationFailed();

    referenceBaseTokenPrice = treasury.lastPermissionedPrice();
    effectiveBaseTokenCapacity = treasury.baseTokenCap();
    effectiveBaseTokenSupply = treasury.totalBaseToken();

    bytes32 cachedPendingRewardsData = pendingRewardsData;
    uint256 currentTokenRate = _getRate();
    pendingRewardsData = cachedPendingRewardsData.insertUint(currentTokenRate, LAST_TOKEN_RATE_OFFSET, 96);

    (uint256 stabilityRatio, , , ) = market.marketConfig();
    _updateStabilityRatio(stabilityRatio);
    _updateMintPauseRatio(stabilityRatio);

    (uint256 defaultFee, int256 deltaFee) = market.fTokenMintFeeRatio();
    _updateMintOrRedeemFeeRatio(false, false, defaultFee, deltaFee);
    (defaultFee, deltaFee) = market.xTokenMintFeeRatio();
    _updateMintOrRedeemFeeRatio(false, true, defaultFee, deltaFee);
    (defaultFee, deltaFee) = market.fTokenRedeemFeeRatio();
    _updateMintOrRedeemFeeRatio(true, false, defaultFee, deltaFee);
    (defaultFee, deltaFee) = market.xTokenRedeemFeeRatio();
    _updateMintOrRedeemFeeRatio(true, true, defaultFee, deltaFee);
  }
}
