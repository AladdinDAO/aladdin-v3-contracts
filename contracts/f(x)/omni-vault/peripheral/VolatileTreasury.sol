// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.25;

import { IFxBasePool } from "../../../interfaces/f(x)/omni-vault/IFxBasePool.sol";
import { FxBasePool } from "../pool/FxBasePool.sol";

contract VolatileTreasury {
  /// @dev The precision used to compute nav.
  uint256 internal constant PRECISION = 1e18;

  address public immutable pool;

  constructor(address _pool) {
    pool = _pool;
  }

  function baseToken() external view returns (address) {
    return IFxBasePool(pool).getBaseToken();
  }

  function fToken() external view returns (address) {
    return IFxBasePool(pool).getFractionalToken();
  }

  function xToken() external view returns (address) {
    return IFxBasePool(pool).getLeveragedToken();
  }

  function priceOracle() external view returns (address) {
    return IFxBasePool(pool).getPriceOracle();
  }

  function referenceBaseTokenPrice() external view returns (uint256) {
    return FxBasePool(pool).referenceBaseTokenPrice();
  }

  function totalBaseToken() external view returns (uint256) {
    return FxBasePool(pool).effectiveBaseTokenSupply();
  }

  function baseTokenCap() external view returns (uint256) {
    return FxBasePool(pool).effectiveBaseTokenCapacity();
  }

  function collateralRatio() external view returns (uint256) {
    return IFxBasePool(pool).getCollateralRatio();
  }

  function isUnderCollateral() external view returns (bool) {
    return IFxBasePool(pool).getCollateralRatio() <= PRECISION;
  }

  function getCurrentNav()
    external
    view
    returns (
      uint256 _baseNav,
      uint256 _fNav,
      uint256 _xNav
    )
  {
    _baseNav = IFxBasePool(pool).getNetAssetValue(IFxBasePool(pool).getBaseToken());
    _fNav = IFxBasePool(pool).getNetAssetValue(IFxBasePool(pool).getFractionalToken());
    _xNav = IFxBasePool(pool).getNetAssetValue(IFxBasePool(pool).getLeveragedToken());
  }
}
