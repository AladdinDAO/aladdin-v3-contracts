// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import { Math } from "@openzeppelin/contracts/math/Math.sol";

import { FxTwapOracleBase } from "./FxTwapOracleBase.sol";

import { IFxPriceOracle } from "../../../interfaces/f(x)/IFxPriceOracle.sol";
import { ICurvePoolOracle } from "../../../interfaces/ICurvePoolOracle.sol";
import { ITwapOracle } from "../../../price-oracle/interfaces/ITwapOracle.sol";

// solhint-disable var-name-mixedcase

contract FxCVXTwapOracle is FxTwapOracleBase, IFxPriceOracle {
  /*************
   * Constants *
   *************/

  /// @dev The address of CVX token.
  address internal constant CVX = 0x4e3FBD56CD56c3e72c1403e103b45Db9da5B9D2B;

  /// @dev The value of maximum price deviation
  uint256 internal constant MAX_PRICE_DEVIATION = 1e16; // 1%

  /// @notice The address of Curve ETH/CVX pool.
  address public immutable curvePool;

  /***************
   * Constructor *
   ***************/

  constructor(
    address _curvePool,
    address _cvxTwapOracle,
    address _ethTwapOracle
  ) FxTwapOracleBase(CVX, _cvxTwapOracle, _ethTwapOracle) {
    curvePool = _curvePool;
  }

  /*************************
   * Public View Functions *
   *************************/

  /// @inheritdoc IFxPriceOracle
  /// @dev The price is valid iff |Chainlink_CVX_USD - Curve_CVX_USD| / Chainlink_CVX_USD < 1%
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
    uint256 CVX_USDChainlinkPrice = _getChainlinkBaseTwapUSDPrice();
    uint256 ETH_USDChainlinkPrice = _getChainlinkETHTwapUSDPrice();
    uint256 CVX_ETHPrice = _getCurveTwapETHPrice();
    uint256 CVX_USDCurvePrice = (ETH_USDChainlinkPrice * CVX_ETHPrice) / PRECISION;

    safePrice = CVX_USDChainlinkPrice;
    isValid = _isPriceValid(CVX_USDChainlinkPrice, CVX_USDCurvePrice, MAX_PRICE_DEVIATION);

    // @note If the price is valid, `minUnsafePrice` and `maxUnsafePrice` should never be used.
    // It is safe to assign them with Chainlink ETH/USD price.
    minUnsafePrice = CVX_USDChainlinkPrice;
    maxUnsafePrice = CVX_USDChainlinkPrice;
    if (!isValid) {
      minUnsafePrice = Math.min(CVX_USDChainlinkPrice, CVX_USDCurvePrice);
      maxUnsafePrice = Math.max(CVX_USDChainlinkPrice, CVX_USDCurvePrice);
    }
  }

  /**********************
   * Internal Functions *
   **********************/

  /// @dev Internal function to return the ETH price of CVX.
  function _getCurveTwapETHPrice() internal view returns (uint256) {
    // The first token is ETH
    uint256 price = ICurvePoolOracle(curvePool).price_oracle();
    return price;
  }
}
