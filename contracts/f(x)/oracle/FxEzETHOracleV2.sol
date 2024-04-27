// SPDX-License-Identifier: MIT

pragma solidity =0.8.20;

import { Math } from "@openzeppelin/contracts-v4/utils/math/Math.sol";

import { IFxPriceOracleV2 } from "../../interfaces/f(x)/IFxPriceOracleV2.sol";
import { IFxRateProvider } from "../../interfaces/f(x)/IFxRateProvider.sol";
import { ICurvePoolOracle } from "../../interfaces/ICurvePoolOracle.sol";

import { FxSpotOracleBase } from "./FxSpotOracleBase.sol";
import { FxLSDOracleV2Base } from "./FxLSDOracleV2Base.sol";

contract FxEETHOracleV2 is FxLSDOracleV2Base {
  /*************
   * Constants *
   *************/

  /// @dev The address of ezETH token.
  address internal constant ezETH = 0xbf5495Efe5DB9ce00f80364C8B423567e58d2110;

  /// @dev The address of ezETH rate provider.
  address internal constant RATE_PROVIDER = 0x387dBc0fB00b26fb085aa658527D5BE98302c84C;

  /// @dev See comments of `_readSpotPriceByChainlink` for more details.
  bytes32 public immutable RedStone_ezETH_ETH_Spot;

  /***************
   * Constructor *
   ***************/

  constructor(
    address _spotPriceOracle,
    bytes32 _Chainlink_ETH_USD_Spot,
    address _Chainlink_ETH_USD_Twap,
    bytes32 _RedStone_ezETH_ETH_Spot
  ) FxSpotOracleBase(_spotPriceOracle) FxLSDOracleV2Base(_Chainlink_ETH_USD_Spot, _Chainlink_ETH_USD_Twap) {
    RedStone_ezETH_ETH_Spot = _RedStone_ezETH_ETH_Spot;
  }

  /**********************
   * Internal Functions *
   **********************/

  /// @inheritdoc FxLSDOracleV2Base
  /// @dev [RedStone ezETH/ETH spot price] * [Chainlink ETH/USD twap] / ezETHRateProvider.getRate()
  function _getLSDUSDTwapPrice() internal view virtual override returns (uint256) {
    uint256 ezETH_ETH_RedStoneSpotPrice = _readSpotPriceByChainlink(RedStone_ezETH_ETH_Spot);
    uint256 ETH_USD_ChainlinkTwap = _getETHUSDTwapPrice();
    unchecked {
      return (ezETH_ETH_RedStoneSpotPrice * ETH_USD_ChainlinkTwap) / IFxRateProvider(RATE_PROVIDER).getRate();
    }
  }
}
