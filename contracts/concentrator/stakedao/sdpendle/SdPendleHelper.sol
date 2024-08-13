// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import { SafeERC20Upgradeable } from "@openzeppelin/contracts-upgradeable-v4/token/ERC20/utils/SafeERC20Upgradeable.sol";
import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable-v4/token/ERC20/IERC20Upgradeable.sol";

import { IStakeDAOPendleDepositor } from "../../../interfaces/stakedao/IStakeDAOPendleDepositor.sol";
import { ICurveFactoryPlainPool } from "../../../interfaces/ICurveFactoryPlainPool.sol";

library SdPendleHelper {
  using SafeERC20Upgradeable for IERC20Upgradeable;

  /*************
   * Constants *
   *************/

  /// @dev The address of PENDLE token.
  address internal constant PENDLE = 0x808507121B80c02388fAd14726482e061B8da827;

  /// @dev The address of sdPENDLE token.
  address internal constant sdPENDLE = 0x5Ea630e00D6eE438d3deA1556A110359ACdc10A9;

  /// @dev The address of sdPENDLE-gauge token.
  address internal constant SD_PENDLE_GAUGE = 0x50DC9aE51f78C593d4138263da7088A973b8184E;

  /// @dev The address of Curve PENDLE/sdPENDLE factory plain pool.
  address internal constant CURVE_POOL = 0x26f3f26F46cBeE59d1F8860865e13Aa39e36A8c0;

  /// @dev The address of StakeDAO's PENDLE => sdPENDLE depositor Contract.
  address internal constant DEPOSITOR = 0xf7F64f63ec693C6a3A79fCe4b222Bca2595cAcEf;

  /// @notice The address of `StakeDAOLockerProxy` contract.
  address internal constant LOCKER = 0x1c0D72a330F2768dAF718DEf8A19BAb019EEAd09;

  /**********************
   * Internal Functions *
   **********************/

  /// @dev Internal function to swap PENDLE to sdPENDLE
  ///
  /// @param _amountIn The amount of PENDLE to swap.
  /// @param _receiver The address of recipient who will receive the sdPENDLE.
  /// @return _amountOut The amount of sdPENDLE received.
  function swapPendleToSdPendle(uint256 _amountIn, address _receiver) internal returns (uint256 _amountOut) {
    // swap to sdPENDLE or stake to sdPENDLE
    uint256 _lockReturn = _amountIn + IStakeDAOPendleDepositor(DEPOSITOR).incentiveToken();
    uint256 _swapReturn = ICurveFactoryPlainPool(CURVE_POOL).get_dy(0, 1, _amountIn);
    if (_lockReturn >= _swapReturn) {
      IERC20Upgradeable(PENDLE).safeApprove(DEPOSITOR, 0);
      IERC20Upgradeable(PENDLE).safeApprove(DEPOSITOR, _amountIn);
      IStakeDAOPendleDepositor(DEPOSITOR).deposit(_amountIn, true, false, _receiver);
      _amountOut = _lockReturn;
    } else {
      IERC20Upgradeable(PENDLE).safeApprove(CURVE_POOL, 0);
      IERC20Upgradeable(PENDLE).safeApprove(CURVE_POOL, _amountIn);
      _amountOut = ICurveFactoryPlainPool(CURVE_POOL).exchange(0, 1, _amountIn, 0, _receiver);
    }
  }
}
