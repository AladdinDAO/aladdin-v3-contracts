// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import "./ILiquidityStaking.sol";

interface ICurveGaugeLiquidityStaking is ILiquidityStaking {
  /// @notice The address of staking token.
  function stakingToken() external view returns (address);

  /// @notice Return whether the pool is enabled.
  function enabled() external view returns (bool);

  /// @notice Initialize the contract.
  /// @param _gauge The address of curve gauge.
  function initialize(address _gauge) external;

  /// @notice Enable gauge boosting.
  function enable() external;

  /// @notice Migrate assets to new gauge.
  /// @param _newGauge The address of new gauge.
  function migrateGauge(address _newGauge) external;

  /// @notice Claim gauge rewards from curve gauge.
  /// @param _tokens The list of extra gauge rewards.
  /// @return _amountCRV The amount of CRV claimed.
  /// @return _amounts The list of extra reward amounts claimed.
  function claimRewards(address[] memory _tokens) external returns (uint256 _amountCRV, uint256[] memory _amounts);
}
