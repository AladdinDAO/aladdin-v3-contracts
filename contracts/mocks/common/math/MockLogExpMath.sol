// SPDX-License-Identifier: MIT

pragma solidity ^0.7.0;

import { LogExpMath } from "../../../common/math/LogExpMath.sol";

contract MockLogExpMath {
  function pow(uint256 x, uint256 y) public pure returns (uint256) {
    return LogExpMath.pow(x, y);
  }
}
