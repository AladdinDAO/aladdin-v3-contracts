// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

/// @dev In this library, we assume the nav for fractional token is always 1.
library FxStableMath {
  /*************
   * Constants *
   *************/

  /// @dev The precision used to compute nav.
  uint256 internal constant PRECISION = 1e18;

  /// @dev The precision used to compute nav.
  int256 internal constant PRECISION_I256 = 1e18;

  /// @dev The maximum value of leverage ratio.
  uint256 internal constant MAX_LEVERAGE_RATIO = 100e18;

  /***********
   * Structs *
   ***********/

  struct SwapState {
    // Current supply of base token
    uint256 baseSupply;
    // Current nav of base token
    uint256 baseNav;
    // Current supply of fractional token
    uint256 fSupply;
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

    uint256 _baseVal = state.baseSupply * (state.baseNav) * (PRECISION);
    uint256 _fVal = _newCollateralRatio * (state.fSupply) * (PRECISION);

    if (_baseVal > _fVal) {
      _newCollateralRatio = _newCollateralRatio - (PRECISION);
      uint256 _delta = _baseVal - _fVal;

      _maxBaseIn = _delta / (state.baseNav * (_newCollateralRatio));
      _maxFTokenMintable = _delta / (PRECISION * (_newCollateralRatio));
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

    uint256 _baseVal = state.baseNav * (state.baseSupply) * (PRECISION);
    uint256 _fVal = _newCollateralRatio * (state.fSupply) * (PRECISION);

    if (_fVal > _baseVal) {
      uint256 _delta = _fVal - _baseVal;

      _maxBaseIn = _delta / (state.baseNav * (PRECISION));
      _maxXTokenMintable = _delta / (state.xNav * (PRECISION));
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

    uint256 _baseVal = state.baseSupply * (state.baseNav) * (PRECISION);
    uint256 _fVal = _newCollateralRatio * (state.fSupply) * (PRECISION);

    if (_fVal > _baseVal) {
      uint256 _delta = _fVal - _baseVal;
      _newCollateralRatio = _newCollateralRatio - (PRECISION);

      _maxFTokenRedeemable = _delta / (_newCollateralRatio * (PRECISION));
      _maxBaseOut = _delta / (_newCollateralRatio * (state.baseNav));
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

    uint256 _baseVal = state.baseSupply * (state.baseNav) * (PRECISION);
    uint256 _fVal = _newCollateralRatio * (state.fSupply) * (PRECISION);

    if (_baseVal > _fVal) {
      uint256 _delta = _baseVal - _fVal;

      _maxXTokenRedeemable = _delta / (state.xNav * (PRECISION));
      _maxBaseOut = _delta / (state.baseNav * (PRECISION));
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
    _fTokenOut = (state.fSupply * _baseIn) / (state.baseSupply);
    _xTokenOut = (state.xSupply * _baseIn) / (state.baseSupply);
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
    _fTokenOut = (_baseIn * state.baseNav) / PRECISION;
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
    _xTokenOut = _baseIn * state.baseNav * state.xSupply;
    _xTokenOut = _xTokenOut / (state.baseSupply * state.baseNav - state.fSupply * PRECISION);
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
    uint256 _xVal = state.baseSupply * state.baseNav - state.fSupply * PRECISION;

    //  n * v = nf * vf + nx * vx
    //  (n - dn) * v = (nf - df) * vf + (nx - dx) * vx
    // =>
    //  dn = (df * vf + dx * (n * v - nf * vf) / nx) / v

    if (state.xSupply == 0) {
      _baseOut = (_fTokenIn * PRECISION) / state.baseNav;
    } else {
      _baseOut = _fTokenIn * PRECISION;
      _baseOut += (_xTokenIn * _xVal) / state.xSupply;
      _baseOut /= state.baseNav;
    }
  }

  /// @notice Compute current leverage ratio for xToken.
  /// @param state The current state.
  /// @return ratio The current leverage ratio.
  function leverageRatio(SwapState memory state) internal pure returns (uint256 ratio) {
    // (1 - rho * beta * (1 + r)) / (1 - rho)
    uint256 rho = (state.fSupply * PRECISION * PRECISION) / (state.baseSupply * state.baseNav);
    ratio = (PRECISION * PRECISION) / (PRECISION - rho);
    if (ratio > MAX_LEVERAGE_RATIO) ratio = MAX_LEVERAGE_RATIO;
  }
}
