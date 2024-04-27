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

  /// @dev See comments of `_readSpotPriceByChainlink` for more details.
  bytes32 public immutable Chainlink_BTC_USD_Spot;

  address public immutable Chainlink_BTC_USD_Twap;

  /*************
   * Variables *
   *************/

  bytes private onchainSpotEncodings_BTCDerivativeUSD;

  uint256 public maxPriceDeviation;

  /***************
   * Constructor *
   ***************/

  constructor(bytes32 _Chainlink_BTC_USD_Spot, address _Chainlink_BTC_USD_Twap) {
    Chainlink_BTC_USD_Spot = _Chainlink_BTC_USD_Spot;
    Chainlink_BTC_USD_Twap = _Chainlink_BTC_USD_Twap;

    _updateMaxPriceDeviation(1e6); // 1%
  }

  /*************************
   * Public View Functions *
   *************************/

  function getBTCDerivativeUSDSpotPrices() public view returns (uint256[] memory) {
    return _getSpotPriceByEncoding(onchainSpotEncodings_BTCDerivativeUSD);
  }

  function getBTCUSDTwapPrice() external view returns (uint256) {
    return _getBTCUSDTwapPrice();
  }

  function getBTCDerivativeUSDTwapPrice() external view returns (uint256) {
    return _getBTCDerivativeUSDTwapPrice();
  }

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
    twap = _getBTCDerivativeUSDTwapPrice();
    (minPrice, maxPrice) = _getBTCDerivativeMinMaxPrice(twap, true);
    unchecked {
      isValid = (maxPrice - minPrice) * PRECISION < maxPriceDeviation * minPrice;
    }
  }

  /************************
   * Restricted Functions *
   ************************/

  function updateOnchainSpotEncodings(bytes memory encodings) external onlyOwner {
    // validate encoding
    uint256[] memory prices = _getSpotPriceByEncoding(encodings);
    if (prices.length == 0) revert();

    onchainSpotEncodings_BTCDerivativeUSD = encodings;
  }

  function updateMaxPriceDeviation(uint256 newMaxPriceDeviation) external onlyOwner {
    _updateMaxPriceDeviation(newMaxPriceDeviation);
  }

  /**********************
   * Internal Functions *
   **********************/

  function _updateMaxPriceDeviation(uint256 newMaxPriceDeviation) private {
    maxPriceDeviation = newMaxPriceDeviation;
  }

  function _getBTCUSDSpotPrice()
    internal
    view
    returns (
      uint256 chainlinkPrice,
      uint256 minPrice,
      uint256 maxPrice
    )
  {
    chainlinkPrice = _readSpotPriceByChainlink(Chainlink_BTC_USD_Spot);
    uint256[] memory prices = _getSpotPriceByEncoding(onchainSpotEncodings_BTCDerivativeUSD);
    minPrice = maxPrice = chainlinkPrice;
    for (uint256 i = 0; i < prices.length; i++) {
      if (prices[i] > maxPrice) maxPrice = prices[i];
      if (prices[i] < minPrice) minPrice = prices[i];
    }
  }

  function _getBTCUSDTwapPrice() internal view returns (uint256) {
    return ITwapOracle(Chainlink_BTC_USD_Twap).getTwap(block.timestamp);
  }

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

  function _getBTCDerivativeUSDTwapPrice() internal view virtual returns (uint256);
}
