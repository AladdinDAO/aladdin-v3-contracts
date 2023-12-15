// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import { IFxRateProvider } from "../../interfaces/f(x)/IFxRateProvider.sol";
import { IWBETH } from "../../interfaces/IWBETH.sol";

// solhint-disable contract-name-camelcase

contract wBETHProvider is IFxRateProvider {
  /// @dev The address of wBETH contract.
  address public immutable wbeth;

  constructor(address _wbeth) {
    wbeth = _wbeth;
  }

  /// @inheritdoc IFxRateProvider
  function getRate() external view override returns (uint256) {
    return IWBETH(wbeth).exchangeRate();
  }
}
