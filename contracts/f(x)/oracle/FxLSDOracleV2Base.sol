// SPDX-License-Identifier: MIT

pragma solidity =0.8.20;

import { Math } from "@openzeppelin/contracts-v4/utils/math/Math.sol";

import { FxSpotOracleBase } from "./FxSpotOracleBase.sol";

import { IFxPriceOracleV2 } from "../../interfaces/f(x)/IFxPriceOracleV2.sol";
import { ITwapOracle } from "../../price-oracle/interfaces/ITwapOracle.sol";

abstract contract FxLSDOracleV2Base is FxSpotOracleBase, IFxPriceOracleV2 {
  /*************
   * Constants *
   *************/

  /// @dev See comments of `_readSpotPriceByChainlink` for more details.
  bytes32 public immutable Chainlink_ETH_USD_Spot;

  address public immutable Chainlink_ETH_USD_Twap;

  /*************
   * Variables *
   *************/

  bytes private onchainSpotEncodings_ETHUSD;

  bytes private onchainSpotEncodings_LSDETH;

  bytes private onchainSpotEncodings_LSDUSD;

  uint256 public maxPriceDeviation;

  /***************
   * Constructor *
   ***************/

  constructor(bytes32 _Chainlink_ETH_USD_Spot, address _Chainlink_ETH_USD_Twap) {
    Chainlink_ETH_USD_Spot = _Chainlink_ETH_USD_Spot;
    Chainlink_ETH_USD_Twap = _Chainlink_ETH_USD_Twap;

    _updateMaxPriceDeviation(1e6); // 1%
  }

  /*************************
   * Public View Functions *
   *************************/

  function getETHUSDSpotPrice()
    external
    view
    returns (
      uint256 chainlinkPrice,
      uint256 minPrice,
      uint256 maxPrice
    )
  {
    (chainlinkPrice, minPrice, maxPrice) = _getETHUSDSpotPrice();
  }

  function getETHUSDSpotPrices() external view returns (uint256[] memory) {
    return _getSpotPriceByEncoding(onchainSpotEncodings_ETHUSD);
  }

  function getLSDETHSpotPrices() public view returns (uint256[] memory) {
    return _getSpotPriceByEncoding(onchainSpotEncodings_LSDETH);
  }

  function getLSDUSDSpotPrices() public view returns (uint256[] memory) {
    return _getSpotPriceByEncoding(onchainSpotEncodings_LSDUSD);
  }

  function getETHUSDTwapPrice() external view returns (uint256) {
    return _getETHUSDTwapPrice();
  }

  function getLSDUSDTwapPrice() external view returns (uint256) {
    return _getLSDUSDTwapPrice();
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
    twap = _getLSDUSDTwapPrice();
    (minPrice, maxPrice) = _getLSDMinMaxPrice(twap, true);
    unchecked {
      isValid = (maxPrice - minPrice) * PRECISION < maxPriceDeviation * minPrice;
    }
  }

  /************************
   * Restricted Functions *
   ************************/

  function updateOnchainSpotEncodings(bytes memory encodings, uint256 spotType) external onlyOwner {
    // validate encoding
    uint256[] memory prices = _getSpotPriceByEncoding(encodings);

    if (spotType == 0) {
      onchainSpotEncodings_ETHUSD = encodings;
      if (prices.length == 0) revert();
    } else if (spotType == 1) {
      onchainSpotEncodings_LSDETH = encodings;
    } else if (spotType == 2) {
      onchainSpotEncodings_LSDUSD = encodings;
    }
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

  function _getETHUSDSpotPrice()
    internal
    view
    returns (
      uint256 chainlinkPrice,
      uint256 minPrice,
      uint256 maxPrice
    )
  {
    chainlinkPrice = _readSpotPriceByChainlink(Chainlink_ETH_USD_Spot);
    uint256[] memory prices = _getSpotPriceByEncoding(onchainSpotEncodings_ETHUSD);
    minPrice = maxPrice = chainlinkPrice;
    for (uint256 i = 0; i < prices.length; i++) {
      if (prices[i] > maxPrice) maxPrice = prices[i];
      if (prices[i] < minPrice) minPrice = prices[i];
    }
  }

  function _getETHUSDTwapPrice() internal view returns (uint256) {
    return ITwapOracle(Chainlink_ETH_USD_Twap).getTwap(block.timestamp);
  }

  function _getLSDMinMaxPrice(uint256 twap, bool useETHSpot)
    internal
    view
    returns (uint256 minPrice, uint256 maxPrice)
  {
    minPrice = maxPrice = twap;
    (, uint256 minETHUSDPrice, uint256 maxETHUSDPrice) = _getETHUSDSpotPrice();
    uint256[] memory LSD_ETH_prices = getLSDETHSpotPrices();
    uint256[] memory LSD_USD_prices = getLSDETHSpotPrices();

    uint256 length = LSD_ETH_prices.length;
    uint256 LSD_ETH_minPrice = type(uint256).max;
    uint256 LSD_ETH_maxPrice;
    unchecked {
      for (uint256 i = 0; i < length; i++) {
        uint256 price = LSD_ETH_prices[i];
        if (price > LSD_ETH_maxPrice) LSD_ETH_maxPrice = price;
        if (price < LSD_ETH_minPrice) LSD_ETH_minPrice = price;
      }
      if (LSD_ETH_maxPrice != 0) {
        minPrice = Math.min(minPrice, (LSD_ETH_minPrice * minETHUSDPrice) / PRECISION);
        maxPrice = Math.max(maxPrice, (LSD_ETH_maxPrice * maxETHUSDPrice) / PRECISION);
      }

      length = LSD_USD_prices.length;
      for (uint256 i = 0; i < length; i++) {
        uint256 price = LSD_USD_prices[i];
        if (price > maxPrice) maxPrice = price;
        if (price < minPrice) minPrice = price;
      }

      // take min/max with ETH/USD spot price
      if (useETHSpot) {
        minPrice = Math.min(minPrice, minETHUSDPrice);
        maxPrice = Math.max(maxPrice, maxETHUSDPrice);
      }
    }
  }

  function _getLSDUSDTwapPrice() internal view virtual returns (uint256);
}
