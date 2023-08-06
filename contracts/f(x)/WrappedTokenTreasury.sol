// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import { IRebalancePool } from "./interfaces/IRebalancePool.sol";

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
  function _distributeStabilityPoolRewards(address _token, uint256 _amount) internal override {
    address _stabilityPool = stabilityPool;
    // deposit rewards to stability pool
    _approve(_token, _stabilityPool, _amount);
    IRebalancePool(_stabilityPool).depositReward(_token, _amount);
  }
}
