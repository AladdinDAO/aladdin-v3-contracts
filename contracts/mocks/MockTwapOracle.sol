// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import { ITwapOracle } from "../price-oracle/interfaces/ITwapOracle.sol";

contract MockTwapOracle is ITwapOracle {
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
}
