// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import { Math } from "@openzeppelin/contracts/math/Math.sol";

import { FxLSDOracleBase } from "./FxLSDOracleBase.sol";

import { IFxPriceOracle } from "../../../interfaces/f(x)/IFxPriceOracle.sol";
import { IFxRateProvider } from "../../../interfaces/f(x)/IFxRateProvider.sol";
import { ICurvePoolOracle } from "../../../interfaces/ICurvePoolOracle.sol";
import { ITwapOracle } from "../../../price-oracle/interfaces/ITwapOracle.sol";

// solhint-disable var-name-mixedcase

contract FxEzETHTwapOracle is FxLSDOracleBase, IFxPriceOracle {
  /*************
   * Constants *
   *************/

  /// @dev The address of ezETH token.
  address internal constant ezETH = 0xbf5495Efe5DB9ce00f80364C8B423567e58d2110;

  /// @dev The address of ezETH rate provider.
  address internal constant RATE_PROVIDER = 0x387dBc0fB00b26fb085aa658527D5BE98302c84C;

  /// @dev The value of maximum price deviation
  uint256 internal constant MAX_PRICE_DEVIATION = 1e16; // 1%

  /// @notice The address of Curve ezETH/WETH pool.
  address public immutable curvePool;

  /***************
   * Constructor *
   ***************/

  constructor(
    address _curvePool,
    address _uniswapV3Pool,
    address _ethTwapOracle
  ) FxLSDOracleBase(ezETH, _uniswapV3Pool, _ethTwapOracle) {
    curvePool = _curvePool;
  }

  /*************************
   * Public View Functions *
   *************************/

  /// @inheritdoc IFxPriceOracle
  /// @dev The price is valid iff
  ///  1. |Chainlink_ETH_USD - RedStone_ezETH_USDT / ezETH_rate | / Chainlink_ETH_USD < 1%
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
    uint256 ezETH_WETHCurvePrice = _getCurveTwapETHPrice();

    safePrice = ETH_USDChainlinkPrice;
    isValid =
      _isPriceValid(ETH_USDChainlinkPrice, ETH_USDUniswapPrice, MAX_PRICE_DEVIATION) &&
      _isPriceValid(PRECISION, ezETH_WETHCurvePrice, MAX_PRICE_DEVIATION);

    // @note If the price is valid, `minUnsafePrice` and `maxUnsafePrice` should never be used.
    minUnsafePrice = ETH_USDChainlinkPrice;
    maxUnsafePrice = ETH_USDChainlinkPrice;
    if (!isValid) {
      uint256 ezETH_USDCurvePrice = (ezETH_WETHCurvePrice * ETH_USDChainlinkPrice) / PRECISION;
      minUnsafePrice = Math.min(ETH_USDChainlinkPrice, Math.min(ETH_USDUniswapPrice, ezETH_USDCurvePrice));
      maxUnsafePrice = Math.max(ETH_USDChainlinkPrice, Math.max(ETH_USDUniswapPrice, ezETH_USDCurvePrice));
    }
  }

  /**********************
   * Internal Functions *
   **********************/

  /// @dev Internal function to return the ETH price of ezETH.
  function _getCurveTwapETHPrice() internal view returns (uint256) {
    // The first token is ezETH and the price already considered ezETH.rate()
    uint256 price = ICurvePoolOracle(curvePool).price_oracle(0);
    return (PRECISION * PRECISION) / price;
  }
}
