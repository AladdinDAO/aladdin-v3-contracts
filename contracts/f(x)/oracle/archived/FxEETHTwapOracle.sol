// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import { Math } from "@openzeppelin/contracts/math/Math.sol";

import { FxLSDOracleBase } from "./FxLSDOracleBase.sol";

import { IFxPriceOracle } from "../../../interfaces/f(x)/IFxPriceOracle.sol";
import { IFxRateProvider } from "../../../interfaces/f(x)/IFxRateProvider.sol";
import { ICurvePoolOracle } from "../../../interfaces/ICurvePoolOracle.sol";
import { ITwapOracle } from "../../../price-oracle/interfaces/ITwapOracle.sol";

// solhint-disable var-name-mixedcase

contract FxEETHTwapOracle is FxLSDOracleBase, IFxPriceOracle {
  /*************
   * Constants *
   *************/

  /// @dev The address of eETH token.
  address internal constant eETH = 0x35fA164735182de50811E8e2E824cFb9B6118ac2;

  /// @dev The address of weETH token.
  address internal constant weETH = 0xCd5fE23C85820F7B72D0926FC9b05b43E359b7ee;

  /// @dev The value of maximum price deviation
  uint256 internal constant MAX_PRICE_DEVIATION = 1e16; // 1%

  /// @notice The address of Curve weETH/WETH pool.
  address public immutable curvePool;

  /***************
   * Constructor *
   ***************/

  constructor(
    address _curvePool,
    address _uniswapV3Pool,
    address _ethTwapOracle
  ) FxLSDOracleBase(eETH, _uniswapV3Pool, _ethTwapOracle) {
    curvePool = _curvePool;
  }

  /*************************
   * Public View Functions *
   *************************/

  /// @inheritdoc IFxPriceOracle
  /// @dev The price is valid iff
  ///  1. |Chainlink_ETH_USD - Uniswap_ETH_USDT| / Chainlink_ETH_USD < 1%
  ///  2. |Curve_weETH_WETH / weETH_index - 1| < 1%
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
    uint256 eETH_WETHPrice = _getCurveTwapETHPrice();

    safePrice = ETH_USDChainlinkPrice;
    isValid =
      _isPriceValid(ETH_USDChainlinkPrice, ETH_USDUniswapPrice, MAX_PRICE_DEVIATION) &&
      _isPriceValid(PRECISION, eETH_WETHPrice, MAX_PRICE_DEVIATION);

    uint256 eETH_USDPrice = (eETH_WETHPrice * ETH_USDChainlinkPrice) / PRECISION;
    minUnsafePrice = Math.min(ETH_USDChainlinkPrice, Math.min(ETH_USDUniswapPrice, eETH_USDPrice));
    maxUnsafePrice = Math.max(ETH_USDChainlinkPrice, Math.max(ETH_USDUniswapPrice, eETH_USDPrice));
  }

  /**********************
   * Internal Functions *
   **********************/

  /// @dev Internal function to return the ETH price of eETH.
  function _getCurveTwapETHPrice() internal view returns (uint256) {
    // The first token is weETH, and the price already consider weETH.rate()
    uint256 price = ICurvePoolOracle(curvePool).price_oracle(0);
    return (PRECISION * PRECISION) / price;
  }
}
