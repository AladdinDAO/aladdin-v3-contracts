// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;
pragma abicoder v2;

import { SafeMathUpgradeable } from "@openzeppelin/contracts-upgradeable/math/SafeMathUpgradeable.sol";

library StableCoinMath {
  using SafeMathUpgradeable for uint256;

  /*************
   * Constants *
   *************/

  /// @dev The precision used to compute nav.
  uint256 internal constant PRECISION = 1e18;

  /// @dev The precision used to compute nav.
  int256 internal constant PRECISION_I256 = 1e18;

  /***********
   * Structs *
   ***********/

  struct SwapState {
    // Current supply of base token
    uint256 baseSupply;
    // Current nav of base token
    uint256 baseNav;
    // The multiple used to compute current nav.
    int256 fMultiple;
    // Current supply of fractional token
    uint256 fSupply;
    // Current nav of fractional token
    uint256 fNav;
    // Current supply of leveraged token
    uint256 xSupply;
    // Current nav of leveraged token
    uint256 xNav;
  }

  /// @notice Compute the amount of base token needed to reach the new collateral ratio.
  ///
  /// @dev If the current collateral ratio <= new collateral ratio, we should return 0.
  ///
  /// @param state The current state.
  /// @param _newCollateralRatio The target collateral ratio, multipled by 1e18.
  /// @return _maxBaseIn The amount of base token needed.
  /// @return _maxFTokenMintable The amount of fToken can be minted.
  function maxMintableFToken(SwapState memory state, uint256 _newCollateralRatio)
    internal
    pure
    returns (uint256 _maxBaseIn, uint256 _maxFTokenMintable)
  {
    //  n * v = nf * vf + nx * vx
    //  (n + dn) * v = (nf + df) * vf + nx * vx
    //  (n + dn) * v / ((nf + df) * vf) = ncr
    // =>
    //  n * v - ncr * nf * vf = (ncr - 1) * dn * v
    //  n * v - ncr * nf * vf = (ncr - 1) * df * vf
    // =>
    //  dn = (n * v - ncr * nf * vf) / ((ncr - 1) * v)
    //  df = (n * v - ncr * nf * vf) / ((ncr - 1) * vf)

    uint256 _baseVal = state.baseSupply.mul(state.baseNav).mul(PRECISION);
    uint256 _fVal = _newCollateralRatio.mul(state.fSupply).mul(state.fNav);

    if (_baseVal > _fVal) {
      _newCollateralRatio = _newCollateralRatio.sub(PRECISION);
      uint256 _delta = _baseVal - _fVal;

      _maxBaseIn = _delta.div(state.baseNav.mul(_newCollateralRatio));
      _maxFTokenMintable = _delta.div(state.fNav.mul(_newCollateralRatio));
    }
  }

  /// @notice Compute the amount of base token needed to reach the new collateral ratio.
  ///
  /// @dev If the current collateral ratio >= new collateral ratio, we should return 0.
  ///
  /// @param state The current state.
  /// @param _newCollateralRatio The target collateral ratio, multipled by 1e18.
  /// @return _maxBaseIn The amount of base token needed.
  /// @return _maxXTokenMintable The amount of xToken can be minted.
  function maxMintableXToken(SwapState memory state, uint256 _newCollateralRatio)
    internal
    pure
    returns (uint256 _maxBaseIn, uint256 _maxXTokenMintable)
  {
    //  n * v = nf * vf + nx * vx
    //  (n + dn) * v = nf * vf + (nx + dx) * vx
    //  (n + dn) * v / (nf * vf) = ncr
    // =>
    //  n * v + dn * v = ncr * nf * vf
    //  n * v + dx * vx = ncr * nf * vf
    // =>
    //  dn = (ncr * nf * vf - n * v) / v
    //  dx = (ncr * nf * vf - n * v) / vx

    uint256 _baseVal = state.baseNav.mul(state.baseSupply).mul(PRECISION);
    uint256 _fVal = _newCollateralRatio.mul(state.fSupply).mul(state.fNav);

    if (_fVal > _baseVal) {
      uint256 _delta = _fVal - _baseVal;

      _maxBaseIn = _delta.div(state.baseNav.mul(PRECISION));
      _maxXTokenMintable = _delta.div(state.xNav.mul(PRECISION));
    }
  }

  /// @notice Compute the amount of base token needed to reach the new collateral ratio, with incentive.
  ///
  /// @dev If the current collateral ratio >= new collateral ratio, we should return 0.
  ///
  /// @param state The current state.
  /// @param _newCollateralRatio The target collateral ratio, multipled by 1e18.
  /// @param _incentiveRatio The extra incentive ratio, multipled by 1e18.
  /// @return _maxBaseIn The amount of base token needed.
  /// @return _maxXTokenMintable The amount of xToken can be minted.
  function maxMintableXTokenWithIncentive(
    SwapState memory state,
    uint256 _newCollateralRatio,
    uint256 _incentiveRatio
  ) internal pure returns (uint256 _maxBaseIn, uint256 _maxXTokenMintable) {
    //  n * v = nf * vf + nx * vx
    //  (n + dn) * v = nf * (vf - dvf) + (nx + dx) * vx
    //  (n + dn) * v / (nf * (vf - dvf)) = ncr
    //  nf * dvf = lambda * dn * v
    //  dx * vx = (1 + lambda) * dn * v
    // =>
    //  n * v + dn * v = ncr * nf * vf - lambda * nrc * dn * v
    // =>
    //  dn = (ncr * nf * vf - n * v) / (v * (1 + lambda * ncr))
    //  dx = ((1 + lambda) * dn * v) / vx

    uint256 _baseVal = state.baseNav.mul(state.baseSupply).mul(PRECISION);
    uint256 _fVal = _newCollateralRatio.mul(state.fSupply).mul(state.fNav);

    if (_fVal > _baseVal) {
      uint256 _delta = _fVal - _baseVal;

      _maxBaseIn = _delta.div(state.baseNav.mul(PRECISION + (_incentiveRatio * _newCollateralRatio) / PRECISION));
      _maxXTokenMintable = _maxBaseIn.mul(state.baseNav).mul(PRECISION + _incentiveRatio).div(
        state.xNav.mul(PRECISION)
      );
    }
  }

  /// @notice Compute the amount of fToken needed to reach the new collateral ratio.
  ///
  /// @dev If the current collateral ratio >= new collateral ratio, we should return 0.
  ///
  /// @param state The current state.
  /// @param _newCollateralRatio The target collateral ratio, multipled by 1e18.
  /// @return _maxBaseOut The amount of base token redeemed.
  /// @return _maxFTokenRedeemable The amount of fToken needed.
  function maxRedeemableFToken(SwapState memory state, uint256 _newCollateralRatio)
    internal
    pure
    returns (uint256 _maxBaseOut, uint256 _maxFTokenRedeemable)
  {
    //  n * v = nf * vf + nx * vx
    //  (n - dn) * v = (nf - df) * vf + nx * vx
    //  (n - dn) * v / ((nf - df) * vf) = ncr
    // =>
    //  n * v - dn * v = ncr * nf * vf - ncr * dn * v
    //  n * v - df * vf = ncr * nf * vf - ncr * df * vf
    // =>
    //  df = (ncr * nf * vf - n * v) / ((ncr - 1) * vf)
    //  dn = (ncr * nf * vf - n * v) / ((ncr - 1) * v)

    uint256 _baseVal = state.baseSupply.mul(state.baseNav).mul(PRECISION);
    uint256 _fVal = _newCollateralRatio.mul(state.fSupply).mul(state.fNav);

    if (_fVal > _baseVal) {
      uint256 _delta = _fVal - _baseVal;
      _newCollateralRatio = _newCollateralRatio.sub(PRECISION);

      _maxFTokenRedeemable = _delta.div(_newCollateralRatio.mul(state.fNav));
      _maxBaseOut = _delta.div(_newCollateralRatio.mul(state.baseNav));
    }
  }

  /// @notice Compute the amount of xToken needed to reach the new collateral ratio.
  ///
  /// @dev If the current collateral ratio <= new collateral ratio, we should return 0.
  ///
  /// @param state The current state.
  /// @param _newCollateralRatio The target collateral ratio, multipled by 1e18.
  /// @return _maxBaseOut The amount of base token redeemed.
  /// @return _maxXTokenRedeemable The amount of xToken needed.
  function maxRedeemableXToken(SwapState memory state, uint256 _newCollateralRatio)
    internal
    pure
    returns (uint256 _maxBaseOut, uint256 _maxXTokenRedeemable)
  {
    //  n * v = nf * vf + nx * vx
    //  (n - dn) * v = nf * vf + (nx - dx) * vx
    //  (n - dn) * v / (nf * vf) = ncr
    // =>
    //  n * v - dn * v = ncr * nf * vf
    //  n * v - dx * vx = ncr * nf * vf
    // =>
    //  dn = (n * v - ncr * nf * vf) / v
    //  dx = (n * v - ncr * nf * vf) / vx

    uint256 _baseVal = state.baseSupply.mul(state.baseNav).mul(PRECISION);
    uint256 _fVal = _newCollateralRatio.mul(state.fSupply).mul(state.fNav);

    if (_baseVal > _fVal) {
      uint256 _delta = _baseVal - _fVal;

      _maxXTokenRedeemable = _delta.div(state.xNav.mul(PRECISION));
      _maxBaseOut = _delta.div(state.baseNav.mul(PRECISION));
    }
  }

  /// @notice Compute the maximum amount of fToken can be liquidated.
  ///
  /// @dev If the current collateral ratio >= new collateral ratio, we should return 0.
  ///
  /// @param state The current state.
  /// @param _newCollateralRatio The target collateral ratio, multipled by 1e18.
  /// @param _incentiveRatio The extra incentive ratio, multipled by 1e18.
  /// @return _maxBaseOut The maximum amount of base token can liquidate, without incentive.
  /// @return _maxFTokenLiquidatable The maximum amount of fToken can be liquidated.
  function maxLiquidatable(
    SwapState memory state,
    uint256 _newCollateralRatio,
    uint256 _incentiveRatio
  ) internal pure returns (uint256 _maxBaseOut, uint256 _maxFTokenLiquidatable) {
    //  n * v = nf * vf + nx * vx
    //  (n - dn) * v = (nf - df) * (vf - dvf) + nx * vx
    //  (n - dn) * v / ((nf - df) * (vf - dvf)) = ncr
    //  dn * v = nf * dvf + df * (vf - dvf)
    //  dn * v = df * vf * (1 + lambda)
    // =>
    //  n * v - dn * v = ncf * nf * vf - ncr * dn * v
    // =>
    //  dn = (ncr * nf * vf - n * v) / ((ncr - 1) * v)
    //  df = (dn * v) / ((1 + lambda) * vf)

    uint256 _fVal = _newCollateralRatio.mul(state.fSupply).mul(state.fNav);
    uint256 _baseVal = state.baseSupply.mul(state.baseNav).mul(PRECISION);

    if (_fVal > _baseVal) {
      uint256 _delta = _fVal - _baseVal;
      _newCollateralRatio = _newCollateralRatio.sub(PRECISION);

      _maxBaseOut = _delta.div(state.baseNav.mul(_newCollateralRatio));
      _maxFTokenLiquidatable = _delta.div(_newCollateralRatio).mul(PRECISION).div(
        (PRECISION + _incentiveRatio).mul(state.fNav)
      );
    }
  }

  /// @notice Mint fToken and xToken according to current collateral ratio.
  /// @param state The current state.
  /// @param _baseIn The amount of base token supplied.
  /// @return _fTokenOut The amount of fToken expected.
  /// @return _xTokenOut The amount of xToken expected.
  function mint(SwapState memory state, uint256 _baseIn)
    internal
    pure
    returns (uint256 _fTokenOut, uint256 _xTokenOut)
  {
    //  n * v = nf * vf + nx * vx
    //  (n + dn) * v = (nf + df) * vf + (nx + dx) * vx
    //  ((nf + df) * vf) / ((n + dn) * v) = (nf * vf) / (n * v)
    //  ((nx + dx) * vx) / ((n + dn) * v) = (nx * vx) / (n * v)
    // =>
    //   df = nf * dn / n
    //   dx = nx * dn / n
    _fTokenOut = state.fSupply.mul(_baseIn).div(state.baseSupply);
    _xTokenOut = state.xSupply.mul(_baseIn).div(state.baseSupply);
  }

  /// @notice Mint fToken.
  /// @param state The current state.
  /// @param _baseIn The amount of base token supplied.
  /// @return _fTokenOut The amount of fToken expected.
  function mintFToken(SwapState memory state, uint256 _baseIn) internal pure returns (uint256 _fTokenOut) {
    //  n * v = nf * vf + nx * vx
    //  (n + dn) * v = (nf + df) * vf + nx * vx
    // =>
    //  df = dn * v / vf
    _fTokenOut = _baseIn.mul(state.baseNav).div(state.fNav);
  }

  /// @notice Mint xToken.
  /// @param state The current state.
  /// @param _baseIn The amount of base token supplied.
  /// @return _xTokenOut The amount of xToken expected.
  function mintXToken(SwapState memory state, uint256 _baseIn) internal pure returns (uint256 _xTokenOut) {
    //  n * v = nf * vf + nx * vx
    //  (n + dn) * v = nf * vf + (nx + dx) * vx
    // =>
    //  dx = (dn * v * nx) / (n * v - nf * vf)
    _xTokenOut = _baseIn.mul(state.baseNav).mul(state.xSupply);
    _xTokenOut = _xTokenOut.div(state.baseSupply.mul(state.baseNav).sub(state.fSupply.mul(state.fNav)));
  }

  /// @notice Mint xToken with given incentive.
  /// @param state The current state.
  /// @param _baseIn The amount of base token supplied.
  /// @param _incentiveRatio The extra incentive given, multiplied by 1e18.
  /// @return _xTokenOut The amount of xToken expected.
  /// @return _fDeltaNav The change for nav of fToken.
  function mintXToken(
    SwapState memory state,
    uint256 _baseIn,
    uint256 _incentiveRatio
  ) internal pure returns (uint256 _xTokenOut, uint256 _fDeltaNav) {
    //  n * v = nf * vf + nx * vx
    //  (n + dn) * v = nf * (vf - dvf) + (nx + dx) * vx
    // =>
    //  dn * v = dx * vx - nf * dvf
    //  nf * dvf = lambda * dn * v
    // =>
    //  dx * vx = (1 + lambda) * dn * v
    //  dvf = lambda * dn * v / nf

    uint256 _deltaVal = _baseIn.mul(state.baseNav);

    _xTokenOut = _deltaVal.mul(PRECISION + _incentiveRatio).div(PRECISION);
    _xTokenOut = _xTokenOut.div(state.xNav);

    _fDeltaNav = _deltaVal.mul(_incentiveRatio).div(PRECISION);
    _fDeltaNav = _fDeltaNav.div(state.fSupply);
  }

  /// @notice Redeem base token with fToken and xToken.
  /// @param state The current state.
  /// @param _fTokenIn The amount of fToken supplied.
  /// @param _xTokenIn The amount of xToken supplied.
  /// @return _baseOut The amount of base token expected.
  function redeem(
    SwapState memory state,
    uint256 _fTokenIn,
    uint256 _xTokenIn
  ) internal pure returns (uint256 _baseOut) {
    uint256 _xVal = state.baseSupply.mul(state.baseNav).sub(state.fSupply.mul(state.fNav));

    //  n * v = nf * vf + nx * vx
    //  (n - dn) * v = (nf - df) * vf + (nx - dx) * vx
    // =>
    //  dn = (df * vf + dx * (n * v - nf * vf) / nx) / v

    if (state.xSupply == 0) {
      _baseOut = _fTokenIn.mul(state.fNav).div(state.baseNav);
    } else {
      _baseOut = _fTokenIn.mul(state.fNav);
      _baseOut = _baseOut.add(_xTokenIn.mul(_xVal).div(state.xSupply));
      _baseOut = _baseOut.div(state.baseNav);
    }
  }

  /// @notice Redeem base token with fToken and given incentive.
  /// @param state The current state.
  /// @param _fTokenIn The amount of fToken supplied.
  /// @param _incentiveRatio The extra incentive given, multiplied by 1e18.
  /// @return _baseOut The amount of base token expected.
  /// @return _fDeltaNav The change for nav of fToken.
  function liquidateWithIncentive(
    SwapState memory state,
    uint256 _fTokenIn,
    uint256 _incentiveRatio
  ) internal pure returns (uint256 _baseOut, uint256 _fDeltaNav) {
    //  n * v = nf * vf + nx * vx
    //  (n - dn) * v = (nf - df) * (vf - dvf) + nx * vx
    // =>
    //  dn * v = nf * dvf + df * (vf - dvf)
    //  dn * v = df * vf * (1 + lambda)
    // =>
    //  dn = df * vf * (1 + lambda) / v
    //  dvf = lambda * (df * vf) / (nf - df)

    uint256 _fDeltaVal = _fTokenIn.mul(state.fNav);

    _baseOut = _fDeltaVal.mul(PRECISION + _incentiveRatio).div(PRECISION);
    _baseOut = _baseOut.div(state.baseNav);

    _fDeltaNav = _fDeltaVal.mul(_incentiveRatio).div(PRECISION);
    _fDeltaNav = _fDeltaNav.div(state.fSupply.sub(_fTokenIn));
  }
}
