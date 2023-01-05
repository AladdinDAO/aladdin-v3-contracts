// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

// solhint-disable func-name-mixedcase
// solhint-disable var-name-mixedcase

interface ICurveGaugeController {
  /// @notice Allocate voting power for changing pool weights
  /// @param _gauge_addr Gauge which `msg.sender` votes for
  /// @param _user_weight Weight for a gauge in bps (units of 0.01%). Minimal is 0.01%. Ignored if 0
  function vote_for_gauge_weights(address _gauge_addr, uint256 _user_weight) external;
}
