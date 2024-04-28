// SPDX-License-Identifier: MIT

pragma solidity =0.8.20;

import { Math } from "@openzeppelin/contracts-v4/utils/math/Math.sol";

import { IFxRateProvider } from "../../interfaces/f(x)/IFxRateProvider.sol";
import { ITwapOracle } from "../../price-oracle/interfaces/ITwapOracle.sol";

import { FxSpotOracleBase } from "./FxSpotOracleBase.sol";
import { FxLSDOracleV2Base } from "./FxLSDOracleV2Base.sol";

contract FxEzETHOracleV2 is FxLSDOracleV2Base {
  /*************
   * Constants *
   *************/

  /// @dev The address of ezETH token.
  address internal constant ezETH = 0xbf5495Efe5DB9ce00f80364C8B423567e58d2110;

  /// @dev The address of ezETH rate provider.
  address internal constant RATE_PROVIDER = 0x387dBc0fB00b26fb085aa658527D5BE98302c84C;

  /// @notice The address of the RedStone ezETH/ETH Twap.
  address public immutable RedStone_ezETH_ETH_Twap;

  /***************
   * Constructor *
   ***************/

  constructor(
    address _spotPriceOracle,
    bytes32 _Chainlink_ETH_USD_Spot,
    address _Chainlink_ETH_USD_Twap,
    address _RedStone_ezETH_ETH_Twap
  ) FxSpotOracleBase(_spotPriceOracle) FxLSDOracleV2Base(_Chainlink_ETH_USD_Spot, _Chainlink_ETH_USD_Twap) {
    RedStone_ezETH_ETH_Twap = _RedStone_ezETH_ETH_Twap;
  }

  /**********************
   * Internal Functions *
   **********************/

  /// @inheritdoc FxLSDOracleV2Base
  /// @dev [RedStone ezETH/ETH twap] * [Chainlink ETH/USD twap] / ezETHRateProvider.getRate()
  function _getLSDUSDTwap() internal view virtual override returns (uint256) {
    uint256 ezETH_ETH_RedStoneTwap = ITwapOracle(RedStone_ezETH_ETH_Twap).getTwap(block.timestamp);
    uint256 ETH_USD_ChainlinkTwap = _getETHUSDTwap();
    unchecked {
      return (ezETH_ETH_RedStoneTwap * ETH_USD_ChainlinkTwap) / IFxRateProvider(RATE_PROVIDER).getRate();
    }
  }
}
