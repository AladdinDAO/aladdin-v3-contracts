// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

interface IAladdinCompounderExtensions {
  /// @notice Deposit CRV token to this contract
  /// @param _recipient - The address who will receive the aCRV token.
  /// @param _amount - The amount of CRV to deposit.
  /// @return share - The amount of aCRV received.
  function depositWithCRV(address _recipient, uint256 _amount) external returns (uint256 share);
}
