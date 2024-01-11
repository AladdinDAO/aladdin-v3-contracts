// SPDX-License-Identifier: MIT

pragma solidity =0.8.20;

import { ITwapOracle } from "../price-oracle/interfaces/ITwapOracle.sol";
import { IFxPriceOracle } from "../interfaces/f(x)/IFxPriceOracle.sol";

contract MockTwapOracle is ITwapOracle, IFxPriceOracle {
  uint256 public price;

  function setPrice(uint256 _price) external {
    price = _price;
  }

  function getTwap(uint256) external view override returns (uint256) {
    return price;
  }

  function getLatest() external view override returns (uint256) {
    return price;
  }

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
    return (true, price, price, price);
  }
}
