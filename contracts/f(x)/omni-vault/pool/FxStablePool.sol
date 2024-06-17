// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.25;

import { IFxOmniVault } from "../../../interfaces/f(x)/omni-vault/IFxOmniVault.sol";

import { FxBasePool } from "./FxBasePool.sol";
import { FxGeneralPool } from "./FxGeneralPool.sol";

contract FxStablePool is FxGeneralPool {
  /***********
   * Structs *
   ***********/

  struct StablePoolParams {
    address baseToken;
    address fractionalToken;
    address leveragedToken;
    address priceOracle;
    address rateProvider;
    uint256 stabilityRatio;
    uint256 effectiveBaseTokenCapacity;
  }

  /*************
   * Variables *
   *************/

  /// @dev Slots for future use.
  uint256[50] private _gap;

  /***************
   * Constructor *
   ***************/

  constructor(address _vault) FxBasePool(_vault) {}

  function initialize(StablePoolParams calldata params) external initializer {
    __Context_init(); // from ContextUpgradeable
    __ERC165_init(); // from ERC165Upgradeable
    __AccessControl_init(); // from AccessControlUpgradeable

    __FxBasePool_init(
      params.baseToken,
      params.fractionalToken,
      params.leveragedToken,
      params.priceOracle,
      params.rateProvider,
      params.stabilityRatio,
      params.effectiveBaseTokenCapacity
    );

    _grantRole(DEFAULT_ADMIN_ROLE, _msgSender());
  }

  /**********************
   * Internal Functions *
   **********************/

  /// @inheritdoc FxBasePool
  function _onInitialize(
    address, /*sender*/
    address, /*recipient*/
    uint256 baseSupply,
    bytes memory userData
  ) internal virtual override returns (uint256 baseNav, uint256[] memory amountsOut) {
    // first one is JoinKind, second one is BaseBalance
    (, , uint256 initialMintRatio) = abi.decode(userData, (JoinKind, uint256, uint256));
    // use twap as base nav
    (baseNav, ) = _getPrice(Action.None);
    referenceBaseTokenPrice = baseNav;

    amountsOut = new uint256[](2);
    uint256 baseValue = baseSupply * baseNav;
    amountsOut[0] = (baseValue * initialMintRatio) / PRECISION / PRECISION;
    amountsOut[1] = baseValue / PRECISION - amountsOut[0];
  }

  /// @inheritdoc FxBasePool
  function _getSwapState(
    Action action,
    uint256 baseSupply,
    uint256 fSupply,
    uint256 xSupply
  ) internal view virtual override returns (SwapState memory state) {
    (state.baseTwapNav, state.baseNav) = _getPrice(action);
    state.baseSupply = baseSupply;
    state.fSupply = fSupply;
    state.xSupply = xSupply;
    state.fNav = PRECISION;

    if (baseSupply == 0) {
      state.xNav = PRECISION;
    } else {
      if (xSupply == 0) {
        // no xToken, treat the nav of xToken as 1.0
        state.xNav = PRECISION;
      } else {
        unchecked {
          uint256 _baseVal = baseSupply * state.baseNav;
          uint256 _fVal = fSupply * PRECISION;
          if (_baseVal > _fVal) {
            state.xNav = (_baseVal - _fVal) / xSupply;
          } else {
            // under collateral
            state.xNav = 0;
          }
        }
      }
    }
  }

  /// @inheritdoc FxBasePool
  function _collateralRatio(
    uint256 baseSupply,
    uint256 fSupply,
    uint256 /*xSupply*/
  ) internal view virtual override returns (uint256 ratio) {
    unchecked {
      if (baseSupply == 0) return PRECISION;
      if (fSupply == 0) return PRECISION * PRECISION;

      (, uint256 baseNav) = _getPrice(Action.None);
      return (baseSupply * baseNav) / fSupply;
    }
  }

  /// @inheritdoc FxBasePool
  function _getFractionalTokenNetAssetValue() internal view virtual override returns (uint256 nav) {
    uint256 baseSupply = effectiveBaseTokenSupply;
    uint256[] memory balances = IFxOmniVault(vault).getPoolBalances(address(this));
    uint256 fSupply = balances[1];

    (uint256 baseNav, ) = _getPrice(Action.None);
    uint256 baseVal = baseSupply * baseNav;
    if (baseVal <= fSupply * PRECISION) {
      nav = baseVal / fSupply;
    } else {
      nav = PRECISION;
    }
  }

  /// @inheritdoc FxBasePool
  function _getLeveragedTokenNetAssetValue() internal view virtual override returns (uint256 nav) {
    uint256 baseSupply = effectiveBaseTokenSupply;
    uint256[] memory balances = IFxOmniVault(vault).getPoolBalances(address(this));
    uint256 fSupply = balances[1];
    uint256 xSupply = balances[2];

    (uint256 baseNav, ) = _getPrice(Action.None);
    uint256 baseVal = baseSupply * baseNav;
    uint256 fVal = fSupply * PRECISION;
    if (baseVal <= fVal) {
      nav = 0;
    } else {
      nav = (baseVal - fVal) / xSupply;
    }
  }

  /// @inheritdoc FxGeneralPool
  /// @dev We are sure `targetCollateralRatio` is greater than `PRECISION`. And the code is simplified since
  ///      `state.fNav` is always `PRECISION`.
  function _mintableFractionalTokenToCollateralRatio(SwapState memory state, uint256 targetCollateralRatio)
    internal
    view
    virtual
    override
    returns (uint256 baseTokenIn, uint256 fTokenOut)
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

    uint256 _baseVal = state.baseSupply * state.baseNav * PRECISION;
    uint256 _fVal = targetCollateralRatio * state.fSupply * PRECISION;

    if (_baseVal > _fVal) {
      unchecked {
        targetCollateralRatio = targetCollateralRatio - PRECISION;

        uint256 _delta = _baseVal - _fVal;
        baseTokenIn = _delta / (state.baseNav * targetCollateralRatio);
        fTokenOut = _delta / (PRECISION * targetCollateralRatio);
      }
    }
  }

  /// @inheritdoc FxGeneralPool
  /// @dev We are sure `targetCollateralRatio` is greater than `PRECISION`. And the code is simplified since
  ///      `state.fNav` is always `PRECISION`.
  function _mintableLeveragedTokenToCollateralRatio(SwapState memory state, uint256 targetCollateralRatio)
    internal
    view
    virtual
    override
    returns (uint256 baseTokenIn, uint256 xTokenOut)
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

    uint256 _baseVal = state.baseNav * state.baseSupply * PRECISION;
    uint256 _fVal = targetCollateralRatio * state.fSupply * PRECISION;

    if (_fVal > _baseVal) {
      uint256 _delta;
      unchecked {
        _delta = _fVal - _baseVal;
        baseTokenIn = _delta / (state.baseNav * PRECISION);
      }
      // `state.xNav` can be zero, no `unchecked` here.
      xTokenOut = _delta / (state.xNav * PRECISION);
    }
  }

  /// @inheritdoc FxGeneralPool
  /// @dev We are sure `targetCollateralRatio` is greater than `PRECISION`. And the code is simplified since
  ///      `state.fNav` is always `PRECISION`.
  function _redeemableFractionalTokenToCollateralRatio(SwapState memory state, uint256 targetCollateralRatio)
    internal
    view
    virtual
    override
    returns (uint256 baseTokenIn, uint256 fTokenOut)
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

    uint256 _baseVal = state.baseSupply * state.baseNav * PRECISION;
    uint256 _fVal = targetCollateralRatio * state.fSupply * PRECISION;

    if (_fVal > _baseVal) {
      unchecked {
        targetCollateralRatio = targetCollateralRatio - PRECISION;

        uint256 _delta = _fVal - _baseVal;
        baseTokenIn = _delta / (targetCollateralRatio * PRECISION);
        fTokenOut = _delta / (targetCollateralRatio * state.baseNav);
      }
    }
  }

  /// @inheritdoc FxGeneralPool
  /// @dev We are sure `targetCollateralRatio` is greater than `PRECISION`. And the code is simplified since
  ///      `state.fNav` is always `PRECISION`.
  function _redeemableLeveragedTokenToCollateralRatio(SwapState memory state, uint256 targetCollateralRatio)
    internal
    view
    virtual
    override
    returns (uint256 baseTokenIn, uint256 xTokenOut)
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

    uint256 _baseVal = state.baseSupply * state.baseNav * PRECISION;
    uint256 _fVal = targetCollateralRatio * state.fSupply * PRECISION;

    if (_baseVal > _fVal) {
      uint256 _delta;
      unchecked {
        _delta = _baseVal - _fVal;
        baseTokenIn = _delta / (state.baseNav * PRECISION);
      }
      // `state.xNav` can be zero, no `unchecked` here.
      xTokenOut = _delta / (state.xNav * PRECISION);
    }
  }

  /// @inheritdoc FxGeneralPool
  /// @dev The code is simplified since `state.fNav` is always `PRECISION`.
  function _mintableFractionalToken(SwapState memory state, uint256 amountIn)
    internal
    view
    virtual
    override
    returns (uint256 amountOut)
  {
    //  n * v = nf * vf + nx * vx
    //  (n + dn) * v = (nf + df) * vf + nx * vx
    // =>
    //  df = dn * v / vf
    unchecked {
      amountOut = (amountIn * state.baseNav) / PRECISION;
    }
  }

  /// @inheritdoc FxGeneralPool
  function _mintableLeveragedToken(SwapState memory state, uint256 amountIn)
    internal
    view
    virtual
    override
    returns (uint256 amountOut)
  {
    //  n * v = nf * vf + nx * vx
    //  (n + dn) * v = nf * vf + (nx + dx) * vx
    // =>
    //  dx = (dn * v * nx) / (n * v - nf * vf)
    amountOut = amountIn * state.baseNav * state.xSupply;
    unchecked {
      amountOut = amountOut / (state.baseSupply * state.baseNav - state.fSupply * PRECISION);
    }
  }

  /// @inheritdoc FxGeneralPool
  function _redeemableBaseToken(SwapState memory state, uint256[] memory amountsIn)
    internal
    view
    virtual
    override
    returns (uint256 amountOut)
  {
    uint256 _fTokenIn = amountsIn[0];
    if (state.xNav == 0) {
      // redeem fractional token proportionally when under collateral.
      return (_fTokenIn * state.baseSupply) / state.fSupply;
    }

    uint256 _xTokenIn = amountsIn[1];
    //  n * v = nf * vf + nx * vx
    //  (n - dn) * v = (nf - df) * vf + (nx - dx) * vx
    // =>
    //  dn = (df * vf + dx * (n * v - nf * vf) / nx) / v
    unchecked {
      if (state.xSupply == 0) {
        amountOut = (_fTokenIn * PRECISION) / state.baseNav;
      } else {
        uint256 _xVal = state.baseSupply * state.baseNav - state.fSupply * PRECISION;
        amountOut = _fTokenIn * PRECISION;
        amountOut += (_xTokenIn * _xVal) / state.xSupply;
        amountOut /= state.baseNav;
      }
    }
  }
}
