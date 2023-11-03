// SPDX-License-Identifier: MIT

pragma solidity =0.8.20;

contract VestingManagerProxy {
  address public immutable vesting;

  constructor(address _vesting) {
    vesting = _vesting;
  }

  function execute(address target, bytes calldata data) external {
    require(vesting == msg.sender, "caller is not vesting");

    // solhint-disable-next-line avoid-low-level-calls
    (bool success, ) = target.delegatecall(data);
    // below lines will propagate inner error up
    if (!success) {
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
