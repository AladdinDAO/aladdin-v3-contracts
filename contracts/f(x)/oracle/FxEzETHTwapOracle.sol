// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import { Math } from "@openzeppelin/contracts/math/Math.sol";

import { FxLSDOracleBase } from "./FxLSDOracleBase.sol";

import { IFxPriceOracle } from "../../interfaces/f(x)/IFxPriceOracle.sol";
import { IFxRateProvider } from "../../interfaces/f(x)/IFxRateProvider.sol";
import { ITwapOracle } from "../../price-oracle/interfaces/ITwapOracle.sol";

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

  /// @notice The address of RedStone ezETH/ETH twap oracle.
  address public immutable ezETHTwapOracle;

  /***************
   * Constructor *
   ***************/

  constructor(address _ezETHTwapOracle, address _ethTwapOracle) FxLSDOracleBase(ezETH, address(0), _ethTwapOracle) {
    ezETHTwapOracle = _ezETHTwapOracle;
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
    uint256 ezETH_ETHRedStonePrice = ITwapOracle(ezETHTwapOracle).getTwap(block.timestamp);
    uint256 ezETH_ETHRate = IFxRateProvider(RATE_PROVIDER).getRate();
    uint256 ezETHUnderlyingPrice = (ezETH_ETHRedStonePrice * ETH_USDChainlinkPrice) / ezETH_ETHRate;

    safePrice = ETH_USDChainlinkPrice;
    isValid = _isPriceValid(ezETHUnderlyingPrice, ETH_USDChainlinkPrice, MAX_PRICE_DEVIATION);

    // @note If the price is valid, `minUnsafePrice` and `maxUnsafePrice` should never be used.
    minUnsafePrice = ETH_USDChainlinkPrice;
    maxUnsafePrice = ETH_USDChainlinkPrice;
    if (!isValid) {
      minUnsafePrice = Math.min(ETH_USDChainlinkPrice, ezETHUnderlyingPrice);
      maxUnsafePrice = Math.max(ETH_USDChainlinkPrice, ezETHUnderlyingPrice);
    }
  }
}
