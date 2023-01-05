// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import "./ILiquidityStaking.sol";

interface ICrvLockerLiquidityStaking is ILiquidityStaking {
  /// @notice Claim veCRV fees from fee distributor contract.
  /// @param _distributor The address of fee distributor contract.
  function claimFees(address _distributor, address _token) external returns (uint256);
}
