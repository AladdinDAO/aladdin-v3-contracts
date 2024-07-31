// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.25;

import { AccessControlUpgradeable } from "@openzeppelin/contracts-upgradeable-v4/access/AccessControlUpgradeable.sol";
import { IERC20MetadataUpgradeable } from "@openzeppelin/contracts-upgradeable-v4/token/ERC20/extensions/IERC20MetadataUpgradeable.sol";
import { MulticallUpgradeable } from "@openzeppelin/contracts-upgradeable-v4/utils/MulticallUpgradeable.sol";

import { WordCodec } from "../../../common/codec/WordCodec.sol";
import { IFxBasePool } from "../../../interfaces/f(x)/omni-vault/IFxBasePool.sol";
import { IFxOmniVault } from "../../../interfaces/f(x)/omni-vault/IFxOmniVault.sol";
import { IFxPriceOracleV2 } from "../../../interfaces/f(x)/IFxPriceOracleV2.sol";
import { IFxRateProvider } from "../../../interfaces/f(x)/IFxRateProvider.sol";

/// @dev Here we use *base token* refer to the base token without decimal or rate scale. And we
///      use *effective base token* refer to the base token scaled rate and 18 decimals.
abstract contract FxBasePool is MulticallUpgradeable, AccessControlUpgradeable, IFxBasePool {
  using WordCodec for bytes32;

  /**********
   * Errors *
   **********/

  /// @dev Thrown when the given address is zero.
  error ErrorZeroAddress();

  /// @dev Thrown when the caller is not `FxOmniVault` contract.
  error ErrorCallerIsNotVault();

  /// @dev Thrown when the stability ratio is too large.
  error ErrorStabilityRatioTooLarge();

  /// @dev Thrown when the stability ratio is too small.
  error ErrorMintStabilityRatioTooSmall();

  /// @dev Thrown when the mint pause ratio is too large.
  error ErrorMintPauseRatioTooLarge();

  /// @dev Thrown when the mint pause ratio is too small.
  error ErrorMintPauseRatioTooSmall();

  /// @dev Thrown when the default fee is too large.
  error ErrorDefaultFeeTooLarge();

  /// @dev Thrown when the delta fee is too small.
  error ErrorDeltaFeeTooSmall();

  /// @dev Thrown when the sum of default fee and delta fee is too large.
  error ErrorTotalFeeTooLarge();

  /// @dev Thrown when initialize pool twice.
  error ErrorPoolInitialized();

  /// @dev Thrown when mint exceed total capacity.
  error ErrorExceedTotalCapacity();

  /// @dev Thrown when the new capacity is smaller than current `effectiveBaseTokenSupply`.
  error ErrorNewEffectiveBaseTokenCapacityTooSmall();

  /// @dev Thrown when the twap price is invalid.
  error ErrorInvalidTwapPrice();

  /// @dev Thrown when we don't support current option.
  error ErrorNotSupportYet();

  /***********
   * Structs *
   ***********/

  struct SwapState {
    // Current supply of effective base token
    uint256 baseSupply;
    // Current nav of effective base token
    uint256 baseNav;
    // Current twap nav of effective base token
    uint256 baseTwapNav;
    // Current supply of fractional token
    uint256 fSupply;
    // Current nav of fractional token
    uint256 fNav;
    // Current supply of leveraged token
    uint256 xSupply;
    // Current nav of leveraged token
    uint256 xNav;
  }

  /*********
   * Enums *
   *********/

  enum JoinKind {
    INIT
  }

  enum Action {
    None,
    MintFractionalToken,
    MintLeveragedToken,
    RedeemFractionalToken,
    RedeemLeveragedToken
  }

  /*************
   * Constants *
   *************/

  /// @notice The role for emergency dao.
  bytes32 public constant EMERGENCY_DAO_ROLE = keccak256("EMERGENCY_DAO_ROLE");

  /// @dev The slot for price and rate cache, used in Transient Storage.
  bytes32 private constant PRICE_RATE_CACHE_SLOT = keccak256("PRICE_RATE_CACHE_SLOT");

  /// @dev The offset of mint flag in `miscData`.
  uint256 private constant MINT_FLAG_OFFSET = 0;

  /// @dev The offset of redeem flag in `miscData`.
  uint256 private constant REDEEM_FLAG_OFFSET = 2;

  /// @dev The offset of stability ratio in `miscData`.
  uint256 private constant STABILITY_RATIO_OFFSET = 5;

  /// @dev The offset of mint pause ratio in `miscData`.
  uint256 private constant MINT_PAUSE_RATIO_OFFSET = 69;

  /// @dev The offset of base scale in `miscData`.
  uint256 private constant BASE_SCALE_OFFSET = 133;

  /// @dev The offset of fractional token default mint fee ratio in `mintAndRedeemFeeData`.
  uint256 private constant FRACTIONAL_TOKEN_DEFAULT_MINT_FEE_OFFSET = 0;

  /// @dev The offset of fractional token delta mint fee ratio in `mintAndRedeemFeeData`.
  uint256 private constant FRACTIONAL_TOKEN_DELTA_MINT_FEE_OFFSET = 32;

  /// @dev The offset of leveraged token default mint fee ratio in `mintAndRedeemFeeData`.
  uint256 private constant LEVERAGED_TOKEN_DEFAULT_MINT_FEE_OFFSET = 64;

  /// @dev The offset of leveraged token delta mint fee ratio in `mintAndRedeemFeeData`.
  uint256 private constant LEVERAGED_TOKEN_DELTA_MINT_FEE_OFFSET = 96;

  /// @dev The offset of fractional token default redeem fee ratio in `mintAndRedeemFeeData`.
  uint256 private constant FRACTIONAL_TOKEN_DEFAULT_REDEEM_FEE_OFFSET = 128;

  /// @dev The offset of fractional token delta redeem fee ratio in `mintAndRedeemFeeData`.
  uint256 private constant FRACTIONAL_TOKEN_DELTA_REDEEM_FEE_OFFSET = 160;

  /// @dev The offset of leveraged token default redeem fee ratio in `mintAndRedeemFeeData`.
  uint256 private constant LEVERAGED_TOKEN_DEFAULT_REDEEM_FEE_OFFSET = 192;

  /// @dev The offset of leveraged token delta redeem fee ratio in `mintAndRedeemFeeData`.
  uint256 private constant LEVERAGED_TOKEN_DELTA_REDEEM_FEE_OFFSET = 224;

  /// @dev The offset of pending rewards in `pendingRewardsData`.
  uint256 internal constant PENDING_REWARDS_OFFSET = 0;

  /// @dev The offset of last token rate in `pendingRewardsData`.
  uint256 internal constant LAST_TOKEN_RATE_OFFSET = 96;

  /// @dev The precision used to compute nav.
  uint256 internal constant PRECISION = 1e18;

  /// @dev The precision used to compute fees.
  uint256 internal constant FEE_PRECISION = 1e9;

  /// @dev The address of `FxOmniVault` contract.
  address internal immutable vault;

  /*************
   * Variables *
   *************/

  /// @dev The address of corresponding base token.
  address internal baseToken;

  /// @dev The address of corresponding fractional token.
  address internal fractionalToken;

  /// @dev The address of corresponding leveraged token.
  address internal leveragedToken;

  /// @dev The address of price oracle contract for base token.
  address internal priceOracle;

  /// @dev The address of rate provider contract for base token.
  address internal rateProvider;

  /// @dev The address of corresponding fxUSD token.
  address internal fxUSD;

  /// @dev `miscData` is a storage slot that can be used to store unrelated pieces of information.
  ///
  /// - The *mint flag* indicate whether the token mint is paused.
  ///   - bit 0: whether fractional token mint is paused in any mode, 1 means paused.
  ///   - bit 1: whether leveraged token mint is paused in any mode, 1 means paused.
  /// - The *redeem flag* indicate whether the token redeem is paused.
  ///   - bit 0: whether fractional token redeem is paused in any mode, 1 means paused.
  ///   - bit 1: whether leveraged token redeem is paused in any mode, 1 means paused.
  ///   - bit 2: whether leveraged token redeem is paused in stability mode, 1 means paused.
  /// - The *stability ratio* is the collateral ratio to enter stability mode, multiplied by 1e18.
  /// - The *mint pause ratio* is the collateral ratio when fractional token mint is paused, multiplied by 1e18.
  /// - The *base scale* is the scale factor to scale base token decimals to 18, that is 10^(18-baseToken.decimals).
  ///
  /// [ mint flag | redeem flag | stability ratio | mint pause ratio | base scale | available ]
  /// [   2 bit   |    3 bit    |     64 bits     |     64  bits     |  60  bits  |  63 bits  ]
  /// [ MSB                                                                                                                 LSB ]
  bytes32 internal miscData;

  /// @dev `mintFeeData` is a storage slot that can be used to store mint/redeem fee ratio.
  ///
  /// - The *m.f.default* is the default mint fee ratio for fractional token, multiplied by 1e9.
  /// - The *m.f.delta* is the delta mint fee ratio for fractional token, multiplied by 1e9.
  /// - The *m.x.default* is the default mint fee ratio for leveraged token, multiplied by 1e9.
  /// - The *m.x.delta* is the delta mint fee ratio for leveraged token, multiplied by 1e9.
  /// - The *r.f.default* is the default redeem fee ratio for fractional token, multiplied by 1e9.
  /// - The *r.f.delta* is the delta redeem fee ratio for fractional token, multiplied by 1e9.
  /// - The *r.x.default* is the default redeem fee ratio for leveraged token, multiplied by 1e9.
  /// - The *r.x.delta* is the delta redeem fee ratio for leveraged token, multiplied by 1e9.
  ///
  /// [ m.f.default | m.f.delta | m.x.default | m.x.delta | r.f.default | r.f.delta | r.x.default | r.x.delta ]
  /// [   32  bit   |  32  bit  |   32  bit   |  32  bit  |   32  bit   |  32  bit  |   32  bit   |  32  bit  ]
  /// [ MSB                                                                                               LSB ]
  bytes32 internal mintAndRedeemFeeData;

  /// @dev `pendingRewardsData` is a storage slot that can be used to store pending rewards related data.
  ///
  /// - The *pending rewards* is the amount of pool revenue to be harvested.
  /// - The *last token rate* is the last base token rate.
  ///
  /// [ pending rewards | last token rate | available ]
  /// [     96 bits     |     96 bits     |  64 bits  ]
  /// [ MSB                                       LSB ]
  bytes32 internal pendingRewardsData;

  /// @notice The price used to initialize pool.
  uint256 public referenceBaseTokenPrice;

  /// @notice The total capacity for effective base token.
  uint256 public effectiveBaseTokenCapacity;

  /// @notice The amount of effective base tokens managed in current pool.
  uint256 public effectiveBaseTokenSupply;

  /// @dev Slots for future use.
  uint256[39] private _gap;

  /************
   * Modifier *
   ************/

  modifier onlyVault() {
    if (_msgSender() != vault) {
      revert ErrorCallerIsNotVault();
    }
    _;
  }

  /***************
   * Constructor *
   ***************/

  constructor(address _vault) {
    vault = _vault;
  }

  function __FxBasePool_init(
    address _baseToken,
    address _fractionalToken,
    address _leveragedToken,
    address _priceOracle,
    address _rateProvider,
    uint256 _stabilityRatio,
    uint256 _effectiveBaseTokenCapacity
  ) internal onlyInitializing {
    __Multicall_init();

    baseToken = _baseToken;
    fractionalToken = _fractionalToken;
    leveragedToken = _leveragedToken;

    _updateRateProvider(_rateProvider);
    _updatePriceOracle(_priceOracle);
    _updateEffectiveBaseTokenCapacity(_effectiveBaseTokenCapacity);
    _updateStabilityRatio(_stabilityRatio);
    _updateMintPauseRatio(PRECISION + 1);

    uint256 decimals = IERC20MetadataUpgradeable(_baseToken).decimals();
    miscData = miscData.insertUint(10**(18 - decimals), BASE_SCALE_OFFSET, 60);
  }

  /*************************
   * Public View Functions *
   *************************/

  /// @inheritdoc IFxBasePool
  function getVault() external view returns (address) {
    return vault;
  }

  /// @inheritdoc IFxBasePool
  function getBaseToken() external view returns (address) {
    return baseToken;
  }

  /// @inheritdoc IFxBasePool
  function getFractionalToken() external view returns (address) {
    return fractionalToken;
  }

  /// @inheritdoc IFxBasePool
  function getLeveragedToken() external view returns (address) {
    return leveragedToken;
  }

  /// @inheritdoc IFxBasePool
  function getFxUSD() external view returns (address) {
    return fxUSD;
  }

  /// @inheritdoc IFxBasePool
  function getPriceOracle() external view returns (address) {
    return priceOracle;
  }

  /// @inheritdoc IFxBasePool
  function getRateProvider() external view returns (address) {
    return rateProvider;
  }

  /// @inheritdoc IFxBasePool
  function getScalingFactor() external view returns (uint256) {
    return _getScalingFactor();
  }

  /// @inheritdoc IFxBasePool
  function getNetAssetValue(address token) external view returns (uint256 nav) {
    if (token == baseToken) {
      (nav, ) = _getPrice(Action.None);
    }
  }

  /// @inheritdoc IFxBasePool
  function getCollateralRatio() external view returns (uint256) {
    uint256[] memory balances = IFxOmniVault(vault).getPoolBalances(address(this));
    return getCollateralRatio(balances[1], balances[2]);
  }

  /// @inheritdoc IFxBasePool
  function getCollateralRatio(uint256 fSupply, uint256 xSupply) public view override returns (uint256) {
    return _collateralRatio(effectiveBaseTokenSupply, fSupply, xSupply);
  }

  /// @inheritdoc IFxBasePool
  function getMintStatus() public view returns (bool fractionalTokenStatus, bool leveragedTokenStatus) {
    uint256 mask = miscData.decodeUint(MINT_FLAG_OFFSET, 2);
    fractionalTokenStatus = (mask & 1) == 1;
    leveragedTokenStatus = ((mask >> 1) & 1) == 1;
  }

  /// @inheritdoc IFxBasePool
  function getRedeemStatus()
    public
    view
    returns (
      bool fractionalTokenStatus,
      bool leveragedTokenStatus,
      bool leveragedTokenStatusInStabilityMode
    )
  {
    uint256 mask = miscData.decodeUint(REDEEM_FLAG_OFFSET, 3);
    fractionalTokenStatus = (mask & 1) == 1;
    leveragedTokenStatus = ((mask >> 1) & 1) == 1;
    leveragedTokenStatusInStabilityMode = ((mask >> 2) & 1) == 1;
  }

  /// @inheritdoc IFxBasePool
  function getStabilityRatio() public view returns (uint256) {
    return miscData.decodeUint(STABILITY_RATIO_OFFSET, 30);
  }

  /// @inheritdoc IFxBasePool
  function getMintPauseRatio() public view returns (uint256) {
    return miscData.decodeUint(MINT_PAUSE_RATIO_OFFSET, 30);
  }

  /// @inheritdoc IFxBasePool
  function getMintOrRedeemFeeRatio(bool isRedeem, bool isLeveragedToken)
    public
    view
    returns (uint256 defaultFee, int256 deltaFee)
  {
    // compute offset to update
    uint256 defaultRatioOffset = (isRedeem ? 1 : 0) * 128 + (isLeveragedToken ? 1 : 0) * 64;
    uint256 deltaRatioOffset = defaultRatioOffset + 32;

    bytes32 cachedMintAndRedeemFeeData = mintAndRedeemFeeData;
    defaultFee = cachedMintAndRedeemFeeData.decodeUint(defaultRatioOffset, 32);
    deltaFee = cachedMintAndRedeemFeeData.decodeInt(deltaRatioOffset, 32);
  }

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @inheritdoc IFxBasePool
  function enableFxUSD(address _fxUSD) external onlyVault {
    fxUSD = _fxUSD;
  }

  /// @inheritdoc IFxBasePool
  function onPriceAndRateCache() external onlyVault {
    _cachePrice();
    _cacheRate();
  }

  /// @inheritdoc IFxBasePool
  function clearPriceAndRateCache() external onlyVault {
    bytes32 slot = PRICE_RATE_CACHE_SLOT;
    assembly {
      tstore(slot, 0)
      tstore(add(slot, 0x01), 0)
      tstore(add(slot, 0x02), 0)
      tstore(add(slot, 0x03), 0)
      tstore(add(slot, 0x04), 0)
    }
  }

  /// @inheritdoc IFxBasePool
  function onPoolMint(
    address sender,
    address recipient,
    uint256[] memory, /*balances*/
    bytes memory userData
  )
    external
    virtual
    onlyVault
    returns (
      uint256 amountIn,
      uint256[] memory amountsOut,
      uint256,
      uint256
    )
  {
    if (referenceBaseTokenPrice > 0) {
      revert ErrorPoolInitialized();
    }

    if (effectiveBaseTokenSupply == 0) {
      JoinKind kind;
      (kind, amountIn) = abi.decode(userData, (JoinKind, uint256));
      if (kind != JoinKind.INIT) revert ErrorNotSupportYet();

      uint256 rate = _cacheRate();
      uint256 scalingFactor = _getScalingFactor();
      uint256 baseSupply = (amountIn * scalingFactor) / PRECISION;

      (referenceBaseTokenPrice, amountsOut) = _onInitialize(sender, recipient, baseSupply, userData);
      emit InitializePool(sender, recipient, referenceBaseTokenPrice, baseSupply, amountsOut);

      effectiveBaseTokenSupply = baseSupply;
      pendingRewardsData = pendingRewardsData.insertUint(rate, LAST_TOKEN_RATE_OFFSET, 96);
    } else {
      revert ErrorNotSupportYet();
    }
  }

  /// @inheritdoc IFxBasePool
  function onPoolRedeem(
    address sender,
    address recipient,
    uint256[] memory balances,
    bytes calldata userData
  )
    external
    virtual
    onlyVault
    returns (
      uint256[] memory amountsIn,
      uint256 amountOut,
      uint256 dueProtocolFeeAmount,
      uint256 bonusEligibleAmount
    )
  {}

  /// @inheritdoc IFxBasePool
  function onPoolSwap(
    address sender,
    address recipient,
    uint256[] memory balances,
    uint256 amount,
    uint256 indexIn,
    uint256 indexOut,
    bytes calldata userData
  )
    external
    virtual
    onlyVault
    returns (
      uint256 amountIn,
      uint256 amountOut,
      uint256 dueProtocolFeeAmount,
      uint256 bonusEligibleAmount
    )
  {
    if (indexIn == 0 && indexOut == 1) {
      (amountIn, amountOut, dueProtocolFeeAmount) = _doFractionalTokenMint(
        sender,
        recipient,
        balances[0],
        balances[1],
        balances[2],
        amount,
        userData
      );
    } else if (indexIn == 0 && indexOut == 2) {
      (amountIn, amountOut, dueProtocolFeeAmount, bonusEligibleAmount) = _doLeveragedTokenMint(
        sender,
        recipient,
        balances[0],
        balances[1],
        balances[2],
        amount,
        userData
      );
    } else if (indexIn == 1 && indexOut == 0) {
      (amountIn, amountOut, dueProtocolFeeAmount, bonusEligibleAmount) = _doFractionalTokenRedeem(
        sender,
        recipient,
        balances[0],
        balances[1],
        balances[2],
        amount,
        userData
      );
    } else if (indexIn == 2 && indexOut == 0) {
      (amountIn, amountOut, dueProtocolFeeAmount) = _doLeveragedTokenRedeem(
        sender,
        recipient,
        balances[0],
        balances[1],
        balances[2],
        amount,
        userData
      );
    } else {
      revert ErrorNotSupportYet();
    }
  }

  /// @inheritdoc IFxBasePool
  function onHarvest(
    uint256 baseBalance,
    uint256 fSupply,
    uint256 xSupply
  ) external virtual onlyVault returns (uint256 harvested) {
    _beforeMintAndRedeem(Action.None, baseBalance, fSupply, xSupply);
    harvested = _onHarvest(baseBalance, fSupply, xSupply);
  }

  /************************
   * Restricted Functions *
   ************************/

  /// @notice Change address of price oracle contract.
  /// @param newPriceOracle The new address of price oracle contract.
  function updatePriceOracle(address newPriceOracle) external onlyRole(DEFAULT_ADMIN_ROLE) {
    _updatePriceOracle(newPriceOracle);
  }

  /// @notice Change address of rate provider contract.
  /// @param newRateProvider The new address of rate provider contract.
  function updateRateProvider(address newRateProvider) external onlyRole(DEFAULT_ADMIN_ROLE) {
    _updateRateProvider(newRateProvider);
  }

  /// @notice Update the effective base token capacity.
  /// @param newCapacity The new effective base token capacity.
  function updateEffectiveBaseTokenCapacity(uint256 newCapacity) external onlyRole(DEFAULT_ADMIN_ROLE) {
    _updateEffectiveBaseTokenCapacity(newCapacity);
  }

  /// @notice Update the stability ratio.
  /// @param _newRatio The new collateral ratio to enter stability mode, multiplied by 1e18.
  function updateStabilityRatio(uint256 _newRatio) external onlyRole(DEFAULT_ADMIN_ROLE) {
    _updateStabilityRatio(_newRatio);
  }

  /// @notice Update mint pause ratio.
  /// @param newRatio The new collateral ratio to pause fractional token mint, multiplied by 1e18.
  function updateMintPauseRatio(uint256 newRatio) external onlyRole(DEFAULT_ADMIN_ROLE) {
    _updateMintPauseRatio(newRatio);
  }

  /// @notice Update mint pause status.
  /// @param newFractionalTokenStatus The new mint pause status for fractional token.
  /// @param newLeveragedTokenStatus The new mint pause status for leveraged token.
  function updateMintStatus(bool newFractionalTokenStatus, bool newLeveragedTokenStatus)
    external
    onlyRole(EMERGENCY_DAO_ROLE)
  {
    uint256 newMask;
    unchecked {
      newMask = uint256(newFractionalTokenStatus ? 1 : 0) + (uint256(newLeveragedTokenStatus ? 1 : 0) << 1);
    }
    uint256 oldMask = _updateUintInMiscData(newMask, MINT_FLAG_OFFSET, 2);

    emit UpdateMintStatus(oldMask, newMask);
  }

  /// @notice Update redeem pause status.
  /// @param newFractionalTokenStatus The new redeem pause status for fractional token.
  /// @param newLeveragedTokenStatus The new redeem pause status for leveraged token.
  /// @param newLeveragedTokenStatusInStabilityMode The new redeem pause status for leveraged token in stability mode.
  function updateRedeemStatus(
    bool newFractionalTokenStatus,
    bool newLeveragedTokenStatus,
    bool newLeveragedTokenStatusInStabilityMode
  ) external onlyRole(EMERGENCY_DAO_ROLE) {
    uint256 newMask;
    unchecked {
      newMask =
        uint256(newFractionalTokenStatus ? 1 : 0) +
        (uint256(newLeveragedTokenStatus ? 1 : 0) << 1) +
        (uint256(newLeveragedTokenStatusInStabilityMode ? 1 : 0) << 2);
    }
    uint256 oldMask = _updateUintInMiscData(newMask, REDEEM_FLAG_OFFSET, 3);

    emit UpdateRedeemStatus(oldMask, newMask);
  }

  /// @notice Update the mint or redeem fee ratio for fractional token or leveraged token.
  /// @param isRedeem Whether we are updating redeem fee ratio.
  /// @param isLeveragedToken Whether we are updating fee ratio for leveraged token.
  /// @param newDefaultRatio The new default fee ratio, multiplied by 1e9.
  /// @param newDeltaRatio The new extra fee ratio, multiplied by 1e9.
  function updateMintOrRedeemFeeRatio(
    bool isRedeem,
    bool isLeveragedToken,
    uint256 newDefaultRatio,
    int256 newDeltaRatio
  ) external onlyRole(DEFAULT_ADMIN_ROLE) {
    _updateMintOrRedeemFeeRatio(isRedeem, isLeveragedToken, newDefaultRatio, newDeltaRatio);
  }

  /**********************
   * Internal Functions *
   **********************/

  /// @dev Internal function to change the address of price oracle contract.
  /// @param newPriceOracle The new address of price oracle contract.
  function _updatePriceOracle(address newPriceOracle) internal {
    if (newPriceOracle == address(0)) {
      revert ErrorZeroAddress();
    }

    address oldPriceOracle = priceOracle;
    priceOracle = newPriceOracle;

    emit UpdatePriceOracle(oldPriceOracle, newPriceOracle);
  }

  /// @dev Internal function to change the address of rate provider contract.
  /// @param newRateProvider The new address of rate provider contract.
  function _updateRateProvider(address newRateProvider) internal {
    if (newRateProvider == address(0)) {
      revert ErrorZeroAddress();
    }

    address oldRateProvider = rateProvider;
    rateProvider = newRateProvider;

    emit UpdateRateProvider(oldRateProvider, newRateProvider);
  }

  /// @dev Internal function to change the effective base token capacity.
  /// @param newCapacity The new effective base token capacity.
  function _updateEffectiveBaseTokenCapacity(uint256 newCapacity) internal {
    if (newCapacity < effectiveBaseTokenSupply) {
      revert ErrorNewEffectiveBaseTokenCapacityTooSmall();
    }

    uint256 oldCapacity = effectiveBaseTokenCapacity;
    effectiveBaseTokenCapacity = newCapacity;

    emit UpdateEffectiveBaseTokenCapacity(oldCapacity, newCapacity);
  }

  /// @dev Internal function to update unsigned integer in `miscData`.
  /// @param newValue The new value to update.
  /// @param offset The offset of the new value.
  /// @param length The bits length of the new value.
  /// @return oldValue The original value in the given offset.
  function _updateUintInMiscData(
    uint256 newValue,
    uint256 offset,
    uint256 length
  ) internal returns (uint256 oldValue) {
    bytes32 cachedMiscData = miscData;
    oldValue = cachedMiscData.decodeUint(offset, length);
    miscData = cachedMiscData.insertUint(newValue, offset, length);
  }

  /// @dev Internal function to update stability ratio.
  /// @param newRatio The new collateral ratio to enter stability mode, multiplied by 1e18.
  function _updateStabilityRatio(uint256 newRatio) internal {
    if (newRatio > type(uint64).max) {
      revert ErrorStabilityRatioTooLarge();
    }
    if (newRatio <= PRECISION) {
      revert ErrorMintStabilityRatioTooSmall();
    }

    uint256 oldRatio = _updateUintInMiscData(newRatio, STABILITY_RATIO_OFFSET, 64);
    emit UpdateStabilityRatio(oldRatio, newRatio);
  }

  /// @dev Internal function to update mint pause ratio.
  /// @param newRatio The new collateral ratio to pause fractional token mint, multiplied by 1e18.
  function _updateMintPauseRatio(uint256 newRatio) internal {
    if (newRatio > type(uint64).max) {
      revert ErrorMintPauseRatioTooLarge();
    }
    if (newRatio <= PRECISION) {
      revert ErrorMintPauseRatioTooSmall();
    }
    uint256 oldRatio = _updateUintInMiscData(newRatio, MINT_PAUSE_RATIO_OFFSET, 64);
    emit UpdateMintPauseRatio(oldRatio, newRatio);
  }

  /// @dev Internal function to update the mint or redeem fee ratio for fractional token or leveraged token.
  /// @param isRedeem Whether we are updating redeem fee ratio.
  /// @param isLeveragedToken Whether we are updating fee ratio for leveraged token.
  /// @param newDefaultRatio The new default fee ratio, multiplied by 1e9.
  /// @param newDeltaRatio The new extra fee ratio, multiplied by 1e9.
  function _updateMintOrRedeemFeeRatio(
    bool isRedeem,
    bool isLeveragedToken,
    uint256 newDefaultRatio,
    int256 newDeltaRatio
  ) internal {
    unchecked {
      // validate fee ratios
      if (newDefaultRatio > FEE_PRECISION) {
        revert ErrorDefaultFeeTooLarge();
      }
      if (newDeltaRatio < 0) {
        if (uint256(-newDeltaRatio) > newDefaultRatio) {
          revert ErrorDeltaFeeTooSmall();
        }
      } else {
        if (uint256(newDeltaRatio) > FEE_PRECISION - newDefaultRatio) {
          revert ErrorTotalFeeTooLarge();
        }
      }

      // compute offset to update
      uint256 defaultRatioOffset = (isRedeem ? 1 : 0) * 128 + (isLeveragedToken ? 1 : 0) * 64;
      uint256 deltaRatioOffset = defaultRatioOffset + 32;

      // do real update
      bytes32 cachedMintAndRedeemFeeData = mintAndRedeemFeeData;
      cachedMintAndRedeemFeeData = cachedMintAndRedeemFeeData.insertUint(newDefaultRatio, defaultRatioOffset, 32);
      mintAndRedeemFeeData = cachedMintAndRedeemFeeData.insertInt(newDeltaRatio, deltaRatioOffset, 32);
    }

    emit UpdateMintOrRedeemFeeRatio(isRedeem, isLeveragedToken, newDefaultRatio, newDeltaRatio);
  }

  /// @dev Internal function to get the scaling factor for base token to effective base token.
  function _getScalingFactor() internal view virtual returns (uint256) {
    uint256 rate = _getRate();
    uint256 scale = miscData.decodeUint(BASE_SCALE_OFFSET, 60);
    return rate * scale;
  }

  /// @dev Internal function to cache effective base token prices to transient storage.
  function _cachePrice() private {
    bytes32 slot = PRICE_RATE_CACHE_SLOT;
    uint256 twap;
    assembly {
      twap := tload(add(slot, 0x01))
    }
    if (twap > 0) return;

    bool isValid;
    uint256 minPrice;
    uint256 maxPrice;
    (isValid, twap, minPrice, maxPrice) = IFxPriceOracleV2(priceOracle).getPrice();
    assembly {
      tstore(slot, isValid)
      tstore(add(slot, 0x01), twap)
      tstore(add(slot, 0x02), minPrice)
      tstore(add(slot, 0x03), maxPrice)
    }
  }

  /// @dev Internal function to get current effective base token price.
  /// @param action The current operation we are considering.
  /// @return twap The time-weighted average price of effective base token. This is always greater than 0.
  /// @return spotPrice The spot price of effective base token. This is always greater than 0.
  function _getPrice(Action action) internal view returns (uint256 twap, uint256 spotPrice) {
    bytes32 slot = PRICE_RATE_CACHE_SLOT;
    assembly {
      twap := tload(add(slot, 0x01))
    }
    uint256 minPrice;
    uint256 maxPrice;
    if (twap == 0) {
      (, twap, minPrice, maxPrice) = IFxPriceOracleV2(priceOracle).getPrice();
    } else {
      assembly {
        minPrice := tload(add(slot, 0x02))
        maxPrice := tload(add(slot, 0x03))
      }
    }

    if (action == Action.MintFractionalToken || action == Action.RedeemLeveragedToken) {
      spotPrice = minPrice;
    } else if (action == Action.MintLeveragedToken || action == Action.RedeemFractionalToken) {
      spotPrice = maxPrice;
    } else {
      spotPrice = maxPrice;
    }

    if (twap == 0) {
      revert ErrorInvalidTwapPrice();
    }
  }

  /// @dev Internal function to cache base token rate to transient storage.
  function _cacheRate() private returns (uint256 rate) {
    bytes32 slot = PRICE_RATE_CACHE_SLOT;
    assembly {
      rate := tload(add(slot, 0x04))
    }
    if (rate > 0) return rate;

    rate = _getRateWithoutCache();
    assembly {
      tstore(add(slot, 0x04), rate)
    }
  }

  /// @dev Internal function to get base token rate.
  function _getRate() internal view returns (uint256 rate) {
    bytes32 slot = PRICE_RATE_CACHE_SLOT;
    assembly {
      rate := tload(add(slot, 0x04))
    }
    if (rate == 0) {
      rate = _getRateWithoutCache();
    }
  }

  /// @dev Internal function to get token rate without reading
  function _getRateWithoutCache() private view returns (uint256 rate) {
    rate = PRECISION;
    address cachedRateProvider = rateProvider;
    if (cachedRateProvider != address(0)) {
      rate = IFxRateProvider(cachedRateProvider).getRate();
    }
  }

  /// @dev Internal function to scale base token amount to effective base token amount.
  function _scaleUp(uint256 amount) internal view returns (uint256) {
    return (amount * _getScalingFactor()) / PRECISION;
  }

  /// @dev Internal function to scale effective base token amount to base token amount.
  function _scaleDown(uint256 amount) internal view returns (uint256) {
    return (amount * PRECISION) / _getScalingFactor();
  }

  /// @dev Hooks before actual minting and redeeming.
  /// @param action The current operation we are considering.
  /// @param baseBalance The amount of base tokens held by this market.
  /// @param fSupply The total supply of fractional token.
  /// @param xSupply The total supply of leveraged token.
  function _beforeMintAndRedeem(
    Action action,
    uint256 baseBalance,
    uint256 fSupply,
    uint256 xSupply
  ) internal virtual {}

  /// @dev Hooks after actual minting and redeeming.
  /// @param action The current operation we are considering.
  function _afterMintAndRedeem(Action action) internal virtual {}

  /// @dev Do fractional token mint.
  /// @param sender The address of base token sender.
  /// @param recipient The address of fractional token and leveraged token receiver.
  /// @param baseBalance The amount of base tokens held by this market.
  /// @param fSupply The supply of fractional token.
  /// @param xSupply The supply of leveraged token.
  /// @param amount The amount of base tokens to use.
  /// @param userData The custom user calldata.
  /// @return amountIn The real amount of base tokens used, including protocol fee.
  /// @return amountOut The amount of fractional tokens minted.
  /// @return dueProtocolFeeAmount The amount of base tokens as protocol fee.
  function _doFractionalTokenMint(
    address sender,
    address recipient,
    uint256 baseBalance,
    uint256 fSupply,
    uint256 xSupply,
    uint256 amount,
    bytes calldata userData
  )
    internal
    virtual
    returns (
      uint256 amountIn,
      uint256 amountOut,
      uint256 dueProtocolFeeAmount
    )
  {
    _beforeMintAndRedeem(Action.MintFractionalToken, baseBalance, fSupply, xSupply);

    amount = _scaleUp(amount);
    uint256 baseSupply = effectiveBaseTokenSupply;
    (amountIn, amountOut, dueProtocolFeeAmount) = _onFractionalTokenMint(
      sender,
      recipient,
      baseSupply,
      fSupply,
      xSupply,
      amount,
      userData
    );

    emit MintFractionalToken(sender, recipient, amountIn, amountOut, dueProtocolFeeAmount);

    unchecked {
      baseSupply += amountIn - dueProtocolFeeAmount;
      if (baseSupply > effectiveBaseTokenCapacity) {
        revert ErrorExceedTotalCapacity();
      }

      effectiveBaseTokenSupply = baseSupply;
    }

    amountIn = _scaleDown(amountIn);
    dueProtocolFeeAmount = _scaleDown(dueProtocolFeeAmount);

    _afterMintAndRedeem(Action.MintFractionalToken);
  }

  /// @dev Do leveraged token mint.
  /// @param sender The address of base token sender.
  /// @param recipient The address of fractional token and leveraged token receiver.
  /// @param baseBalance The amount of base tokens held by this market.
  /// @param fSupply The supply of fractional token.
  /// @param xSupply The supply of leveraged token.
  /// @param amount The amount of base tokens to use.
  /// @param userData The custom user calldata.
  /// @return amountIn The real amount of base tokens used, including protocol fee.
  /// @return amountOut The amount of fractional tokens minted.
  /// @return dueProtocolFeeAmount The amount of base tokens as protocol fee.
  /// @return bonusEligibleAmount The amount of base tokens eligible for bonus.
  function _doLeveragedTokenMint(
    address sender,
    address recipient,
    uint256 baseBalance,
    uint256 fSupply,
    uint256 xSupply,
    uint256 amount,
    bytes calldata userData
  )
    internal
    virtual
    returns (
      uint256 amountIn,
      uint256 amountOut,
      uint256 dueProtocolFeeAmount,
      uint256 bonusEligibleAmount
    )
  {
    _beforeMintAndRedeem(Action.MintLeveragedToken, baseBalance, fSupply, xSupply);

    amount = _scaleUp(amount);
    uint256 baseSupply = effectiveBaseTokenSupply;
    (amountIn, amountOut, dueProtocolFeeAmount, bonusEligibleAmount) = _onLeveragedTokenMint(
      sender,
      recipient,
      baseSupply,
      fSupply,
      xSupply,
      amount,
      userData
    );
    emit MintLeveragedToken(sender, recipient, amountIn, amountOut, dueProtocolFeeAmount, bonusEligibleAmount);

    unchecked {
      baseSupply += amountIn - dueProtocolFeeAmount;
      if (baseSupply > effectiveBaseTokenCapacity) {
        revert ErrorExceedTotalCapacity();
      }

      effectiveBaseTokenSupply = baseSupply;
    }

    amountIn = _scaleDown(amountIn);
    dueProtocolFeeAmount = _scaleDown(dueProtocolFeeAmount);
    // most time it is zero, add this check to save gas.
    if (bonusEligibleAmount > 0) {
      bonusEligibleAmount = _scaleDown(bonusEligibleAmount);
    }

    _afterMintAndRedeem(Action.MintLeveragedToken);
  }

  /// @dev Do fractional token redeem.
  /// @param sender The address of base token sender.
  /// @param recipient The address of fractional token and leveraged token receiver.
  /// @param baseBalance The amount of base tokens held by this market.
  /// @param fSupply The supply of fractional token.
  /// @param xSupply The supply of leveraged token.
  /// @param amount The amount of fractional tokens to use.
  /// @param userData The custom user calldata.
  /// @return amountIn The real amount of fractional tokens used.
  /// @return amountOut The amount of base tokens redeemed, excluding protocol fee.
  /// @return dueProtocolFeeAmount The amount of base tokens as protocol fee.
  /// @return bonusEligibleAmount The amount of base tokens eligible for bonus.
  function _doFractionalTokenRedeem(
    address sender,
    address recipient,
    uint256 baseBalance,
    uint256 fSupply,
    uint256 xSupply,
    uint256 amount,
    bytes calldata userData
  )
    internal
    virtual
    returns (
      uint256 amountIn,
      uint256 amountOut,
      uint256 dueProtocolFeeAmount,
      uint256 bonusEligibleAmount
    )
  {
    _beforeMintAndRedeem(Action.RedeemFractionalToken, baseBalance, fSupply, xSupply);

    uint256 baseSupply = effectiveBaseTokenSupply;
    (amountIn, amountOut, dueProtocolFeeAmount, bonusEligibleAmount) = _onFractionalTokenRedeem(
      sender,
      recipient,
      baseSupply,
      fSupply,
      xSupply,
      amount,
      userData
    );
    emit RedeemFractionalToken(sender, recipient, amountIn, amountOut, dueProtocolFeeAmount, bonusEligibleAmount);

    unchecked {
      effectiveBaseTokenSupply = baseSupply - amountOut;
    }

    amountOut = _scaleDown(amountOut);
    dueProtocolFeeAmount = _scaleDown(dueProtocolFeeAmount);
    // most time it is zero, add this check to save gas.
    if (bonusEligibleAmount > 0) {
      bonusEligibleAmount = _scaleDown(bonusEligibleAmount);
    }

    _afterMintAndRedeem(Action.RedeemFractionalToken);
  }

  /// @dev Do leveraged token redeem.
  /// @param sender The address of base token sender.
  /// @param recipient The address of fractional token and leveraged token receiver.
  /// @param baseBalance The amount of base tokens held by this market.
  /// @param fSupply The supply of fractional token.
  /// @param xSupply The supply of leveraged token.
  /// @param amount The amount of leveraged tokens to use.
  /// @param userData The custom user calldata.
  /// @return amountIn The real amount of leveraged tokens used.
  /// @return amountOut The amount of base tokens redeemed, excluding protocol fee.
  /// @return dueProtocolFeeAmount The amount of base tokens as protocol fee.
  function _doLeveragedTokenRedeem(
    address sender,
    address recipient,
    uint256 baseBalance,
    uint256 fSupply,
    uint256 xSupply,
    uint256 amount,
    bytes calldata userData
  )
    internal
    virtual
    returns (
      uint256 amountIn,
      uint256 amountOut,
      uint256 dueProtocolFeeAmount
    )
  {
    _beforeMintAndRedeem(Action.RedeemLeveragedToken, baseBalance, fSupply, xSupply);

    uint256 baseSupply = effectiveBaseTokenSupply;
    (amountIn, amountOut, dueProtocolFeeAmount) = _onLeveragedTokenRedeem(
      sender,
      recipient,
      baseSupply,
      fSupply,
      xSupply,
      amount,
      userData
    );
    emit RedeemLeveragedToken(sender, recipient, amountIn, amountOut, dueProtocolFeeAmount);

    unchecked {
      effectiveBaseTokenSupply = baseSupply - amountOut;
    }

    amountOut = _scaleDown(amountOut);
    dueProtocolFeeAmount = _scaleDown(dueProtocolFeeAmount);

    _afterMintAndRedeem(Action.RedeemLeveragedToken);
  }

  /// @dev Actual internal function to do initialize.
  /// @param sender The address of base token sender.
  /// @param recipient The address of fractional token and leveraged token receiver.
  /// @param baseSupply The supply of effective base token.
  /// @param userData The custom user calldata.
  /// @return price The effective base token price used to initialize.
  /// @return amountsOut The amount of fractional tokens and leveraged tokens minted.
  function _onInitialize(
    address sender,
    address recipient,
    uint256 baseSupply,
    bytes memory userData
  ) internal virtual returns (uint256 price, uint256[] memory amountsOut);

  /// @dev Actual internal function to do fractional token mint.
  /// @param sender The address of base token sender.
  /// @param recipient The address of fractional token and leveraged token receiver.
  /// @param baseSupply The supply of effective base token.
  /// @param fSupply The supply of fractional token.
  /// @param xSupply The supply of leveraged token.
  /// @param amount The amount of effective base tokens to use.
  /// @param userData The custom user calldata.
  /// @return amountIn The real amount of effective base tokens used, including protocol fee.
  /// @return amountOut The amount of fractional tokens minted.
  /// @return dueProtocolFeeAmount The amount of effective base tokens as protocol fee.
  function _onFractionalTokenMint(
    address sender,
    address recipient,
    uint256 baseSupply,
    uint256 fSupply,
    uint256 xSupply,
    uint256 amount,
    bytes calldata userData
  )
    internal
    virtual
    returns (
      uint256 amountIn,
      uint256 amountOut,
      uint256 dueProtocolFeeAmount
    );

  /// @dev Actual internal function to do leveraged token mint.
  /// @param sender The address of base token sender.
  /// @param recipient The address of fractional token and leveraged token receiver.
  /// @param baseSupply The supply of effective base token.
  /// @param fSupply The supply of fractional token.
  /// @param xSupply The supply of leveraged token.
  /// @param amount The amount of effective base tokens to use.
  /// @param userData The custom user calldata.
  /// @return amountIn The real amount of effective base tokens used, including protocol fee.
  /// @return amountOut The amount of fractional tokens minted.
  /// @return dueProtocolFeeAmount The amount of effective base tokens as protocol fee.
  /// @return bonusEligibleAmount The amount of effective base tokens eligible for bonus.
  function _onLeveragedTokenMint(
    address sender,
    address recipient,
    uint256 baseSupply,
    uint256 fSupply,
    uint256 xSupply,
    uint256 amount,
    bytes calldata userData
  )
    internal
    virtual
    returns (
      uint256 amountIn,
      uint256 amountOut,
      uint256 dueProtocolFeeAmount,
      uint256 bonusEligibleAmount
    );

  /// @dev Actual internal function to do fractional token redeem.
  /// @param sender The address of base token sender.
  /// @param recipient The address of fractional token and leveraged token receiver.
  /// @param baseSupply The supply of effective base token.
  /// @param fSupply The supply of fractional token.
  /// @param xSupply The supply of leveraged token.
  /// @param amount The amount of fractional tokens to use.
  /// @param userData The custom user calldata.
  /// @return amountIn The real amount of fractional tokens used.
  /// @return amountOut The amount of effective base tokens redeemed, excluding protocol fee.
  /// @return dueProtocolFeeAmount The amount of effective base tokens as protocol fee.
  /// @return bonusEligibleAmount The amount of effective base tokens eligible for bonus.
  function _onFractionalTokenRedeem(
    address sender,
    address recipient,
    uint256 baseSupply,
    uint256 fSupply,
    uint256 xSupply,
    uint256 amount,
    bytes calldata userData
  )
    internal
    virtual
    returns (
      uint256 amountIn,
      uint256 amountOut,
      uint256 dueProtocolFeeAmount,
      uint256 bonusEligibleAmount
    );

  /// @dev Actual internal function to do leveraged token redeem.
  /// @param sender The address of base token sender.
  /// @param recipient The address of fractional token and leveraged token receiver.
  /// @param baseSupply The supply of effective base token.
  /// @param fSupply The supply of fractional token.
  /// @param xSupply The supply of leveraged token.
  /// @param amount The amount of leveraged tokens to use.
  /// @param userData The custom user calldata.
  /// @return amountIn The real amount of leveraged tokens used.
  /// @return amountOut The amount of effective base tokens redeemed, excluding protocol fee.
  /// @return dueProtocolFeeAmount The amount of effective base tokens as protocol fee.
  function _onLeveragedTokenRedeem(
    address sender,
    address recipient,
    uint256 baseSupply,
    uint256 fSupply,
    uint256 xSupply,
    uint256 amount,
    bytes calldata userData
  )
    internal
    virtual
    returns (
      uint256 amountIn,
      uint256 amountOut,
      uint256 dueProtocolFeeAmount
    );

  /// @dev Actual internal function to do harvest.
  /// @param baseBalance The amount of base tokens held by this market.
  /// @param fSupply The total supply of fractional token.
  /// @param xSupply The total supply of leveraged token.
  /// @return harvested The amount of base tokens harvested.
  function _onHarvest(
    uint256 baseBalance,
    uint256 fSupply,
    uint256 xSupply
  ) internal virtual returns (uint256 harvested);

  /// @dev Internal function to get the `SwapState` struct for future use.
  /// @param action The current operation we are considering.
  /// @param baseSupply The supply for effective base token.
  /// @param fSupply The supply for fractional token.
  /// @param xSupply The supply for leveraged token.
  /// @return state The expected `SwapState` struct.
  function _getSwapState(
    Action action,
    uint256 baseSupply,
    uint256 fSupply,
    uint256 xSupply
  ) internal view virtual returns (SwapState memory state);

  /// @dev Internal function to compute the collateral ratio.
  /// @param baseSupply The supply for effective base token.
  /// @param fSupply The supply for fractional token.
  /// @param xSupply The supply for leveraged token.
  /// @return ratio The collateral ratio, multiplied by 1e18.
  function _collateralRatio(
    uint256 baseSupply,
    uint256 fSupply,
    uint256 xSupply
  ) internal view virtual returns (uint256 ratio);

  /// @dev Internal function to compute the nav of fractional token.
  function _getFractionalTokenNetAssetValue() internal view virtual returns (uint256 nav);

  /// @dev Internal function to compute the nav of leveraged token.
  function _getLeveragedTokenNetAssetValue() internal view virtual returns (uint256 nav);
}
