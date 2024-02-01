// SPDX-License-Identifier: MIT

pragma solidity =0.8.20;

import { IFxBoostableRebalancePool } from "../../interfaces/f(x)/IFxBoostableRebalancePool.sol";

import { ShareableRebalancePool } from "./ShareableRebalancePool.sol";

contract FxUSDShareableRebalancePool is ShareableRebalancePool {
  /***************
   * Constructor *
   ***************/

  constructor(
    address _fxn,
    address _ve,
    address _veHelper,
    address _minter
  ) ShareableRebalancePool(_fxn, _ve, _veHelper, _minter) {}

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @inheritdoc IFxBoostableRebalancePool
  function withdraw(uint256 _amount, address _receiver) external override {
    // not allowed to withdraw as fToken in fxUSD.
    // _withdraw(_msgSender(), _amount, _receiver);
  }
}
