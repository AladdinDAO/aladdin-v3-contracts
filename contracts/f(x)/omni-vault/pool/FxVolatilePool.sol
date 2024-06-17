// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.25;

import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable-v4/token/ERC20/IERC20Upgradeable.sol";

import { FxBasePool } from "./FxBasePool.sol";
import { FxGeneralPool } from "./FxGeneralPool.sol";

contract FxVolatilePool is FxGeneralPool {
  /**********
   * Events *
   **********/

  /// @notice Emitted when the net asset value is updated.
  /// @param price The new price of effective base token.
  /// @param nav The new net asset value of fractional token.
  event Settlement(uint256 price, uint256 nav);

  /**********
   * Errors *
   **********/

  /// @dev Thrown when the fractional token multiple <= -1e18
  error ErrorFractionalTokenMultipleTooSmall();

  /// @dev Thrown when the fractional token multiple >= 1e36
  error ErrorFractionalTokenMultipleTooLarge();

  /*************
   * Constants *
   *************/

  /// @notice The role for settlement caller.
  bytes32 public constant SETTLEMENT_ROLE = keccak256("SETTLEMENT_ROLE");

  /// @dev The precision used to compute nav.
  int256 private constant PRECISION_I256 = 1e18;

  /***********
   * Structs *
   ***********/

  struct VolatileStablePoolParams {
    address baseToken;
    address fractionalToken;
    address leveragedToken;
    address priceOracle;
    address rateProvider;
    uint256 stabilityRatio;
    uint256 effectiveBaseTokenCapacity;
    uint256 beta;
  }

  /*************
   * Variables *
   *************/

  /// @notice The volatility multiple of fractional token compare to base token.
  uint256 public beta;

  /// @notice The reference fractional token nav.
  uint256 public referenceFractionalTokenNav;

  /// @dev Slots for future use.
  uint256[48] private _gap;

  /***************
   * Constructor *
   ***************/

  constructor(address _vault) FxBasePool(_vault) {}

  function initialize(VolatileStablePoolParams calldata params) external initializer {
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

    beta = params.beta;

    _grantRole(DEFAULT_ADMIN_ROLE, _msgSender());
  }

  /************************
   * Restricted Functions *
   ************************/

  /// @notice Reset the reference price.
  function settle() external onlyRole(SETTLEMENT_ROLE) {
    if (effectiveBaseTokenSupply == 0) return;

    (uint256 newPrice, ) = _getPrice(Action.None);
    uint256 newNav = _getFractionalTokenNetAssetValue(newPrice);

    emit Settlement(newPrice, newNav);

    referenceBaseTokenPrice = newPrice;
    referenceFractionalTokenNav = newNav;
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
    (, , uint256 initialMintRatio) = abi.decode(userData, (JoinKind, uint256, uint256));
    // use twap as base nav
    (baseNav, ) = _getPrice(Action.None);
    referenceBaseTokenPrice = baseNav;

    amountsOut = new uint256[](2);
    uint256 baseValue = baseSupply * baseNav;
    amountsOut[0] = (baseValue * initialMintRatio) / PRECISION / PRECISION;
    amountsOut[1] = baseValue / PRECISION - amountsOut[0];

    emit Settlement(baseNav, PRECISION);
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

    if (state.baseSupply == 0) {
      state.fNav = PRECISION;
      state.xNav = PRECISION;
    } else {
      state.fNav = _getFractionalTokenNetAssetValue(state.baseNav);

      if (xSupply == 0) {
        // no leveraged token, treat the nav of leveraged token as 1.0
        state.xNav = PRECISION;
      } else {
        uint256 baseVal = baseSupply * state.baseNav;
        uint256 fVal = fSupply * state.fNav;
        if (baseVal >= fVal) state.xNav = 0;
        else state.xNav = (baseVal - fVal) / xSupply;
      }
    }
  }

  /// @inheritdoc FxBasePool
  function _collateralRatio(
    uint256 baseSupply,
    uint256 fSupply,
    uint256 xSupply
  ) internal view virtual override returns (uint256 ratio) {}

  /// @inheritdoc FxBasePool
  function _getFractionalTokenNetAssetValue() internal view virtual override returns (uint256 nav) {
    uint256 baseSupply = effectiveBaseTokenSupply;
    if (baseSupply == 0) return PRECISION;

    (uint256 baseNav, ) = _getPrice(Action.None);
    nav = _getFractionalTokenNetAssetValue(baseNav);
    uint256 fSupply = IERC20Upgradeable(fractionalToken).totalSupply();
    uint256 baseVal = baseSupply * baseNav;
    uint256 fVal = fSupply * nav;

    // if under collateral, adjust nav
    if (baseVal <= fVal) {
      nav = baseVal / fSupply;
    }
  }

  /// @inheritdoc FxBasePool
  function _getLeveragedTokenNetAssetValue() internal view virtual override returns (uint256 nav) {
    uint256 baseSupply = effectiveBaseTokenSupply;
    if (baseSupply == 0) return PRECISION;

    (uint256 baseNav, ) = _getPrice(Action.None);
    uint256 fNav = _getFractionalTokenNetAssetValue(baseNav);
    uint256 fSupply = IERC20Upgradeable(fractionalToken).totalSupply();
    uint256 xSupply = IERC20Upgradeable(leveragedToken).totalSupply();
    uint256 baseVal = baseSupply * baseNav;
    uint256 fVal = fSupply * fNav;

    if (baseVal <= fVal) nav = 0;
    else if (xSupply == 0) nav = PRECISION;
    else nav = (baseVal - fVal) / xSupply;
  }

  /// @inheritdoc FxGeneralPool
  /// @dev We are sure `targetCollateralRatio` is greater than `PRECISION`.
  /// @dev Copy from `FxLowVolatilityMath.maxMintableFToken`.
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
    uint256 _fVal = targetCollateralRatio * state.fSupply * state.fNav;
    if (_baseVal > _fVal) {
      unchecked {
        targetCollateralRatio = targetCollateralRatio - PRECISION;
        uint256 _delta = _baseVal - _fVal;

        baseTokenIn = _delta / (state.baseNav * targetCollateralRatio);
        fTokenOut = _delta / (state.fNav * targetCollateralRatio);
      }
    }
  }

  /// @inheritdoc FxGeneralPool
  /// @dev We are sure `targetCollateralRatio` is greater than `PRECISION`.
  /// @dev Copy from `FxLowVolatilityMath.maxMintableXToken`.
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
    uint256 _fVal = targetCollateralRatio * state.fSupply * state.fNav;
    if (_fVal > _baseVal) {
      uint256 _delta;
      unchecked {
        _delta = _fVal - _baseVal;
        baseTokenIn = _delta / (state.baseNav * PRECISION);
      }
      xTokenOut = _delta / (state.xNav * PRECISION);
    }
  }

  /// @inheritdoc FxGeneralPool
  /// @dev We are sure `targetCollateralRatio` is greater than `PRECISION`.
  /// @dev Copy from `FxLowVolatilityMath.maxRedeemableFToken`.
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
    uint256 _fVal = targetCollateralRatio * state.fSupply * state.fNav;

    if (_fVal > _baseVal) {
      unchecked {
        uint256 _delta = _fVal - _baseVal;
        targetCollateralRatio = targetCollateralRatio - PRECISION;

        fTokenOut = _delta / (targetCollateralRatio * state.fNav);
        baseTokenIn = _delta / (targetCollateralRatio * state.baseNav);
      }
    }
  }

  /// @inheritdoc FxGeneralPool
  /// @dev We are sure `targetCollateralRatio` is greater than `PRECISION`.
  /// @dev Copy from `FxLowVolatilityMath.maxRedeemableXToken`.
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
    uint256 _fVal = targetCollateralRatio * state.fSupply * state.fNav;

    if (_baseVal > _fVal) {
      uint256 _delta;
      unchecked {
        _delta = _baseVal - _fVal;
        baseTokenIn = _delta / (state.baseNav * PRECISION);
      }
      xTokenOut = _delta / (state.xNav * PRECISION);
    }
  }

  /// @inheritdoc FxGeneralPool
  /// @dev Copy from `FxLowVolatilityMath.mintFToken`.
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
    amountOut = (amountIn * state.baseNav) / state.fNav;
  }

  /// @inheritdoc FxGeneralPool
  /// @dev Copy from `FxLowVolatilityMath.mintXToken`.
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
    amountOut = amountOut / (state.baseSupply * state.baseNav - state.fSupply * state.fNav);
  }

  /// @inheritdoc FxGeneralPool
  /// @dev Copy from `FxLowVolatilityMath.redeem`.
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

    if (state.xSupply == 0) {
      amountOut = (_fTokenIn * state.fNav) / state.baseNav;
    } else {
      uint256 _xVal = state.baseSupply * state.baseNav - state.fSupply * state.fNav;
      amountOut = _fTokenIn * state.fNav;
      amountOut += (_xTokenIn * _xVal) / state.xSupply;
      amountOut /= state.baseNav;
    }
  }

  /// @dev Internal function to compute latest nav multiple based on current price.
  ///
  /// Below are some important formula to do the update.
  ///                newPrice
  /// ratio = ----------------------- - 1
  ///         referenceBaseTokenPrice
  ///
  /// intermediateFractionalTokenNav = (1 + beta * ratio) * referenceFractionalTokenNav
  ///
  /// @param newPrice The current price of effective base token.
  /// @return multiple The multiple for fractional token, which is `beta * ratio`, multiplied by 1e18.
  function _getFractionalTokenMultiple(uint256 newPrice) private view returns (int256 multiple) {
    int256 cachedReferenceBaseTokenPrice = int256(referenceBaseTokenPrice);

    int256 _ratio = ((int256(newPrice) - cachedReferenceBaseTokenPrice) * PRECISION_I256) /
      cachedReferenceBaseTokenPrice;
    multiple = (_ratio * int256(beta)) / PRECISION_I256;
  }

  /// @dev Internal function to compute intermediate fractional token nav.
  /// @param newPrice The current price of effective base token.
  function _getFractionalTokenNetAssetValue(uint256 newPrice) private view returns (uint256 nav) {
    int256 multiple = _getFractionalTokenMultiple(newPrice);

    if (multiple < 0 && uint256(-multiple) >= PRECISION) {
      revert ErrorFractionalTokenMultipleTooSmall();
    }
    if (multiple > 0 && uint256(multiple) >= PRECISION * PRECISION) {
      revert ErrorFractionalTokenMultipleTooLarge();
    }
    nav = (referenceFractionalTokenNav * uint256(PRECISION_I256 + multiple)) / PRECISION;
  }
}
