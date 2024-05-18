// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import { Math } from "@openzeppelin/contracts/math/Math.sol";
import { SafeMath } from "@openzeppelin/contracts/math/SafeMath.sol";

import { IFxPriceOracle } from "../../../interfaces/f(x)/IFxPriceOracle.sol";
import { ICurvePoolOracle } from "../../../interfaces/ICurvePoolOracle.sol";
import { ITwapOracle } from "../../../price-oracle/interfaces/ITwapOracle.sol";

// solhint-disable var-name-mixedcase

contract FxFrxETHTwapOracle is IFxPriceOracle {
  using SafeMath for uint256;

  /*************
   * Constants *
   *************/

  /// @dev The precison use to calculation.
  uint256 private constant PRECISION = 1e18;

  /// @notice The address of chainlink ETH/USD twap oracle.
  address public immutable chainlinkETHTwapOracle;

  /// @notice The address of curve ETH/frxETH pool.
  address public immutable curvePool;

  /***********
   * Structs *
   ***********/

  struct CachedPrice {
    uint256 ETH_USDPrice;
    uint256 frxETH_USDPrice;
    uint256 frxETH_ETHPrice;
  }

  /***************
   * Constructor *
   ***************/

  constructor(address _chainlinkETHTwapOracle, address _curvePool) {
    chainlinkETHTwapOracle = _chainlinkETHTwapOracle;
    curvePool = _curvePool;
  }

  /*************************
   * Public View Functions *
   *************************/

  /// @inheritdoc IFxPriceOracle
  function getPrice()
    external
    view
    override
    returns (
      bool _isValid,
      uint256 _safePrice,
      uint256 _minUnsafePrice,
      uint256 _maxUnsafePrice
    )
  {
    CachedPrice memory _cached = _fetchPrice();

    _isValid = _isPriceValid(_cached);
    _safePrice = _cached.frxETH_USDPrice;
    _minUnsafePrice = Math.min(_cached.ETH_USDPrice, _cached.frxETH_USDPrice);
    _maxUnsafePrice = Math.max(_cached.ETH_USDPrice, _cached.frxETH_USDPrice);

    uint256 _curveFrxETHPrice = _cached.ETH_USDPrice.mul(_cached.frxETH_ETHPrice) / PRECISION;
    if (_curveFrxETHPrice < _minUnsafePrice) {
      _minUnsafePrice = _curveFrxETHPrice;
    }
    if (_curveFrxETHPrice > _maxUnsafePrice) {
      _maxUnsafePrice = _curveFrxETHPrice;
    }
  }

  /**********************
   * Internal Functions *
   **********************/

  function _fetchPrice() internal view returns (CachedPrice memory _cached) {
    _cached.ETH_USDPrice = ITwapOracle(chainlinkETHTwapOracle).getTwap(block.timestamp);
    _cached.frxETH_ETHPrice = ICurvePoolOracle(curvePool).ema_price();
    _cached.frxETH_USDPrice = (_cached.ETH_USDPrice * _cached.frxETH_ETHPrice) / PRECISION;
  }

  function _isPriceValid(CachedPrice memory _cached) internal pure returns (bool) {
    uint256 priceDiff;
    if (_cached.ETH_USDPrice > _cached.frxETH_USDPrice) {
      priceDiff = _cached.ETH_USDPrice - _cached.frxETH_USDPrice;
    } else {
      priceDiff = _cached.frxETH_USDPrice - _cached.ETH_USDPrice;
    }

    // |eth_usd_price - frxeth_usd_price| / frxeth_usd_price < 1%
    if (priceDiff * 100 >= _cached.frxETH_USDPrice) return false;

    return 0.99 ether <= _cached.frxETH_ETHPrice && _cached.frxETH_ETHPrice <= 1.01 ether;
  }
}
