// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

// solhint-disable var-name-mixedcase

library AMOMath {
  /// @dev The precision used to compute invariant and sap output.
  uint256 private constant A_PRECISION = 100;

  /// @dev The denominator used to compute swap fee.
  uint256 private constant FEE_DENOMINATOR = 10**10;

  /// @dev The base unit of input amount.
  uint256 internal constant UNIT = 10**9;

  /// @dev Compute invariant for curve stable swap.
  /// See function `get_D` in https://etherscan.io/address/0xf9078fb962a7d13f55d40d49c8aa6472abd1a5a6#code
  /// @param amp The amplification parameter equals: A n^(n-1)
  /// @param x The balance of token0.
  /// @param y The balance of token1.
  function getInvariant(
    uint256 amp,
    uint256 x,
    uint256 y
  ) private pure returns (uint256) {
    // A * (x + y) * n^n + D = A * D * n^n + D^(n+1) / (n^n * x * y)
    // assume amp = A * n^(n-1), then
    // D^3 + (amp * n - 1) * 4xy * D = amp * n * (x + y) * 4 * x * y
    //
    // let f(D) = D^3 + (amp * n - 1) * 4xy * D - amp * n * (x + y) * 4 * x * y
    // f'(D) = 3D^2 + (amp * n - 1) * 4xy
    //
    // D' = D - f(D) / f'(D) =>
    // D' = ((2D^3)/(4xy) + amp * n * (x + y)) / (amp * n - 1 + 3D^2 / (4xy))
    //
    // assume dp = D^3 / (4xy), ann = amp * n, then
    // D' = (2dp + ann * (x + y)) * D / ((ann - 1) * D + 3dp)
    uint256 sum = x + y;
    if (sum == 0) {
      return 0;
    }
    uint256 invariant = sum;
    amp *= 2;
    for (uint256 i = 0; i < 255; i++) {
      uint256 dp = (((invariant * invariant) / x) * invariant) / y / 4;
      uint256 prev_invariant = invariant;
      invariant =
        (((amp * sum) / A_PRECISION + dp * 2) * invariant) /
        (((amp - A_PRECISION) * invariant) / A_PRECISION + 3 * dp);
      if (invariant > prev_invariant) {
        if (invariant - prev_invariant <= 1) {
          return invariant;
        }
      } else {
        if (prev_invariant - invariant <= 1) {
          return invariant;
        }
      }
    }
    revert("invariant not converging");
  }

  /// @dev Compute token output given invariant and balance
  /// @param amp The amplification parameter equals: A n^(n-1)
  /// @param invariant The invariant for curve stable swap.
  /// @param x The balance of input token with input amount.
  function getTokenOut(
    uint256 amp,
    uint256 invariant,
    uint256 x
  ) private pure returns (uint256) {
    // A * (x + y) * n^n + D = A * D * n^n + D^(n+1) / (n^n * x * y) =>
    // y + x + D/(A * n^n) = D + D^(n+1) / (n^(2n) * x * y * A)
    //
    // assume amp = A * n^(n-1), then
    // y^2 + (x + D/(amp * n) - D) * y = D^3 / (4 * x * amp * n)
    //
    // f(y) = y^2 + (x + D/(amp * n) - D) * y - D^3 / (4 * x * amp * n)
    // f'(y) = 2y + (x + D/(amp * n) - D)
    //
    // assume ann = amp * n, b = x + D/ann, c = D^3/(4x * ann)
    // y' = (y^2 + c) / (2y + b - D)
    amp *= 2;
    uint256 b = x + (invariant * A_PRECISION) / amp;
    uint256 c = (invariant * invariant) / (x * 2);
    c = (c * invariant * A_PRECISION) / (amp * 2);

    uint256 y = invariant;
    for (uint256 i = 0; i < 255; i++) {
      uint256 prev_y = y;
      y = (y * y + c) / (2 * y + b - invariant);
      if (y > prev_y) {
        if (y - prev_y <= 1) {
          return y;
        }
      } else {
        if (prev_y - y <= 1) {
          return y;
        }
      }
    }
    revert("y not converging");
  }

  /// @dev Compute the result of add liquidity, including (new_x, new_y, new_minted).
  /// See function `add_liquidity` in https://etherscan.io/address/0xf9078fb962a7d13f55d40d49c8aa6472abd1a5a6#code
  /// @param amp The amplification parameter equals: A n^(n-1)
  /// @param fee The swap fee from curve pool.
  /// @param supply The current total supply of curve pool
  /// @param x The balance of token0.
  /// @param y The balance of token1.
  /// @param dx The input amount of token0.
  /// @param dy The input amount of token1.
  function addLiquidity(
    uint256 amp,
    uint256 fee,
    uint256 supply,
    uint256 x,
    uint256 y,
    uint256 dx,
    uint256 dy
  )
    internal
    pure
    returns (
      uint256,
      uint256,
      uint256
    )
  {
    fee = fee / 2; // the base_fee for each token
    uint256 invariant0 = getInvariant(amp, x, y);

    dx += x;
    dy += y;
    uint256 invariant1 = getInvariant(amp, dx, dy);

    // compute the difference between new balance and ideal balance
    uint256 diff_x = (invariant1 * x) / invariant0;
    uint256 diff_y = (invariant1 * y) / invariant0;
    if (diff_x > dx) {
      diff_x = diff_x - dx;
    } else {
      diff_x = dx - diff_x;
    }
    if (diff_y > dy) {
      diff_y = diff_y - dy;
    } else {
      diff_y = dy - diff_y;
    }

    // compute new balances after fee
    diff_x = (diff_x * fee) / FEE_DENOMINATOR;
    diff_y = (diff_y * fee) / FEE_DENOMINATOR;
    // reuse `x` and `y` for new reserves to avoid stack too deep.
    x = dx - diff_x / 2; // this is real new balance 0
    y = dy - diff_y / 2; // this is real new balance 1

    // compute new minted
    dx -= diff_x;
    dy -= diff_y;
    invariant1 = getInvariant(amp, dx, dy);
    // reuse `supply` as new minted lp to avoid stack too deep
    supply = (supply * (invariant1 - invariant0)) / invariant0;

    return (x, y, supply);
  }

  /// @dev Compute the result of swap
  /// @param amp The amplification parameter equals: A n^(n-1)
  /// @param fee The swap fee from curve pool.
  /// @param x The balance of token0.
  /// @param y The balance of token1.
  /// @param dx The input amount of token0.
  function swap(
    uint256 amp,
    uint256 fee,
    uint256 x,
    uint256 y,
    uint256 dx
  ) internal pure returns (uint256) {
    uint256 invariant = getInvariant(amp, x, y);
    uint256 dy = y - getTokenOut(amp, invariant, x + dx) - 1;
    return dy - (dy * fee) / FEE_DENOMINATOR;
  }
}
