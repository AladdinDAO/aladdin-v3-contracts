// SPDX-License-Identifier: MIT

pragma solidity =0.8.20;

import { Math } from "@openzeppelin/contracts-v4/utils/math/Math.sol";

import { IFxPriceOracleV2 } from "../../interfaces/f(x)/IFxPriceOracleV2.sol";
import { ICurvePoolOracle } from "../../interfaces/ICurvePoolOracle.sol";

import { FxSpotOracleBase } from "./FxSpotOracleBase.sol";
import { FxBTCDerivativeOracleBase } from "./FxBTCDerivativeOracleBase.sol";

contract FxWBTCOracleV2 is FxBTCDerivativeOracleBase {
  /*************
   * Constants *
   *************/

  /// @dev See comments of `_readSpotPriceByChainlink` for more details.
  bytes32 public immutable Chainlink_WBTC_BTC_Spot;

  /***************
   * Constructor *
   ***************/

  constructor(
    address _spotPriceOracle,
    bytes32 _Chainlink_BTC_USD_Spot,
    address _Chainlink_BTC_USD_Twap,
    bytes32 _Chainlink_WBTC_BTC_Spot
  ) FxSpotOracleBase(_spotPriceOracle) FxBTCDerivativeOracleBase(_Chainlink_BTC_USD_Spot, _Chainlink_BTC_USD_Twap) {
    Chainlink_WBTC_BTC_Spot = _Chainlink_WBTC_BTC_Spot;
  }

  /**********************
   * Internal Functions *
   **********************/

  /// @inheritdoc FxBTCDerivativeOracleBase
  /// @dev [Chainlink BTC/USD twap] * [Chainlink WBTC/BTC spot]
  function _getBTCDerivativeUSDTwapPrice() internal view virtual override returns (uint256) {
    uint256 BTC_USD_ChainlinkTwap = _getBTCUSDTwapPrice();
    uint256 WBTC_BTC_ChainlinkSpotPrice = _readSpotPriceByChainlink(Chainlink_WBTC_BTC_Spot);
    unchecked {
      return (BTC_USD_ChainlinkTwap * WBTC_BTC_ChainlinkSpotPrice) / PRECISION;
    }
  }
}
