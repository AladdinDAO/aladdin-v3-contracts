// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import { Math } from "@openzeppelin/contracts/math/Math.sol";
import { SafeMath } from "@openzeppelin/contracts/math/SafeMath.sol";

import { IFxPriceOracle } from "../../../interfaces/f(x)/IFxPriceOracle.sol";
import { ICurvePoolOracle } from "../../../interfaces/ICurvePoolOracle.sol";
import { ITwapOracle } from "../../../price-oracle/interfaces/ITwapOracle.sol";

// solhint-disable var-name-mixedcase

contract FxStETHTwapOracle is IFxPriceOracle {
  using SafeMath for uint256;

  /*************
   * Constants *
   *************/

  /// @dev The precison use to calculation.
  uint256 private constant PRECISION = 1e18;

  /// @notice The address of chainlink stETH/USD twap oracle.
  address public immutable chainlinkStETHTwapOracle;

  /// @notice The address of chainlink ETH/USD twap oracle.
  address public immutable chainlinkETHTwapOracle;

  /// @notice The address of curve ETH/stETH pool.
  address public immutable curvePool;

  /***********
   * Structs *
   ***********/

  struct CachedPrice {
    uint256 ETH_USDPrice;
    uint256 stETH_USDPrice;
    uint256 stETH_ETHPrice;
  }

  /***************
   * Constructor *
   ***************/

  constructor(
    address _chainlinkStETHTwapOracle,
    address _chainlinkETHTwapOracle,
    address _curvePool
  ) {
    chainlinkStETHTwapOracle = _chainlinkStETHTwapOracle;
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
    _safePrice = _cached.stETH_USDPrice;
    _minUnsafePrice = Math.min(_cached.ETH_USDPrice, _cached.stETH_USDPrice);
    _maxUnsafePrice = Math.max(_cached.ETH_USDPrice, _cached.stETH_USDPrice);

    if (_cached.stETH_ETHPrice != 0) {
      uint256 _curveStETHPrice = _cached.ETH_USDPrice.mul(_cached.stETH_ETHPrice) / PRECISION;
      if (_curveStETHPrice < _minUnsafePrice) {
        _minUnsafePrice = _curveStETHPrice;
      }
      if (_curveStETHPrice > _maxUnsafePrice) {
        _maxUnsafePrice = _curveStETHPrice;
      }
    }
  }

  /**********************
   * Internal Functions *
   **********************/

  function _fetchPrice() internal view returns (CachedPrice memory _cached) {
    _cached.ETH_USDPrice = ITwapOracle(chainlinkETHTwapOracle).getTwap(block.timestamp);
    _cached.stETH_USDPrice = ITwapOracle(chainlinkStETHTwapOracle).getTwap(block.timestamp);

    if (curvePool != address(0)) {
      _cached.stETH_ETHPrice = ICurvePoolOracle(curvePool).ema_price();
    }
  }

  function _isPriceValid(CachedPrice memory _cached) internal pure returns (bool) {
    uint256 priceDiff;
    if (_cached.ETH_USDPrice > _cached.stETH_USDPrice) {
      priceDiff = _cached.ETH_USDPrice - _cached.stETH_USDPrice;
    } else {
      priceDiff = _cached.stETH_USDPrice - _cached.ETH_USDPrice;
    }

    // |eth_usd_price - steth_usd_price| / steth_usd_price < 1%
    if (priceDiff * 100 >= _cached.stETH_USDPrice) return false;

    if (_cached.stETH_ETHPrice > 0) {
      return 0.99 ether <= _cached.stETH_ETHPrice && _cached.stETH_ETHPrice <= 1.01 ether;
    } else {
      return true;
    }
  }
}
