// SPDX-License-Identifier: MIT

pragma solidity =0.8.20;

contract CompounderStrategySweeper {
  /// @notice The address of comounder.
  address public immutable compounder;

  constructor(address _compounder) {
    compounder = _compounder;
  }
}
