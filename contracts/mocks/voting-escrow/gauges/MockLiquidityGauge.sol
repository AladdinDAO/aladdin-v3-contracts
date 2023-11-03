// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { LiquidityGauge } from "../../../voting-escrow/gauges/liquidity/LiquidityGauge.sol";

contract MockLiquidityGauge is LiquidityGauge {
  constructor(address _minter) LiquidityGauge(_minter) {}

  function reentrantCall(bytes calldata _data) external nonReentrant {
    (bool _success, ) = address(this).call(_data);
    // below lines will propagate inner error up
    if (!_success) {
      // solhint-disable-next-line no-inline-assembly
      assembly {
        let ptr := mload(0x40)
        let size := returndatasize()
        returndatacopy(ptr, 0, size)
        revert(ptr, size)
      }
    }
  }
}
