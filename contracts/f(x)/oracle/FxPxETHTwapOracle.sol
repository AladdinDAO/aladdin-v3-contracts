// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import { Math } from "@openzeppelin/contracts/math/Math.sol";

import { FxLSDOracleBase } from "./FxLSDOracleBase.sol";

import { IFxPriceOracle } from "../../interfaces/f(x)/IFxPriceOracle.sol";
import { ICurvePoolOracle } from "../../interfaces/ICurvePoolOracle.sol";
import { ITwapOracle } from "../../price-oracle/interfaces/ITwapOracle.sol";

// solhint-disable var-name-mixedcase

contract FxPxETHTwapOracle is FxLSDOracleBase, IFxPriceOracle {
  /*************
   * Constants *
   *************/

  /// @dev The address of pxETH token.
  address internal constant pxETH = 0x04C154b66CB340F3Ae24111CC767e0184Ed00Cc6;

  /// @dev The value of maximum price deviation
  uint256 internal constant MAX_PRICE_DEVIATION = 1e16; // 1%

  /// @notice The address of Curve pxETH/stETH pool.
  address public immutable curvePool;

  /// @notice The address of chainlink stETH/USD twap oracle.
  address public immutable stETHTwapOracle;

  /***************
   * Constructor *
   ***************/

  constructor(
    address _curvePool,
    address _stETHTwapOracle,
    address _uniswapV3Pool,
    address _ethTwapOracle
  ) FxLSDOracleBase(pxETH, _uniswapV3Pool, _ethTwapOracle) {
    curvePool = _curvePool;
    stETHTwapOracle = _stETHTwapOracle;
  }

  /*************************
   * Public View Functions *
   *************************/

  /// @inheritdoc IFxPriceOracle
  /// @dev The price is valid iff
  ///  1. |Chainlink_ETH_USD - Uniswap_ETH_USDT| / Chainlink_ETH_USD < 1%
  ///  2. |Curve_pxETH_stETH - 1| < 1%
  function getPrice()
    external
    view
    override
    returns (
      bool isValid,
      uint256 safePrice,
      uint256 minUnsafePrice,
      uint256 maxUnsafePrice
    )
  {
    uint256 ETH_USDChainlinkPrice = _getChainlinkTwapUSDPrice();
    uint256 ETH_USDUniswapPrice = _getUniV3TwapUSDPrice();
    uint256 pxETH_stETHPrice = _getCurveTwapETHPrice();

    safePrice = ETH_USDChainlinkPrice;
    isValid =
      _isPriceValid(ETH_USDChainlinkPrice, ETH_USDUniswapPrice, MAX_PRICE_DEVIATION) &&
      _isPriceValid(PRECISION, pxETH_stETHPrice, MAX_PRICE_DEVIATION);

    // @note If the price is valid, `minUnsafePrice` and `maxUnsafePrice` should never be used.
    // It is safe to assign them with Chainlink ETH/USD price. Thus, we only query for Chainlink
    /// stETH/USD price when the price is invalid.
    minUnsafePrice = ETH_USDChainlinkPrice;
    maxUnsafePrice = ETH_USDChainlinkPrice;
    if (!isValid) {
      uint256 stETH_USDPrice = ITwapOracle(stETHTwapOracle).getTwap(block.timestamp);
      uint256 pxETH_USDPrice = (pxETH_stETHPrice * stETH_USDPrice) / PRECISION;
      minUnsafePrice = Math.min(ETH_USDChainlinkPrice, Math.min(ETH_USDUniswapPrice, pxETH_USDPrice));
      maxUnsafePrice = Math.max(ETH_USDChainlinkPrice, Math.max(ETH_USDUniswapPrice, pxETH_USDPrice));
    }
  }

  /**********************
   * Internal Functions *
   **********************/

  /// @dev Internal function to return the stETH price of pxETH.
  function _getCurveTwapETHPrice() internal view returns (uint256) {
    // The first token is pxETH
    uint256 price = ICurvePoolOracle(curvePool).price_oracle(0);
    return (PRECISION * PRECISION) / price;
  }
}
