// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import { IFxBoostableRebalancePool } from "../../interfaces/f(x)/IFxBoostableRebalancePool.sol";

import { ShareableRebalancePoolV2 } from "./ShareableRebalancePoolV2.sol";

contract FxUSDShareableRebalancePool is ShareableRebalancePoolV2 {
  /***************
   * Constructor *
   ***************/

  constructor(
    address _fxn,
    address _ve,
    address _veHelper,
    address _minter
  ) ShareableRebalancePoolV2(_fxn, _ve, _veHelper, _minter) {}

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @inheritdoc IFxBoostableRebalancePool
  function withdraw(uint256 _amount, address _receiver) external override {
    // not allowed to withdraw as fToken in fxUSD.
    // _withdraw(_msgSender(), _amount, _receiver);
  }
}
