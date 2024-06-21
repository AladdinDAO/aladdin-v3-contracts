// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import { Math } from "@openzeppelin/contracts-v4/utils/math/Math.sol";

import { ITwapOracle } from "../../price-oracle/interfaces/ITwapOracle.sol";
import { ICurvePoolOracle } from "../../interfaces/ICurvePoolOracle.sol";

import { FxSpotOracleBase } from "./FxSpotOracleBase.sol";
import { FxERC20OracleBase } from "./FxERC20OracleBase.sol";

contract FxCVXOracle is FxERC20OracleBase {
  /*************
   * Constants *
   *************/

  /// @notice The address of the Chainlink CVX/USD Twap.
  address public immutable Chainlink_CVX_USD_Twap;

  /***************
   * Constructor *
   ***************/

  constructor(
    address _spotPriceOracle,
    bytes32 _Chainlink_ETH_USD_Spot,
    address _Chainlink_ETH_USD_Twap,
    address _Chainlink_CVX_USD_Twap
  ) FxSpotOracleBase(_spotPriceOracle) FxERC20OracleBase(_Chainlink_ETH_USD_Spot, _Chainlink_ETH_USD_Twap) {
    Chainlink_CVX_USD_Twap = _Chainlink_CVX_USD_Twap;
  }

  /**********************
   * Internal Functions *
   **********************/

  /// @inheritdoc FxERC20OracleBase
  /// @dev [Chainlink CVX/USD twap]
  function _getERC20USDTwap() internal view virtual override returns (uint256) {
    return ITwapOracle(Chainlink_CVX_USD_Twap).getTwap(block.timestamp);
  }
}
