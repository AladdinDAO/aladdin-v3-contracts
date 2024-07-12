// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import { Math } from "@openzeppelin/contracts-v4/utils/math/Math.sol";

import { FxSpotOracleBase } from "./FxSpotOracleBase.sol";

import { IFxPriceOracleV2 } from "../../interfaces/f(x)/IFxPriceOracleV2.sol";
import { ITwapOracle } from "../../price-oracle/interfaces/ITwapOracle.sol";

abstract contract FxERC20OracleBase is FxSpotOracleBase, IFxPriceOracleV2 {
  /*************
   * Constants *
   *************/

  /// @notice The Chainlink ETH/USD price feed.
  /// @dev See comments of `_readSpotPriceByChainlink` for more details.
  bytes32 public immutable Chainlink_ETH_USD_Spot;

  /// @notice The address of the Chainlink ETH/USD Twap.
  address public immutable Chainlink_ETH_USD_Twap;

  /*************
   * Variables *
   *************/

  /// @dev The encodings for ETH/USD spot sources.
  bytes private onchainSpotEncodings_ETHUSD;

  /// @dev The encodings for ERC20/ETH spot sources.
  bytes private onchainSpotEncodings_ERC20ETH;

  /// @dev The encodings for ERC20/USD spot sources.
  bytes private onchainSpotEncodings_ERC20USD;

  /// @notice The value of maximum price deviation, multiplied by 1e18.
  uint256 public maxPriceDeviation;

  /***************
   * Constructor *
   ***************/

  constructor(bytes32 _Chainlink_ETH_USD_Spot, address _Chainlink_ETH_USD_Twap) {
    Chainlink_ETH_USD_Spot = _Chainlink_ETH_USD_Spot;
    Chainlink_ETH_USD_Twap = _Chainlink_ETH_USD_Twap;

    _updateMaxPriceDeviation(1e16); // 1%
  }

  /*************************
   * Public View Functions *
   *************************/

  /// @notice Return the ETH/USD spot price.
  /// @return chainlinkPrice The spot price from Chainlink price feed.
  /// @return minPrice The minimum spot price among all available sources.
  /// @return maxPrice The maximum spot price among all available sources.
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

  /// @notice Return the ETH/USD spot prices.
  /// @return prices The list of spot price among all available sources, multiplied by 1e18.
  function getETHUSDSpotPrices() external view returns (uint256[] memory prices) {
    prices = _getSpotPriceByEncoding(onchainSpotEncodings_ETHUSD);
  }

  /// @notice Return the ERC20/ETH spot prices.
  /// @return prices The list of spot price among all available sources, multiplied by 1e18.
  function getERC20ETHSpotPrices() public view returns (uint256[] memory prices) {
    prices = _getSpotPriceByEncoding(onchainSpotEncodings_ERC20ETH);
  }

  /// @notice Return the ERC20/ETH spot prices.
  /// @return prices The list of spot price among all available sources, multiplied by 1e18.
  function getERC20USDSpotPrices() public view returns (uint256[] memory prices) {
    prices = _getSpotPriceByEncoding(onchainSpotEncodings_ERC20USD);
  }

  /// @notice Return the ETH/USD time-weighted average price.
  /// @return price The time-weighted average price, multiplied by 1e18.
  function getETHUSDTwap() external view returns (uint256 price) {
    price = _getETHUSDTwap();
  }

  /// @notice Return the ERC20/USD time-weighted average price.
  /// @return price The time-weighted average price, multiplied by 1e18.
  function getERC20USDTwap() external view returns (uint256 price) {
    price = _getERC20USDTwap();
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
    twap = _getERC20USDTwap();
    (minPrice, maxPrice) = _getERC20MinMaxPrice(twap);
    unchecked {
      isValid = (maxPrice - minPrice) * PRECISION < maxPriceDeviation * minPrice;
    }
  }

  /************************
   * Restricted Functions *
   ************************/

  /// @notice Update the on-chain spot encodings.
  /// @param encodings The encodings to update. See `_getSpotPriceByEncoding` for more details.
  /// @param spotType The type of the encodings.
  function updateOnchainSpotEncodings(bytes memory encodings, uint256 spotType) external onlyOwner {
    // validate encoding
    uint256[] memory prices = _getSpotPriceByEncoding(encodings);

    if (spotType == 0) {
      onchainSpotEncodings_ETHUSD = encodings;
      if (prices.length == 0) revert ErrorInvalidEncodings();
    } else if (spotType == 1) {
      onchainSpotEncodings_ERC20ETH = encodings;
    } else if (spotType == 2) {
      onchainSpotEncodings_ERC20USD = encodings;
    }
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

  /// @dev Internal function to calculate the ETH/USD spot price.
  /// @return chainlinkPrice The spot price from Chainlink price feed, multiplied by 1e18.
  /// @return minPrice The minimum spot price among all available sources, multiplied by 1e18.
  /// @return maxPrice The maximum spot price among all available sources, multiplied by 1e18.
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

  /// @dev Internal function to return the ETH/USD time-weighted average price.
  /// @return price The time-weighted average price of ETH/USD, multiplied by 1e18.
  function _getETHUSDTwap() internal view returns (uint256 price) {
    price = ITwapOracle(Chainlink_ETH_USD_Twap).getTwap(block.timestamp);
  }

  /// @dev Internal function to return the min/max ERC20/USD prices.
  /// @param twap The ERC20/USD time-weighted average price, multiplied by 1e18.
  /// @return minPrice The minimum price among all available sources (including twap), multiplied by 1e18.
  /// @return maxPrice The maximum price among all available sources (including twap), multiplied by 1e18.
  function _getERC20MinMaxPrice(uint256 twap) internal view returns (uint256 minPrice, uint256 maxPrice) {
    minPrice = maxPrice = twap;
    (, uint256 minETHUSDPrice, uint256 maxETHUSDPrice) = _getETHUSDSpotPrice();
    uint256[] memory ERC20_ETH_prices = getERC20ETHSpotPrices();
    uint256[] memory ERC20_USD_prices = getERC20USDSpotPrices();

    uint256 length = ERC20_ETH_prices.length;
    uint256 ERC20_ETH_minPrice = type(uint256).max;
    uint256 ERC20_ETH_maxPrice;
    unchecked {
      for (uint256 i = 0; i < length; i++) {
        uint256 price = ERC20_ETH_prices[i];
        if (price > ERC20_ETH_maxPrice) ERC20_ETH_maxPrice = price;
        if (price < ERC20_ETH_minPrice) ERC20_ETH_minPrice = price;
      }
      if (ERC20_ETH_maxPrice != 0) {
        minPrice = Math.min(minPrice, (ERC20_ETH_minPrice * minETHUSDPrice) / PRECISION);
        maxPrice = Math.max(maxPrice, (ERC20_ETH_maxPrice * maxETHUSDPrice) / PRECISION);
      }

      length = ERC20_USD_prices.length;
      for (uint256 i = 0; i < length; i++) {
        uint256 price = ERC20_USD_prices[i];
        if (price > maxPrice) maxPrice = price;
        if (price < minPrice) minPrice = price;
      }
    }
  }

  /// @dev Internal function to return the ERC20/USD time-weighted average price.
  /// @return price The time-weighted average price of ERC20/USD, multiplied by 1e18.
  function _getERC20USDTwap() internal view virtual returns (uint256 price);
}
