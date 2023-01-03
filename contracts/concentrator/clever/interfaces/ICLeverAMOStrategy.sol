// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import "../../strategies/ConcentratorStrategyBase.sol";

interface ICLeverAMOStrategy is IConcentratorStrategy {
  function strategyBalance() external view returns (uint256);
}
