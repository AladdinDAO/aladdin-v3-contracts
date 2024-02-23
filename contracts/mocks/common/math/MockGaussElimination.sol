// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { GaussElimination } from "../../../common/math/GaussElimination.sol";

contract MockGaussElimination {
  function solve(int256[][] memory a, int256[] memory b) public pure returns (bool, int256[] memory) {
    bool has = GaussElimination.solve(a, b);
    return (has, b);
  }
}
