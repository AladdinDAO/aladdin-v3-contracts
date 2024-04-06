// SPDX-License-Identifier: MIT

pragma solidity =0.8.20;

import { ICrvUSDAmm } from "../interfaces/curve/ICrvUSDAmm.sol";
import { IFxPriceOracle } from "../interfaces/f(x)/IFxPriceOracle.sol";
import { ITwapOracle } from "../price-oracle/interfaces/ITwapOracle.sol";

contract MockTwapOracle is ITwapOracle, IFxPriceOracle, ICrvUSDAmm {
  uint256 public price;
  bool public isValid;

  function setPrice(uint256 _price) external {
    price = _price;
  }

  function setIsValid(bool _isValid) external {
    isValid = _isValid;
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
    return (isValid, price, price, price);
  }

  uint256 rate_mul;

  function set_rate_mul(uint256 _rate_mul) external {
    rate_mul = _rate_mul;
  }

  function get_rate_mul() external view returns (uint256) {
    return rate_mul;
  }
}
