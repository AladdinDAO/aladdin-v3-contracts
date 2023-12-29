// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

interface ISdCrvCompounder {
  /// @notice Deposit sdCRV-gauge into the contract.
  /// @dev Use `assets=uint256(-1)` if you want to deposit all sdCRV-gauge.
  /// @param assets The amount of sdCRV-gauge to desposit.
  /// @param receiver The address of account who will receive the pool share.
  /// @return shares The amount of pool shares received.
  function depositWithGauge(uint256 assets, address receiver) external returns (uint256 shares);

  /// @notice Deposit sdveCRV into the contract.
  /// @dev Use `assets=uint256(-1)` if you want to deposit all sdveCRV.
  /// @param assets The amount of sdveCRV to desposit.
  /// @param receiver The address of account who will receive the pool share.
  /// @return shares The amount of pool shares received.
  function depositWithSdVeCRV(uint256 assets, address receiver) external returns (uint256 shares);

  /// @notice Deposit CRV into the contract.
  /// @dev Use `assets=uint256(-1)` if you want to deposit all CRV.
  /// @param assets The amount of CRV to desposit.
  /// @param receiver The address of account who will receive the pool share.
  /// @param _minShareOut The minimum amount of share to receive.
  /// @return shares The amount of pool shares received.
  function depositWithCRV(
    uint256 assets,
    address receiver,
    uint256 _minShareOut
  ) external returns (uint256 shares);
}
