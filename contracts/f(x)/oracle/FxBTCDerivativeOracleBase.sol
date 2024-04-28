// SPDX-License-Identifier: MIT

pragma solidity =0.8.20;

import { Math } from "@openzeppelin/contracts-v4/utils/math/Math.sol";

import { FxSpotOracleBase } from "./FxSpotOracleBase.sol";

import { IFxPriceOracleV2 } from "../../interfaces/f(x)/IFxPriceOracleV2.sol";
import { ITwapOracle } from "../../price-oracle/interfaces/ITwapOracle.sol";

abstract contract FxBTCDerivativeOracleBase is FxSpotOracleBase, IFxPriceOracleV2 {
  /*************
   * Constants *
   *************/

  /// @notice The Chainlink BTC/USD price feed.
  /// @dev See comments of `_readSpotPriceByChainlink` for more details.
  bytes32 public immutable Chainlink_BTC_USD_Spot;

  /// @notice The address of the Chainlink BTC/USD Twap.
  address public immutable Chainlink_BTC_USD_Twap;

  /*************
   * Variables *
   *************/

  /// @dev The encodings for BTCDerivative/USD spot sources.
  bytes private onchainSpotEncodings_BTCDerivativeUSD;

  /// @notice The value of maximum price deviation, multiplied by 1e18.
  uint256 public maxPriceDeviation;

  /***************
   * Constructor *
   ***************/

  constructor(bytes32 _Chainlink_BTC_USD_Spot, address _Chainlink_BTC_USD_Twap) {
    Chainlink_BTC_USD_Spot = _Chainlink_BTC_USD_Spot;
    Chainlink_BTC_USD_Twap = _Chainlink_BTC_USD_Twap;

    _updateMaxPriceDeviation(1e16); // 1%
  }

  /*************************
   * Public View Functions *
   *************************/

  /// @notice Return the BTCDerivative/USD spot prices.
  /// @return prices The list of spot price among all available sources, multiplied by 1e18.
  function getBTCDerivativeUSDSpotPrices() public view returns (uint256[] memory prices) {
    prices = _getSpotPriceByEncoding(onchainSpotEncodings_BTCDerivativeUSD);
  }

  /// @notice Return the BTC/USD time-weighted average price.
  /// @return price The time-weighted average price, multiplied by 1e18.
  function getBTCUSDTwapPrice() external view returns (uint256 price) {
    price = _getBTCUSDTwapPrice();
  }

  /// @notice Return the BTCDerivative/USD time-weighted average price.
  /// @return price The time-weighted average price, multiplied by 1e18.
  function getBTCDerivativeUSDTwapPrice() external view returns (uint256 price) {
    price = _getBTCDerivativeUSDTwapPrice();
  }

  /// @inheritdoc IFxPriceOracleV2
  /// @dev The price is valid iff |maxPrice-minPrice|/minPrice < maxPriceDeviation
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
    twap = _getBTCDerivativeUSDTwapPrice();
    (minPrice, maxPrice) = _getBTCDerivativeMinMaxPrice(twap, true);
    unchecked {
      isValid = (maxPrice - minPrice) * PRECISION < maxPriceDeviation * minPrice;
    }
  }

  /************************
   * Restricted Functions *
   ************************/

  /// @notice Update the on-chain spot encodings.
  /// @param encodings The encodings to update. See `_getSpotPriceByEncoding` for more details.
  function updateOnchainSpotEncodings(bytes memory encodings) external onlyOwner {
    // validate encoding
    uint256[] memory prices = _getSpotPriceByEncoding(encodings);
    if (prices.length == 0) revert();

    onchainSpotEncodings_BTCDerivativeUSD = encodings;
  }

  /// @notice Update the value of maximum price deviation.
  /// @param newMaxPriceDeviation The new value of maximum price deviation, multiplied by 1e18.
  function updateMaxPriceDeviation(uint256 newMaxPriceDeviation) external onlyOwner {
    _updateMaxPriceDeviation(newMaxPriceDeviation);
  }

  /**********************
   * Internal Functions *
   **********************/

  /// @dev Internal function to update the value of maximum price deviation.
  /// @param newMaxPriceDeviation The new value of maximum price deviation, multiplied by 1e18.
  function _updateMaxPriceDeviation(uint256 newMaxPriceDeviation) private {
    uint256 oldMaxPriceDeviation = maxPriceDeviation;
    maxPriceDeviation = newMaxPriceDeviation;

    emit UpdateMaxPriceDeviation(oldMaxPriceDeviation, newMaxPriceDeviation);
  }

  /// @dev Internal function to return the BTC/USD time-weighted average price.
  /// @return price The time-weighted average price of BTC/USD, multiplied by 1e18.
  function _getBTCUSDTwapPrice() internal view returns (uint256) {
    return ITwapOracle(Chainlink_BTC_USD_Twap).getTwap(block.timestamp);
  }

  /// @dev Internal function to return the min/max BTCDerivative/USD prices.
  /// @param twap The BTCDerivative/USD time-weighted average price, multiplied by 1e18.
  /// @param useBTCSpot Whether to use BTC/USD spot for BTCDerivative/USD prices.
  /// @return minPrice The minimum price among all available sources (including twap), multiplied by 1e18.
  /// @return maxPrice The maximum price among all available sources (including twap), multiplied by 1e18.
  function _getBTCDerivativeMinMaxPrice(uint256 twap, bool useBTCSpot)
    internal
    view
    returns (uint256 minPrice, uint256 maxPrice)
  {
    minPrice = maxPrice = twap;
    uint256 BTCSpotPrice = _readSpotPriceByChainlink(Chainlink_BTC_USD_Spot);
    uint256[] memory BTCDerivative_USD_prices = getBTCDerivativeUSDSpotPrices();

    uint256 length = BTCDerivative_USD_prices.length;
    for (uint256 i = 0; i < length; i++) {
      uint256 price = BTCDerivative_USD_prices[i];
      if (price > maxPrice) maxPrice = price;
      if (price < minPrice) minPrice = price;
    }

    // take min/max with BTC/USD spot price
    if (useBTCSpot) {
      minPrice = Math.min(minPrice, BTCSpotPrice);
      maxPrice = Math.max(maxPrice, BTCSpotPrice);
    }
  }

  /// @dev Internal function to return the BTCDerivative/USD time-weighted average price.
  /// @return price The time-weighted average price of BTCDerivative/USD, multiplied by 1e18.
  function _getBTCDerivativeUSDTwapPrice() internal view virtual returns (uint256);
}
