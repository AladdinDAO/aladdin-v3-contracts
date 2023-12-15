// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

interface IFxReservePool {
  /// @notice Request bonus token from Reserve Pool.
  /// @param token The address of token to request.
  /// @param receiver The address recipient for the bonus token.
  /// @param originalAmount The original amount of token used.
  /// @param bonus The amount of bonus token received.
  function requestBonus(
    address token,
    address receiver,
    uint256 originalAmount
  ) external returns (uint256 bonus);
}
