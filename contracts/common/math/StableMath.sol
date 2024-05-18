// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

library StableMath {
  uint256 internal constant AMP_PRECISION = 1e3;

  uint256 internal constant PRECISION = 1e18;

  error ErrorStableInvariantDidntConverge();

  // Computes the invariant given the current balances, using the Newton-Raphson approximation.
  // See: https://github.com/curvefi/curve-contract/blob/b0bbf77f8f93c9c5f4e415bce9cd71f0cdee960e/contracts/pool-templates/base/SwapTemplateBase.vy#L206
  // solhint-disable-previous-line max-line-length
  function calculateInvariant(uint256 amp, uint256[] memory balances) internal pure returns (uint256) {
    /**********************************************************************************************
    // invariant                                                                                 //
    // D = invariant                                                  D^(n+1)                    //
    // A = amplification coefficient      A  n^n S + D = A D n^n + -----------                   //
    // S = sum of balances                                             n^n P                     //
    // P = product of balances                                                                   //
    // n = number of tokens                                                                      //
    **********************************************************************************************/

    // use unchecked to save gas, the correctness is guaranteed by external protocols (curve and balance).
    unchecked {
      uint256 sum = 0; // S in the Curve version
      uint256 numTokens = balances.length;
      for (uint256 i = 0; i < numTokens; i++) {
        sum = sum + balances[i];
      }
      if (sum == 0) {
        return 0;
      }

      uint256 prevInvariant; // Dprev in the Curve version
      uint256 invariant = sum; // D in the Curve version
      uint256 ann = amp * numTokens; // Ann in the Curve version

      for (uint256 i = 0; i < 255; i++) {
        uint256 D_P = invariant;
        for (uint256 j = 0; j < numTokens; j++) {
          D_P = (D_P * invariant) / (balances[j] * numTokens);
        }

        prevInvariant = invariant;
        // (Ann * S / A_PRECISION + D_P * N_COINS) * D / ((Ann - A_PRECISION) * D / A_PRECISION + (N_COINS + 1) * D_P)
        invariant =
          (((ann * sum) / AMP_PRECISION + D_P * numTokens) * invariant) /
          (((ann - AMP_PRECISION) * invariant) / AMP_PRECISION + (numTokens + 1) * D_P);

        if (invariant > prevInvariant) {
          if (invariant - prevInvariant <= 1) {
            return invariant;
          }
        } else if (prevInvariant - invariant <= 1) {
          return invariant;
        }
      }
    }

    revert ErrorStableInvariantDidntConverge();
  }

  /// @dev Compute the spot price for `base/quote`.
  /// Copy from https://github.com/curvefi/stableswap-ng/blob/main/contracts/main/CurveStableSwapNG.vy#L1427
  function calculateSpotPrice(
    uint256 base_index,
    uint256 quote_index,
    uint256 amp,
    uint256 invariant,
    uint256[] memory balances
  ) internal pure returns (uint256) {
    // use unchecked to save gas, the correctness is guaranteed by external protocols (curve and balance).
    unchecked {
      uint256 numTokens = balances.length;
      uint256 ann = amp * numTokens;
      uint256 Dr = invariant / (numTokens**numTokens);

      for (uint256 i = 0; i < numTokens; i++) {
        Dr = (Dr * invariant) / balances[i];
      }
      uint256 xp0_A = (ann * balances[0]) / AMP_PRECISION;

      uint256 base_price = base_index == 0
        ? PRECISION
        : ((10**18 * (xp0_A + (Dr * balances[0]) / balances[base_index])) / (xp0_A + Dr));
      uint256 quote_price = quote_index == 0
        ? PRECISION
        : ((10**18 * (xp0_A + (Dr * balances[0]) / balances[quote_index])) / (xp0_A + Dr));
      return (base_price * PRECISION) / quote_price;
    }
  }
}
