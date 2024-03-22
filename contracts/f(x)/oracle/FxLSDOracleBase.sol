// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import { OracleLibrary } from "@uniswap/v3-periphery/contracts/libraries/OracleLibrary.sol";

import { ITwapOracle } from "../../price-oracle/interfaces/ITwapOracle.sol";

abstract contract FxLSDOracleBase {
  /*************
   * Constants *
   *************/

  /// @dev The precison use to calculation.
  uint256 internal constant PRECISION = 1e18;

  /// @dev Ideal TWAP interval.
  uint32 internal constant TWAP_PERIOD = 30 minutes;

  /// @dev The address of WETH token.
  address internal constant WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;

  /// @dev The address of USDT token.
  address internal constant USDT = 0xdAC17F958D2ee523a2206206994597C13D831ec7;

  /// @notice The address of base token.
  address public immutable base;

  /// @notice The address of Uniswap V3 WETH/USDT pool.
  address public immutable uniswapV3Pool;

  /// @notice The address of chainlink ETH/USD twap oracle.
  address public immutable ethTwapOracle;

  /***************
   * Constructor *
   ***************/

  constructor(
    address _base,
    address _uniswapV3Pool,
    address _ethTwapOracle
  ) {
    base = _base;
    uniswapV3Pool = _uniswapV3Pool;
    ethTwapOracle = _ethTwapOracle;
  }

  /**********************
   * Internal Functions *
   **********************/

  /// @dev Internal function to get the ETH TWAP USD price from chainlink.
  function _getChainlinkTwapUSDPrice() internal view virtual returns (uint256) {
    return ITwapOracle(ethTwapOracle).getTwap(block.timestamp);
  }

  /// @dev Internal function to get the ETH TWAP USD price from Uniswap V3.
  function _getUniV3TwapUSDPrice() internal view returns (uint256) {
    (int24 timeWeightedAverageTick, ) = OracleLibrary.consult(uniswapV3Pool, TWAP_PERIOD);
    uint256 quote = OracleLibrary.getQuoteAtTick(timeWeightedAverageTick, 1 ether, WETH, USDT);
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
