// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import { IRateProvider } from "../interfaces/IRateProvider.sol";
import { AggregatorV3Interface } from "../../price-oracle/interfaces/AggregatorV3Interface.sol";

// solhint-disable contract-name-camelcase

contract ChainlinkWstETHRateProvider is IRateProvider {
  /// @dev The address of Chainlink wstETH-ETH exchange rate.
  address public immutable aggregator;

  constructor(address _aggregator) {
    aggregator = _aggregator;
  }

  /// @inheritdoc IRateProvider
  function getRate() external view override returns (uint256) {
    return AggregatorV3Interface(aggregator).latestAnswer();
  }
}
