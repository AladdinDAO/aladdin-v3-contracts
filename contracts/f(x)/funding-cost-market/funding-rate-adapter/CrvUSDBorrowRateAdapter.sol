// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import { AccessControlUpgradeable } from "@openzeppelin/contracts-upgradeable-v4/access/AccessControlUpgradeable.sol";

import { ICrvUSDAmm } from "../../../interfaces/curve/ICrvUSDAmm.sol";

abstract contract CrvUSDBorrowRateAdapter is AccessControlUpgradeable {
  /**********
   * Events *
   **********/

  /// @notice Emitted when the funding cost scale is updated.
  /// @param oldScale The value of previous funding cost scale.
  /// @param newScale The value of current funding cost scale.
  event UpdateFundingCostScale(uint256 oldScale, uint256 newScale);

  /// @notice Emitted when the funding rate snapshot is taken.
  /// @param timestamp The timestamp to capture.
  /// @param borrowIndex The crvUSD borrow index.
  event CaptureFundingRate(uint256 timestamp, uint256 borrowIndex);

  /*************
   * Constants *
   *************/

  /// @dev The precision of borrow rate.
  uint256 private constant PRECISION = 1e18;

  /***********
   * Structs *
   ***********/

  /// @dev The struct for crvUSD borrow rate snapshot.
  /// @param borrowIndex The current borrow index of crvUSD.
  /// @param timestamp The timestamp when the snapshot is taken.
  struct BorrowRateSnapshot {
    // In AggMonetaryPolicy, the maximum apy is 300%. It takes about 34 years to reach `uint128.max` in worse case.
    // So it should be safe to user `uint128` for `borrowIndex`. Here is how 34 years comes from:
    //   + The maximum APR per second is 4.3959106799e-08 because (1+4.3959106799e-08)^(365 * 86400) = 4
    //   + We need to solve the (1+4.3959106799e-08)^(x * 86400 * 365) = 2^128 / 10^18, x = 34.102647135518694.
    uint128 borrowIndex;
    uint128 timestamp;
  }

  /*************
   * Variables *
   *************/

  /// @notice The address of crvUSD AMM.
  address public amm;

  /// @notice The snapshot for crvUSD borrow rate.
  BorrowRateSnapshot public borrowRateSnapshot;

  /// @notice The scale for the funding cost based on crvUSD borrow rate.
  uint256 public fundingCostScale;

  /// @dev Slots for future use.
  uint256[47] private _gap;

  /***************
   * Constructor *
   ***************/

  function __CrvUSDBorrowRateAdaptor_init(address _amm) internal onlyInitializing {
    amm = _amm;

    _updateFundingCostScale(5e17); // 0.5 as initial value
  }

  /*************************
   * Public View Functions *
   *************************/

  /// @notice Return the current funding rate with scale.
  function getFundingRate() public view returns (uint256 _fundingRate) {
    uint256 prevBorrowIndex = borrowRateSnapshot.borrowIndex;
    uint256 newBorrowIndex = ICrvUSDAmm(amm).get_rate_mul();
    _fundingRate = ((newBorrowIndex - uint256(prevBorrowIndex)) * PRECISION) / uint128(prevBorrowIndex);
    _fundingRate = (_fundingRate * fundingCostScale) / PRECISION;
  }

  /************************
   * Restricted Functions *
   ************************/

  /// @notice Internal function update the funding cost scale.
  /// @param _newScale The value of new funding rate scale, multiplied by 1e18.
  function updateFundingCostScale(uint256 _newScale) external onlyRole(DEFAULT_ADMIN_ROLE) {
    _updateFundingCostScale(_newScale);
  }

  /**********************
   * Internal Functions *
   **********************/

  /// @dev Internal function to calculate the funding rate since last snapshot and take snapshot.
  function _captureFundingRate() internal {
    BorrowRateSnapshot memory cachedBorrowRateSnapshot = borrowRateSnapshot;

    uint256 newBorrowIndex = ICrvUSDAmm(amm).get_rate_mul();
    cachedBorrowRateSnapshot.borrowIndex = uint128(newBorrowIndex);
    cachedBorrowRateSnapshot.timestamp = uint128(block.timestamp);
    borrowRateSnapshot = cachedBorrowRateSnapshot;

    emit CaptureFundingRate(block.timestamp, newBorrowIndex);
  }

  /// @dev Internal function update the funding cost scale.
  /// @param _newScale The value of new funding rate scale, multiplied by 1e18.
  function _updateFundingCostScale(uint256 _newScale) internal {
    uint256 _oldScale = fundingCostScale;
    fundingCostScale = _newScale;

    emit UpdateFundingCostScale(_oldScale, _newScale);
  }
}
