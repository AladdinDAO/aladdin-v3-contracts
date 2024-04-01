// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import { Math } from "@openzeppelin/contracts/math/Math.sol";
import { OracleLibrary } from "@uniswap/v3-periphery/contracts/libraries/OracleLibrary.sol";

import { IFxPriceOracle } from "../../interfaces/f(x)/IFxPriceOracle.sol";
import { ITwapOracle } from "../../price-oracle/interfaces/ITwapOracle.sol";

contract FxWBTCTwapOracle is IFxPriceOracle {
  /// @dev Ideal TWAP interval.
  uint32 internal constant TWAP_PERIOD = 30 minutes;

  /// @dev The precison use to calculation.
  uint256 internal constant PRECISION = 1e18;

  /// @dev The value of maximum price deviation
  uint256 internal constant MAX_PRICE_DEVIATION = 1e16; // 1%

  /// @dev The address of WBTC token.
  address internal constant WBTC = 0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599;

  /// @dev The address of USDT token.
  address internal constant USDT = 0xdAC17F958D2ee523a2206206994597C13D831ec7;

  /// @notice The address of Uniswap V3 WBTC/USDT pool.
  address public immutable uniswapV3Pool;

  /// @notice The address of chainlink BTC/USD twap oracle.
  address public immutable BTCUSDTwapOracle;

  /// @notice The address of chainlink WBTC/BTC twap oracle.
  address public immutable WBTCBTCTwapOracle;

  /***************
   * Constructor *
   ***************/

  constructor(
    address _uniswapV3Pool,
    address _BTCUSDTwapOracle,
    address _WBTCBTCTwapOracle
  ) {
    uniswapV3Pool = _uniswapV3Pool;
    BTCUSDTwapOracle = _BTCUSDTwapOracle;
    WBTCBTCTwapOracle = _WBTCBTCTwapOracle;
  }

  /*************************
   * Public View Functions *
   *************************/

  /// @inheritdoc IFxPriceOracle
  function getPrice()
    external
    view
    override
    returns (
      bool _isValid,
      uint256 _safePrice,
      uint256 _minUnsafePrice,
      uint256 _maxUnsafePrice
    )
  {
    uint256 BTC_USDChainlinkPrice = ITwapOracle(BTCUSDTwapOracle).getTwap(block.timestamp);
    uint256 WBTC_BTCChainlinkPrice = ITwapOracle(WBTCBTCTwapOracle).getTwap(block.timestamp);
    uint256 WBTC_USDChainlinkPrice = (WBTC_BTCChainlinkPrice * BTC_USDChainlinkPrice) / PRECISION;
    uint256 WBTC_USDUniswapPrice = _getUniV3TwapUSDPrice();

    _safePrice = WBTC_USDChainlinkPrice;
    _isValid = _isPriceValid(BTC_USDChainlinkPrice, WBTC_USDUniswapPrice, MAX_PRICE_DEVIATION);
    _minUnsafePrice = WBTC_USDChainlinkPrice;
    _maxUnsafePrice = WBTC_USDChainlinkPrice;
    if (!_isValid) {
      _minUnsafePrice = Math.min(WBTC_USDUniswapPrice, WBTC_USDChainlinkPrice);
      _maxUnsafePrice = Math.max(WBTC_USDUniswapPrice, WBTC_USDChainlinkPrice);
    }
  }

  /**********************
   * Internal Functions *
   **********************/

  /// @dev Internal function to get the WBTC TWAP USD price from Uniswap V3.
  function _getUniV3TwapUSDPrice() internal view returns (uint256) {
    (int24 timeWeightedAverageTick, ) = OracleLibrary.consult(uniswapV3Pool, TWAP_PERIOD);
    uint256 quote = OracleLibrary.getQuoteAtTick(timeWeightedAverageTick, 1 ether, WBTC, USDT);
    // decimal of USDT is 6
    return quote * 10**12;
  }

  /// @dev Internal function to determine whether the price is valid.
  /// @param basePrice The base price to validate.
  /// @param comparePrice The price to compare with.
  /// @param deviation The value of maximum allowed price deviation, multipled by 1e18
  function _isPriceValid(
    uint256 basePrice,
    uint256 comparePrice,
    uint256 deviation
  ) internal pure returns (bool) {
    uint256 diff = basePrice > comparePrice ? basePrice - comparePrice : comparePrice - basePrice;
    // |basePrice - comparePrice| / comparePrice < deviation / 1e18
    return diff * PRECISION < deviation * basePrice;
  }
}
