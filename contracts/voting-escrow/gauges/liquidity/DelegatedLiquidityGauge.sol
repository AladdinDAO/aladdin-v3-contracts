// SPDX-License-Identifier: MIT

pragma solidity =0.8.20;

import { LiquidityGauge } from "./LiquidityGauge.sol";

import { IVotingEscrowProxy } from "../../../interfaces/voting-escrow/IVotingEscrowProxy.sol";

contract DelegatedLiquidityGauge is LiquidityGauge {
  /*************
   * Constants *
   *************/

  /// @notice The address of `VotingEscrowProxy` contract.
  address public immutable veProxy;

  /***************
   * Constructor *
   ***************/

  constructor(address _minter, address _veProxy) LiquidityGauge(_minter) {
    veProxy = _veProxy;
  }

  /**********************
   * Internal Functions *
   **********************/

  /// @inheritdoc LiquidityGauge
  function _getUserVeBalance(address _account) internal view virtual override returns (uint256) {
    return IVotingEscrowProxy(veProxy).adjustedVeBalance(_account);
  }
}
