// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import { OracleLibrary } from "@uniswap/v3-periphery/contracts/libraries/OracleLibrary.sol";

import { ITwapOracle } from "../../../price-oracle/interfaces/ITwapOracle.sol";

abstract contract FxTwapOracleBase {
  /*************
   * Constants *
   *************/

  /// @dev The precison use to calculation.
  uint256 internal constant PRECISION = 1e18;

  /// @notice The address of base token.
  address public immutable base;

  /// @notice The address of chainlink base/USD twap oracle.
  address public immutable baseTwapOracle;

  /// @notice The address of chainlink ETH/USD twap oracle.
  address public immutable ethTwapOracle;

  /***************
   * Constructor *
   ***************/

  constructor(
    address _base,
    address _baseTwapOracle,
    address _ethTwapOracle
  ) {
    base = _base;
    baseTwapOracle = _baseTwapOracle;
    ethTwapOracle = _ethTwapOracle;
  }

  /**********************
   * Internal Functions *
   **********************/

  /// @dev Internal function to get the base TWAP USD price from chainlink.
  function _getChainlinkBaseTwapUSDPrice() internal view virtual returns (uint256) {
    return ITwapOracle(baseTwapOracle).getTwap(block.timestamp);
  }

  /// @dev Internal function to get the eth TWAP USD price from chainlink.
  function _getChainlinkETHTwapUSDPrice() internal view virtual returns (uint256) {
    return ITwapOracle(ethTwapOracle).getTwap(block.timestamp);
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
