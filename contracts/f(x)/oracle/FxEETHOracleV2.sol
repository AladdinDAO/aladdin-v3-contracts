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

  /// @dev The address of weETH token.
  address internal constant weETH = 0xCd5fE23C85820F7B72D0926FC9b05b43E359b7ee;

  /// @dev See comments of `_readSpotPriceByChainlink` for more details.
  bytes32 public immutable RedStone_weETH_ETH_Spot;

  /***************
   * Constructor *
   ***************/

  constructor(
    address _spotPriceOracle,
    bytes32 _Chainlink_ETH_USD_Spot,
    address _Chainlink_ETH_USD_Twap,
    bytes32 _RedStone_weETH_ETH_Spot
  ) FxSpotOracleBase(_spotPriceOracle) FxLSDOracleV2Base(_Chainlink_ETH_USD_Spot, _Chainlink_ETH_USD_Twap) {
    RedStone_weETH_ETH_Spot = _RedStone_weETH_ETH_Spot;
  }

  /**********************
   * Internal Functions *
   **********************/

  /// @inheritdoc FxLSDOracleV2Base
  /// @dev [RedStone weETH/ETH spot price] * [Chainlink ETH/USD twap] / weETH.getRate()
  function _getLSDUSDTwapPrice() internal view virtual override returns (uint256) {
    uint256 weETH_ETH_RedStoneSpotPrice = _readSpotPriceByChainlink(RedStone_weETH_ETH_Spot);
    uint256 ETH_USD_ChainlinkTwap = _getETHUSDTwapPrice();
    unchecked {
      return (weETH_ETH_RedStoneSpotPrice * ETH_USD_ChainlinkTwap) / IFxRateProvider(weETH).getRate();
    }
  }
}
