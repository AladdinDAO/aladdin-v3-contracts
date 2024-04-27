// SPDX-License-Identifier: MIT

pragma solidity =0.8.20;

import { Math } from "@openzeppelin/contracts-v4/utils/math/Math.sol";

import { IFxPriceOracleV2 } from "../../interfaces/f(x)/IFxPriceOracleV2.sol";
import { ICurvePoolOracle } from "../../interfaces/ICurvePoolOracle.sol";

import { FxSpotOracleBase } from "./FxSpotOracleBase.sol";
import { FxLSDOracleV2Base } from "./FxLSDOracleV2Base.sol";

contract FxFrxETHOracleV2 is FxLSDOracleV2Base {
  /*************
   * Constants *
   *************/

  /// @notice The address of curve ETH/frxETH pool.
  address public immutable Curve_ETH_frxETH_Pool;

  /***************
   * Constructor *
   ***************/

  constructor(
    address _spotPriceOracle,
    bytes32 _Chainlink_ETH_USD_Spot,
    address _Chainlink_ETH_USD_Twap,
    address _Curve_ETH_frxETH_Pool
  ) FxSpotOracleBase(_spotPriceOracle) FxLSDOracleV2Base(_Chainlink_ETH_USD_Spot, _Chainlink_ETH_USD_Twap) {
    Curve_ETH_frxETH_Pool = _Curve_ETH_frxETH_Pool;
  }

  /**********************
   * Internal Functions *
   **********************/

  /// @inheritdoc FxLSDOracleV2Base
  /// @dev [Curve frxETH/ETH ema price] * [Chainlink ETH/USD twap]
  function _getLSDUSDTwapPrice() internal view virtual override returns (uint256) {
    uint256 frxETH_ETH_CurveEma = ICurvePoolOracle(Curve_ETH_frxETH_Pool).price_oracle();
    uint256 ETH_USD_ChainlinkTwap = _getETHUSDTwapPrice();
    unchecked {
      return (frxETH_ETH_CurveEma * ETH_USD_ChainlinkTwap) / PRECISION;
    }
  }
}
