// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import { IFxRebalancePool } from "../interfaces/f(x)/IFxRebalancePool.sol";

import { HarvestableTreasury } from "./HarvestableTreasury.sol";

// solhint-disable const-name-snakecase
// solhint-disable contract-name-camelcase
// solhint-disable no-empty-blocks

contract WrappedTokenTreasury is HarvestableTreasury {
  /***************
   * Constructor *
   ***************/

  constructor(uint256 _initialMintRatio) HarvestableTreasury(_initialMintRatio) {}

  /**********************
   * Internal Functions *
   **********************/

  /// @inheritdoc HarvestableTreasury
  function _distributeRebalancePoolRewards(address _token, uint256 _amount) internal override {
    address _rebalancePool = rebalancePool;
    // deposit rewards to stability pool
    _approve(_token, _rebalancePool, _amount);
    IFxRebalancePool(_rebalancePool).depositReward(_token, _amount);
  }
}
