// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

interface ILayer2CRVDepositor {
  /// @notice Deposit CRV for aCRV asynchronously in this contract.
  /// @param _amount The amount of CRV to deposit.
  function deposit(uint256 _amount) external;

  /// @notice Withdraw aCRV for CRV asynchronously in this contract.
  /// @param _amount The amount of aCRV to withdraw.
  function withdraw(uint256 _amount) external;

  /// @notice Claim executed aCRV on asynchronous deposit.
  function claimACRV() external;

  /// @notice Claim executed CRV on asynchronous withdraw.
  function claimCRV() external;

  /// @notice Callback function called on failure in AnyswapCall.
  /// @dev This function can only called by AnyCallProxy.
  /// @param _to The target address in original call.
  /// @param _data The calldata pass to target address in original call.
  function anyFallback(address _to, bytes memory _data) external;

  /// @notice Callback function called on success in `deposit`.
  /// @dev This function can only called by AnyCallProxy.
  /// @param _exectionId An unique id to keep track on the deposit operation.
  /// @param _crvAmount The acutal amount of CRV deposited in Layer 1.
  /// @param _acrvAmount The acutal amount of aCRV received in Layer 1.
  /// @param _acrvFee The fee charged on cross chain.
  function finalizeDeposit(
    uint256 _exectionId,
    uint256 _crvAmount,
    uint256 _acrvAmount,
    uint256 _acrvFee
  ) external;

  /// @notice Callback function called on success in `withdraw`.
  /// @dev This function can only called by AnyCallProxy.
  /// @param _exectionId An unique id to keep track on the withdraw operation.
  /// @param _acrvAmount The acutal amount of aCRV to withdraw in Layer 1.
  /// @param _crvAmount The acutal amount of CRV received in Layer 1.
  /// @param _crvFee The fee charged on cross chain.
  function finalizeWithdraw(
    uint256 _exectionId,
    uint256 _acrvAmount,
    uint256 _crvAmount,
    uint256 _crvFee
  ) external;
}
