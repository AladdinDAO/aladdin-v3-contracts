// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;
pragma abicoder v2;

import "../interfaces/IMulticall.sol";

abstract contract Multicall is IMulticall {
  /// @inheritdoc IMulticall
  function multicall(bytes[] calldata data) external payable override returns (bytes[] memory results) {
    results = new bytes[](data.length);
    for (uint256 i = 0; i < data.length; i++) {
      // solhint-disable-next-line avoid-low-level-calls
      (bool success, bytes memory result) = address(this).delegatecall(data[i]);

      if (!success) {
        // Next 7 lines from https://ethereum.stackexchange.com/a/83577
        // solhint-disable-next-line reason-string
        if (result.length < 68) revert();
        // solhint-disable-next-line no-inline-assembly
        assembly {
          result := add(result, 0x04)
        }
        revert(abi.decode(result, (string)));
      }

      results[i] = result;
    }
  }
}
