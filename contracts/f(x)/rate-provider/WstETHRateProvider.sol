// SPDX-License-Identifier: MIT

pragma solidity =0.8.20;

import { IFxRateProvider } from "../../interfaces/f(x)/IFxRateProvider.sol";
import { ILidoWstETH } from "../../interfaces/ILidoWstETH.sol";

// solhint-disable contract-name-camelcase

contract WstETHRateProvider is IFxRateProvider {
  /// @dev The address of wstETH contract.
  address public immutable wstETH;

  constructor(address _wstETH) {
    wstETH = _wstETH;
  }

  /// @inheritdoc IFxRateProvider
  function getRate() external view override returns (uint256) {
    return ILidoWstETH(wstETH).stEthPerToken();
  }
}
