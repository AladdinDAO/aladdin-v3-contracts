// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

library GaussElimination {
  /// @dev The precision used to compute weight.
  int256 internal constant PRECISION = 1e18;

  /// @dev solve the equation sum a[i][j] * x[j] = b[i], each number has 18 decimal points
  /// @return Whether the equation has unique solution.
  function solve(int256[][] memory a, int256[] memory b) internal pure returns (bool) {
    uint256 n = b.length;
    for (uint256 k = 0; k < n; ++k) {
      uint256 s = k;
      for (uint256 i = k + 1; i < n; ++i) {
        if (a[i][k] != 0) s = i;
      }
      if (a[s][k] == 0) return false;
      if (s != k) {
        (b[s], b[k]) = (b[k], b[s]);
        for (uint256 i = k; i < n; ++i) {
          (a[s][i], a[k][i]) = (a[k][i], a[s][i]);
        }
      }
      for (uint256 j = k + 1; j < n; ++j) {
        int256 t = -(a[j][k] * PRECISION) / a[k][k];
        b[j] += (t * b[k]) / PRECISION;
        for (uint256 i = k + 1; i < n; ++i) {
          a[j][i] += (t * a[k][i]) / PRECISION;
        }
      }
    }
    while (n > 0) {
      uint256 i = n - 1;
      b[i] = (b[i] * PRECISION) / a[i][i];
      for (uint256 j = 0; j < i; ++j) {
        b[j] -= (a[j][i] * b[i]) / PRECISION;
      }
      n = i;
    }
    return true;
  }
}
