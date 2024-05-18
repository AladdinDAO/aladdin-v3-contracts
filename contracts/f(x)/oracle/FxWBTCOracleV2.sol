// SPDX-License-Identifier: MIT

pragma solidity =0.8.20;

import { Math } from "@openzeppelin/contracts-v4/utils/math/Math.sol";

import { ITwapOracle } from "../../price-oracle/interfaces/ITwapOracle.sol";

import { FxSpotOracleBase } from "./FxSpotOracleBase.sol";
import { FxBTCDerivativeOracleBase } from "./FxBTCDerivativeOracleBase.sol";

contract FxWBTCOracleV2 is FxBTCDerivativeOracleBase {
  /*************
   * Constants *
   *************/

  /// @notice The address of the Chainlink WBTC/BTC Twap.
  address public immutable Chainlink_WBTC_BTC_Twap;

  /***************
   * Constructor *
   ***************/

  constructor(
    address _spotPriceOracle,
    address _Chainlink_BTC_USD_Twap,
    address _Chainlink_WBTC_BTC_Twap
  ) FxSpotOracleBase(_spotPriceOracle) FxBTCDerivativeOracleBase(_Chainlink_BTC_USD_Twap) {
    Chainlink_WBTC_BTC_Twap = _Chainlink_WBTC_BTC_Twap;
  }

  /**********************
   * Internal Functions *
   **********************/

  /// @inheritdoc FxBTCDerivativeOracleBase
  /// @dev [Chainlink BTC/USD twap] * [Chainlink WBTC/BTC twap]
  function _getBTCDerivativeUSDTwapPrice() internal view virtual override returns (uint256) {
    uint256 BTC_USD_ChainlinkTwap = _getBTCUSDTwapPrice();
    uint256 WBTC_BTC_ChainlinkTwap = ITwapOracle(Chainlink_WBTC_BTC_Twap).getTwap(block.timestamp);
    unchecked {
      return (BTC_USD_ChainlinkTwap * WBTC_BTC_ChainlinkTwap) / PRECISION;
    }
  }
}
