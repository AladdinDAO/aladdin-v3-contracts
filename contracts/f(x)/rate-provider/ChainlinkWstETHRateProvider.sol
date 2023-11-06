// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import { IFxRateProvider } from "../../interfaces/f(x)/IFxRateProvider.sol";
import { AggregatorV3Interface } from "../../price-oracle/interfaces/AggregatorV3Interface.sol";

// solhint-disable contract-name-camelcase

contract ChainlinkWstETHRateProvider is IFxRateProvider {
  /// @dev The address of Chainlink wstETH-ETH exchange rate.
  address public immutable aggregator;

  constructor(address _aggregator) {
    aggregator = _aggregator;
  }

  /// @inheritdoc IFxRateProvider
  function getRate() external view override returns (uint256) {
    return AggregatorV3Interface(aggregator).latestAnswer();
  }
}
