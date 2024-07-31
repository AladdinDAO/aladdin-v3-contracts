// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import { Math } from "@openzeppelin/contracts-v4/utils/math/Math.sol";

import { ICurvePoolOracle } from "../../interfaces/ICurvePoolOracle.sol";

import { FxSpotOracleBase } from "./FxSpotOracleBase.sol";
import { FxLSDOracleV2Base } from "./FxLSDOracleV2Base.sol";

contract FxStETHOracleV2 is FxLSDOracleV2Base {
  /*************
   * Constants *
   *************/

  /// @notice The address of curve ETH/stETH pool.
  address public immutable Curve_ETH_stETH_Pool;

  /***************
   * Constructor *
   ***************/

  constructor(
    address _spotPriceOracle,
    bytes32 _Chainlink_ETH_USD_Spot,
    address _Chainlink_ETH_USD_Twap,
    address _Curve_ETH_stETH_Pool
  ) FxSpotOracleBase(_spotPriceOracle) FxLSDOracleV2Base(_Chainlink_ETH_USD_Spot, _Chainlink_ETH_USD_Twap) {
    Curve_ETH_stETH_Pool = _Curve_ETH_stETH_Pool;
  }

  /**********************
   * Internal Functions *
   **********************/

  /// @inheritdoc FxLSDOracleV2Base
  /// @dev [Curve stETH/ETH ema price] * [Chainlink ETH/USD twap]
  function _getLSDUSDTwap() internal view virtual override returns (uint256) {
    uint256 stETH_ETH_CurveEma = ICurvePoolOracle(Curve_ETH_stETH_Pool).price_oracle();
    uint256 ETH_USD_ChainlinkTwap = _getETHUSDTwap();
    unchecked {
      return (stETH_ETH_CurveEma * ETH_USD_ChainlinkTwap) / PRECISION;
    }
  }
}
