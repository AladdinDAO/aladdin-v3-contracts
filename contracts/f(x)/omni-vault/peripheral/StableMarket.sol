// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.25;

import { IFxBasePool } from "../../../interfaces/f(x)/omni-vault/IFxBasePool.sol";

contract StableMarket {
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

  function stabilityRatio() external view returns (uint256) {
    return IFxBasePool(pool).getStabilityRatio();
  }

  function mintFToken(
    uint256 _baseIn,
    address _recipient,
    uint256 _minFTokenMinted
  ) external returns (uint256 _fTokenMinted) {}

  function mintXToken(
    uint256 _baseIn,
    address _recipient,
    uint256 _minXTokenMinted
  ) external returns (uint256 _xTokenMinted, uint256 _bonus) {}

  function redeemFToken(
    uint256 _fTokenIn,
    address _recipient,
    uint256 _minBaseOut
  ) external returns (uint256 _baseOut, uint256 _bonus) {}

  function redeemXToken(
    uint256 _xTokenIn,
    address _recipient,
    uint256 _minBaseOut
  ) external returns (uint256 _baseOut) {}
}
