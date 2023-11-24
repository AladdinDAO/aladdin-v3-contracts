// SPDX-License-Identifier: MIT

pragma solidity ^0.7.0 || ^0.8.0;

import { IConcentratorStrategy } from "../../../interfaces/concentrator/IConcentratorStrategy.sol";

interface ICLeverAMOStrategy is IConcentratorStrategy {
  function strategyBalance() external view returns (uint256);
}
