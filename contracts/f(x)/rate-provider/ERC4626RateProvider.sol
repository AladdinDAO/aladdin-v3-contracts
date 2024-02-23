// SPDX-License-Identifier: MIT

pragma solidity =0.8.20;

import { IERC4626 } from "@openzeppelin/contracts-v4/interfaces/IERC4626.sol";

import { IFxRateProvider } from "../../interfaces/f(x)/IFxRateProvider.sol";

// solhint-disable contract-name-camelcase

contract ERC4626RateProvider is IFxRateProvider {
  /// @dev The address of ERC4626 Vault contract.
  address public immutable vault;

  constructor(address _vault) {
    vault = _vault;
  }

  /// @inheritdoc IFxRateProvider
  function getRate() external view override returns (uint256) {
    return IERC4626(vault).convertToAssets(1 ether);
  }
}
