// SPDX-License-Identifier: MIT

pragma solidity =0.8.20;

import { IFxPriceOracleV2 } from "../../interfaces/f(x)/IFxPriceOracleV2.sol";
import { ICurvePoolOracle } from "../../interfaces/ICurvePoolOracle.sol";

import { FxStETHOracleV2 } from "./FxStETHOracleV2.sol";

contract FxStETHOracleV3 is FxStETHOracleV2 {
  /***************
   * Constructor *
   ***************/

  constructor(
    address _spotPriceOracle,
    bytes32 _Chainlink_ETH_USD_Spot,
    address _Chainlink_ETH_USD_Twap,
    address _Curve_ETH_stETH_Pool
  ) FxStETHOracleV2(_spotPriceOracle, _Chainlink_ETH_USD_Spot, _Chainlink_ETH_USD_Twap, _Curve_ETH_stETH_Pool) {}

  /*************************
   * Public View Functions *
   *************************/

  /// @inheritdoc IFxPriceOracleV2
  function getPrice()
    external
    view
    override
    returns (
      bool isValid,
      uint256 twap,
      uint256 minPrice,
      uint256 maxPrice
    )
  {
    twap = _getLSDUSDTwap();
    (minPrice, maxPrice) = _getLSDMinMaxPrice(twap);
    unchecked {
      isValid = (maxPrice - minPrice) * PRECISION < maxPriceDeviation * minPrice;
    }

    // use anchor price when the price deviation between anchor price and min price exceed threshold
    if ((twap - minPrice) * PRECISION > maxPriceDeviation * minPrice) {
      minPrice = twap;
    }

    // use anchor price when the price deviation between anchor price and max price exceed threshold
    if ((maxPrice - twap) * PRECISION > maxPriceDeviation * twap) {
      maxPrice = twap;
    }
  }

  /**********************
   * Internal Functions *
   **********************/

  /// @inheritdoc FxStETHOracleV2
  /// @dev [Curve stETH/ETH ema price] * [Chainlink ETH/USD twap]
  function _getLSDUSDTwap() internal view virtual override returns (uint256) {
    uint256 stETH_ETH_CurveEma = ICurvePoolOracle(Curve_ETH_stETH_Pool).price_oracle();
    uint256 ETH_USD_ChainlinkSpot = _readSpotPriceByChainlink(Chainlink_ETH_USD_Spot);
    unchecked {
      return (stETH_ETH_CurveEma * ETH_USD_ChainlinkSpot) / PRECISION;
    }
  }
}
