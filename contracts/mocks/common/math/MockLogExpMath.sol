// SPDX-License-Identifier: MIT

pragma solidity ^0.7.0;

import { LogExpMathV7 } from "../../../common/math/LogExpMathV7.sol";

contract MockLogExpMath {
  function pow(uint256 x, uint256 y) public pure returns (uint256) {
    return LogExpMathV7.pow(x, y);
  }
}
