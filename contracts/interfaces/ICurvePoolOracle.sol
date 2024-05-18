// SPDX-License-Identifier: MIT

pragma solidity ^0.7.0 || ^0.8.0;

// solhint-disable func-name-mixedcase

interface ICurvePoolOracle {
  /********************
   * Common Functions *
   ********************/

  function ma_exp_time() external view returns (uint256);

  function ma_last_time() external view returns (uint256);

  /***************************
   * Functions of Plain Pool *
   ***************************/

  function get_p() external view returns (uint256);

  function last_price() external view returns (uint256);

  function last_prices() external view returns (uint256);

  function ema_price() external view returns (uint256);

  function price_oracle() external view returns (uint256);

  /************************
   * Functions of NG Pool *
   ************************/

  function get_p(uint256 index) external view returns (uint256);

  /// @notice Returns last price of the coin at index `k` w.r.t the coin
  ///         at index 0.
  /// @dev last_prices returns the quote by the AMM for an infinitesimally small swap
  ///      after the last trade. It is not equivalent to the last traded price, and
  ///      is computed by taking the partial differential of `x` w.r.t `y`. The
  ///      derivative is calculated in `get_p` and then multiplied with price_scale
  ///      to give last_prices.
  /// @param index The index of the coin.
  /// @return uint256 Last logged price of coin.
  function last_price(uint256 index) external view returns (uint256);

  function last_prices(uint256 index) external view returns (uint256);

  function ema_price(uint256 index) external view returns (uint256);

  function price_oracle(uint256 index) external view returns (uint256);
}
