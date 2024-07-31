// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.7.0 || ^0.8.0;

interface IFxInternalToken {
  /*************************
   * Public View Functions *
   *************************/

  /// @notice Return the address of `FxOmniVault` contract.
  function getVault() external view returns (address);

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @notice Mint some token to someone.
  /// @param to The address of recipient.
  /// @param amount The amount of token to mint.
  function mint(address to, uint256 amount) external;

  /// @notice Burn some token from someone.
  /// @param from The address of owner to burn.
  /// @param amount The amount of token to burn.
  function burn(address from, uint256 amount) external;
}
