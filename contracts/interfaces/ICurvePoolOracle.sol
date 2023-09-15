// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

// solhint-disable func-name-mixedcase

interface ICurvePoolOracle {
  function last_price() external view returns (uint256);

  function ema_price() external view returns (uint256);

  function ma_exp_time() external view returns (uint256);

  function ma_last_time() external view returns (uint256);
}
