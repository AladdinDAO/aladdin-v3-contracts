// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

/// @dev from: https://etherscan.io/address/0x5a12796f7e7EBbbc8a402667d266d2e65A814042
interface IRenzoOracle {
  /// @dev Given a single token and balance, return value of the asset in underlying currency
  /// The value returned will be denominated in the decimal precision of the lookup oracle
  /// (e.g. a value of 100 would return as 100 * 10^18)
  function lookupTokenValue(address token, uint256 balance) external view returns (uint256);

  /// @dev Given a single token and value, return amount of tokens needed to represent that value
  /// Assumes the token value is already denominated in the same decimal precision as the oracle
  function lookupTokenAmountFromValue(address token, uint256 value) external view returns (uint256);

  // @dev Given list of tokens and balances, return total value (assumes all lookups are denomintated in same underlying currency)
  /// The value returned will be denominated in the decimal precision of the lookup oracle
  /// (e.g. a value of 100 would return as 100 * 10^18)
  function lookupTokenValues(address[] calldata tokens, uint256[] calldata balances) external view returns (uint256);

  /// @dev Given amount of current protocol value, new value being added, and supply of ezETH, determine amount to mint
  /// Values should be denominated in the same underlying currency with the same decimal precision
  function calculateMintAmount(
    uint256 currentValueInProtocol,
    uint256 newValueAdded,
    uint256 existingEzETHSupply
  ) external pure returns (uint256);

  /// @dev Given the amount of ezETH to burn, the supply of ezETH, and the total value in the protocol, determine amount of value to return to user
  function calculateRedeemAmount(
    uint256 ezETHBeingBurned,
    uint256 existingEzETHSupply,
    uint256 currentValueInProtocol
  ) external pure returns (uint256);
}
