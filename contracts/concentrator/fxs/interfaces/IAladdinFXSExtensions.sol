// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

interface IAladdinFXSExtensions {
  /// @notice Deposit stkCvxFxs into the contract.
  /// @dev Use `assets=uint256(-1)` if you want to deposit all stkCvxFxs.
  /// @param assets The amount of stkCvxFxs to desposit.
  /// @param receiver The address of account who will receive the pool share.
  /// @return shares The amount of pool shares received.
  function depositWithStkCvxFxs(uint256 assets, address receiver) external returns (uint256 shares);

  /// @notice Deposit FXS into the contract.
  /// @dev Use `assets=uint256(-1)` if you want to deposit all FXS.
  /// @param assets The amount of CRV to desposit.
  /// @param receiver The address of account who will receive the pool share.
  /// @param minShareOut The minimum amount of share to receive.
  /// @return shares The amount of pool shares received.
  function depositWithFXS(
    uint256 assets,
    address receiver,
    uint256 minShareOut
  ) external returns (uint256 shares);
}
