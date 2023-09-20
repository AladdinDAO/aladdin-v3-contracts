// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import { IWBETH } from "../../interfaces/IWBETH.sol";
import { IRateProvider } from "../interfaces/IRateProvider.sol";

// solhint-disable contract-name-camelcase

contract wBETHProvider is IRateProvider {
  /// @dev The address of wBETH contract.
  address public immutable wbeth;

  constructor(address _wbeth) {
    wbeth = _wbeth;
  }

  /// @inheritdoc IRateProvider
  function getRate() external view override returns (uint256) {
    return IWBETH(wbeth).exchangeRate();
  }
}
