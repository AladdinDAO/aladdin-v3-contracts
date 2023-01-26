// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

// solhint-disable func-name-mixedcase
// solhint-disable var-name-mixedcase

interface ICurveFeeDistributor {
  function claim() external returns (uint256);

  /// @notice Claim fees for `_addr`
  /// @dev Each call to claim look at a maximum of 50 user veCRV points.
  ///      For accounts with many veCRV related actions, this function
  ///      may need to be called more than once to claim all available
  ///      fees. In the `Claimed` event that fires, if `claim_epoch` is
  ///      less than `max_epoch`, the account may claim again.
  /// @param _addr Address to claim fees for
  /// @return uint256 Amount of fees claimed in the call
  function claim(address _addr) external returns (uint256);
}
