// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import { SafeERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/SafeERC20Upgradeable.sol";

import { IFxRebalancePoolSplitter } from "../../interfaces/f(x)/IFxRebalancePoolSplitter.sol";
import { ILidoWstETH } from "../../interfaces/ILidoWstETH.sol";

import { HarvestableTreasury } from "../v1/HarvestableTreasury.sol";

// solhint-disable const-name-snakecase
// solhint-disable contract-name-camelcase

contract stETHTreasury is HarvestableTreasury {
  using SafeERC20Upgradeable for IERC20Upgradeable;

  /*************
   * Constants *
   *************/

  /// @dev The address of Lido's stETH token.
  address private constant stETH = 0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84;

  /// @dev The address of Lido's wstETH token.
  address private constant wstETH = 0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0;

  /***************
   * Constructor *
   ***************/

  constructor(uint256 _initialMintRatio) HarvestableTreasury(_initialMintRatio) {}

  /**********************
   * Internal Functions *
   **********************/

  /// @inheritdoc HarvestableTreasury
  function _distributeRebalancePoolRewards(address _token, uint256 _amount) internal override {
    require(_token == stETH, "base token not stETH");

    _approve(stETH, wstETH, _amount);
    _amount = ILidoWstETH(wstETH).wrap(_amount);

    address _rebalancePool = rebalancePool;
    // deposit rewards to rebalance pool
    IERC20Upgradeable(wstETH).safeTransfer(_rebalancePool, _amount);
    IFxRebalancePoolSplitter(_rebalancePool).split(wstETH);
  }
}
