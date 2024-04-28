// SPDX-License-Identifier: MIT

pragma solidity =0.8.20;

import { Math } from "@openzeppelin/contracts-v4/utils/math/Math.sol";

import { IFxRateProvider } from "../../interfaces/f(x)/IFxRateProvider.sol";
import { ITwapOracle } from "../../price-oracle/interfaces/ITwapOracle.sol";

import { FxSpotOracleBase } from "./FxSpotOracleBase.sol";
import { FxLSDOracleV2Base } from "./FxLSDOracleV2Base.sol";

contract FxEETHOracleV2 is FxLSDOracleV2Base {
  /*************
   * Constants *
   *************/

  /// @dev The address of weETH token.
  address internal constant weETH = 0xCd5fE23C85820F7B72D0926FC9b05b43E359b7ee;

  /// @notice The address of the RedStone weETH/ETH Twap.
  address public immutable RedStone_weETH_ETH_Twap;

  /***************
   * Constructor *
   ***************/

  constructor(
    address _spotPriceOracle,
    bytes32 _Chainlink_ETH_USD_Spot,
    address _Chainlink_ETH_USD_Twap,
    address _RedStone_weETH_ETH_Twap
  ) FxSpotOracleBase(_spotPriceOracle) FxLSDOracleV2Base(_Chainlink_ETH_USD_Spot, _Chainlink_ETH_USD_Twap) {
    RedStone_weETH_ETH_Twap = _RedStone_weETH_ETH_Twap;
  }

  /**********************
   * Internal Functions *
   **********************/

  /// @inheritdoc FxLSDOracleV2Base
  /// @dev [RedStone weETH/ETH twap] * [Chainlink ETH/USD twap] / weETH.getRate()
  function _getLSDUSDTwap() internal view virtual override returns (uint256) {
    uint256 weETH_ETH_RedStoneTwap = ITwapOracle(RedStone_weETH_ETH_Twap).getTwap(block.timestamp);
    uint256 ETH_USD_ChainlinkTwap = _getETHUSDTwap();
    unchecked {
      return (weETH_ETH_RedStoneTwap * ETH_USD_ChainlinkTwap) / IFxRateProvider(weETH).getRate();
    }
  }
}
