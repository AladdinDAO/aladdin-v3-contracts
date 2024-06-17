// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import { AccessControlUpgradeable } from "@openzeppelin/contracts-upgradeable-v4/access/AccessControlUpgradeable.sol";
import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable-v4/security/ReentrancyGuardUpgradeable.sol";
import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable-v4/token/ERC20/IERC20Upgradeable.sol";
import { SafeERC20Upgradeable } from "@openzeppelin/contracts-upgradeable-v4/token/ERC20/utils/SafeERC20Upgradeable.sol";

import { WordCodec } from "../../common/codec/WordCodec.sol";

import { IFxMarketV2 } from "../../interfaces/f(x)/IFxMarketV2.sol";
import { IFxRebalancePoolRegistry } from "../../interfaces/f(x)/IFxRebalancePoolRegistry.sol";
import { IFxReservePool } from "../../interfaces/f(x)/IFxReservePool.sol";
import { IFxTreasuryV2 } from "../../interfaces/f(x)/IFxTreasuryV2.sol";

// solhint-disable max-states-count

contract MarketV2 is AccessControlUpgradeable, ReentrancyGuardUpgradeable, IFxMarketV2 {
  using SafeERC20Upgradeable for IERC20Upgradeable;

  using WordCodec for bytes32;

  /*************
   * Constants *
   *************/

  /// @notice The role for emergency dao.
  bytes32 public constant EMERGENCY_DAO_ROLE = keccak256("EMERGENCY_DAO_ROLE");

  /// @dev The precision used to compute nav.
  uint256 private constant FEE_PRECISION = 1e18;

  /// @dev The offset of mint flag in `marketConfigData`.
  uint256 private constant MINT_FLAG_OFFSET = 0;

  /// @dev The offset of redeem flag in `marketConfigData`.
  uint256 private constant REDEEM_FLAG_OFFSET = 1;

  /// @dev The offset of stability mode mint flag in `marketConfigData`.
  uint256 private constant MINT_FLAG_STABILITY_OFFSET = 2;

  /// @dev The offset of stability mode redeem flag in `marketConfigData`.
  uint256 private constant REDEEM_FLAG_STABILITY_OFFSET = 3;

  /// @dev The offset of stability ratio in `marketConfigData`.
  uint256 private constant STABILITY_RATIO_OFFSET = 34;

  /// @dev The offset of default fToken fee ratio in `mintFeeData` and `redeemFeeData`.
  uint256 private constant FTOKEN_DEFAULT_FEE_OFFSET = 0;

  /// @dev The offset of delta fToken fee ratio in `mintFeeData` and `redeemFeeData`.
  uint256 private constant FTOKEN_DELTA_FEE_OFFSET = 64;

  /// @dev The offset of default xToken fee ratio in `mintFeeData` and `redeemFeeData`.
  uint256 private constant XTOKEN_DEFAULT_FEE_OFFSET = 128;

  /// @dev The offset of delta xToken fee ratio in `mintFeeData` and `redeemFeeData`.
  uint256 private constant XTOKEN_DELTA_FEE_OFFSET = 192;

  /// @inheritdoc IFxMarketV2
  address public immutable override treasury;

  /// @inheritdoc IFxMarketV2
  address public immutable override baseToken;

  /// @inheritdoc IFxMarketV2
  address public immutable override fToken;

  /// @inheritdoc IFxMarketV2
  address public immutable override xToken;

  /*************
   * Variables *
   *************/

  /// @dev `marketConfigData` is a storage slot that can be used to store market configuration.
  ///
  /// - The *mint flag* indicate whether the token mint is paused (both fToken and xToken).
  /// - The *redeem flag* indicate whether the token redeem is paused (both fToken and xToken).
  /// - The *mint flag stability* indicate whether the fToken mint is paused in stability mode.
  /// - The *redeem flag stability* indicate whether the xToken redeem is paused in stability mode.
  /// - The *stability ratio* is the collateral ratio to enter stability mode, multiplied by 1e18.
  ///
  /// [ mint flag | redeem flag | mint flag stability | redeem flag stability | stability ratio | available ]
  /// [   1 bit   |    1 bit    |        1 bit        |         1 bit         |     64 bits     |  188 bits ]
  /// [ MSB                                                                                             LSB ]
  bytes32 private marketConfigData;

  /// @dev `mintFeeData` is a storage slot that can be used to store mint fee ratio.
  ///
  /// [ default fToken | delta fToken | default xToken | delta xToken |
  /// [     64 bit     |    64 bit    |     64 bit     |    64 bit    ]
  /// [ MSB                                                       LSB ]
  bytes32 private mintFeeData;

  /// @dev `redeemFeeData` is a storage slot that can be used to store redeem fee ratio.
  ///
  /// [ default fToken | delta fToken | default xToken | delta xToken |
  /// [     64 bit     |    64 bit    |     64 bit     |    64 bit    ]
  /// [ MSB                                                       LSB ]
  bytes32 private redeemFeeData;

  /// @notice The address of platform contract;
  address public platform;

  /// @notice The address of ReservePool contract.
  address public reservePool;

  /// @notice The address of RebalancePoolRegistry contract.
  address public registry;

  /// @inheritdoc IFxMarketV2
  address public fxUSD;

  /// @dev Slots for future use.
  uint256[43] private _gap;

  /***************
   * Constructor *
   ***************/

  constructor(address _treasury) {
    treasury = _treasury;

    baseToken = IFxTreasuryV2(_treasury).baseToken();
    fToken = IFxTreasuryV2(_treasury).fToken();
    xToken = IFxTreasuryV2(_treasury).xToken();
  }

  function initialize(
    address _platform,
    address _reservePool,
    address _registry
  ) external initializer {
    __Context_init();
    __ERC165_init();
    __AccessControl_init();
    __ReentrancyGuard_init();

    _setupRole(DEFAULT_ADMIN_ROLE, _msgSender());

    _updatePlatform(_platform);
    _updateReservePool(_reservePool);
    _updateRebalancePoolRegistry(_registry);
  }

  /*************************
   * Public View Functions *
   *************************/

  /// @notice Return whether token mint is paused.
  function mintPaused() public view returns (bool) {
    return marketConfigData.decodeBool(MINT_FLAG_OFFSET);
  }

  /// @notice Return whether token redeem is paused.
  function redeemPaused() public view returns (bool) {
    return marketConfigData.decodeBool(REDEEM_FLAG_OFFSET);
  }

  /// @notice Return whether fToken mint is paused in stability mode.
  function fTokenMintPausedInStabilityMode() public view returns (bool) {
    return marketConfigData.decodeBool(MINT_FLAG_STABILITY_OFFSET);
  }

  /// @notice Return whether xToken redeem is paused in stability mode.
  function xTokenRedeemPausedInStabilityMode() public view returns (bool) {
    return marketConfigData.decodeBool(REDEEM_FLAG_STABILITY_OFFSET);
  }

  /// @inheritdoc IFxMarketV2
  function stabilityRatio() public view returns (uint256) {
    return marketConfigData.decodeUint(STABILITY_RATIO_OFFSET, 64);
  }

  /// @notice The mint fee ratio for fToken.
  function fTokenMintFeeRatio() public view returns (uint256 defaultFee, int256 deltaFee) {
    bytes32 _mintFeeData = mintFeeData;
    defaultFee = _mintFeeData.decodeUint(FTOKEN_DEFAULT_FEE_OFFSET, 64);
    deltaFee = _mintFeeData.decodeInt(FTOKEN_DELTA_FEE_OFFSET, 64);
  }

  /// @notice The mint fee ratio for xToken.
  function xTokenMintFeeRatio() public view returns (uint256 defaultFee, int256 deltaFee) {
    bytes32 _mintFeeData = mintFeeData;
    defaultFee = _mintFeeData.decodeUint(XTOKEN_DEFAULT_FEE_OFFSET, 64);
    deltaFee = _mintFeeData.decodeInt(XTOKEN_DELTA_FEE_OFFSET, 64);
  }

  /// @notice The redeem fee ratio for fToken.
  function fTokenRedeemFeeRatio() public view returns (uint256 defaultFee, int256 deltaFee) {
    bytes32 _redeemFeeData = redeemFeeData;
    defaultFee = _redeemFeeData.decodeUint(FTOKEN_DEFAULT_FEE_OFFSET, 64);
    deltaFee = _redeemFeeData.decodeInt(FTOKEN_DELTA_FEE_OFFSET, 64);
  }

  /// @notice The redeem fee ratio for xToken.
  function xTokenRedeemFeeRatio() public view returns (uint256 defaultFee, int256 deltaFee) {
    bytes32 _redeemFeeData = redeemFeeData;
    defaultFee = _redeemFeeData.decodeUint(XTOKEN_DEFAULT_FEE_OFFSET, 64);
    deltaFee = _redeemFeeData.decodeInt(XTOKEN_DELTA_FEE_OFFSET, 64);
  }

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @inheritdoc IFxMarketV2
  function mintFToken(
    uint256 _baseIn,
    address _recipient,
    uint256 _minFTokenMinted
  ) external override nonReentrant returns (uint256 _fTokenMinted) {
    if (mintPaused()) revert ErrorMintPaused();

    // make sure caller is fxUSD, when fxUSD is enabled
    {
      address _fxUSD = fxUSD;
      if (_fxUSD != address(0) && _fxUSD != _msgSender()) revert ErrorCallerNotFUSD();
    }
    _beforeMintFToken();

    if (_baseIn == type(uint256).max) {
      _baseIn = IERC20Upgradeable(baseToken).balanceOf(_msgSender());
    }
    if (_baseIn == 0) revert ErrorMintZeroAmount();

    uint256 _stabilityRatio = stabilityRatio();
    (uint256 _maxBaseInBeforeSystemStabilityMode, ) = IFxTreasuryV2(treasury).maxMintableFToken(_stabilityRatio);
    if (_maxBaseInBeforeSystemStabilityMode > 0) {
      _maxBaseInBeforeSystemStabilityMode = IFxTreasuryV2(treasury).getWrapppedValue(
        _maxBaseInBeforeSystemStabilityMode
      );
    }

    if (fTokenMintPausedInStabilityMode()) {
      uint256 _collateralRatio = IFxTreasuryV2(treasury).collateralRatio();
      if (_collateralRatio <= _stabilityRatio) revert ErrorFTokenMintPausedInStabilityMode();

      // bound maximum amount of base token to mint fToken.
      if (_baseIn > _maxBaseInBeforeSystemStabilityMode) {
        _baseIn = _maxBaseInBeforeSystemStabilityMode;
      }
    }

    uint256 _amountWithoutFee = _deductFTokenMintFee(_baseIn, _maxBaseInBeforeSystemStabilityMode);
    IERC20Upgradeable(baseToken).safeTransferFrom(_msgSender(), treasury, _amountWithoutFee);

    _fTokenMinted = IFxTreasuryV2(treasury).mintFToken(
      IFxTreasuryV2(treasury).getUnderlyingValue(_amountWithoutFee),
      _recipient
    );
    if (_fTokenMinted < _minFTokenMinted) revert ErrorInsufficientFTokenOutput();

    emit MintFToken(_msgSender(), _recipient, _baseIn, _fTokenMinted, _baseIn - _amountWithoutFee);
  }

  /// @inheritdoc IFxMarketV2
  function mintXToken(
    uint256 _baseIn,
    address _recipient,
    uint256 _minXTokenMinted
  ) external override nonReentrant returns (uint256 _xTokenMinted, uint256 _bonus) {
    if (mintPaused()) revert ErrorMintPaused();
    _beforeMintXToken();

    if (_baseIn == type(uint256).max) {
      _baseIn = IERC20Upgradeable(baseToken).balanceOf(_msgSender());
    }
    if (_baseIn == 0) revert ErrorMintZeroAmount();

    uint256 _stabilityRatio = stabilityRatio();
    (uint256 _maxBaseInBeforeSystemStabilityMode, ) = IFxTreasuryV2(treasury).maxMintableXToken(_stabilityRatio);
    if (_maxBaseInBeforeSystemStabilityMode > 0) {
      _maxBaseInBeforeSystemStabilityMode = IFxTreasuryV2(treasury).getWrapppedValue(
        _maxBaseInBeforeSystemStabilityMode
      );
    }

    uint256 _amountWithoutFee = _deductXTokenMintFee(_baseIn, _maxBaseInBeforeSystemStabilityMode);
    IERC20Upgradeable(baseToken).safeTransferFrom(_msgSender(), treasury, _amountWithoutFee);

    _xTokenMinted = IFxTreasuryV2(treasury).mintXToken(
      IFxTreasuryV2(treasury).getUnderlyingValue(_amountWithoutFee),
      _recipient
    );
    if (_xTokenMinted < _minXTokenMinted) revert ErrorInsufficientXTokenOutput();

    // give bnous
    if (_amountWithoutFee < _maxBaseInBeforeSystemStabilityMode) {
      _bonus = _amountWithoutFee;
    } else {
      _bonus = _maxBaseInBeforeSystemStabilityMode;
    }
    if (_bonus > 0 && IFxRebalancePoolRegistry(registry).totalSupply() == 0) {
      _bonus = IFxReservePool(reservePool).requestBonus(baseToken, _recipient, _bonus);
    } else {
      _bonus = 0;
    }

    emit MintXToken(_msgSender(), _recipient, _baseIn, _xTokenMinted, _bonus, _baseIn - _amountWithoutFee);
  }

  /// @inheritdoc IFxMarketV2
  function redeemFToken(
    uint256 _fTokenIn,
    address _recipient,
    uint256 _minBaseOut
  ) external override nonReentrant returns (uint256 _baseOut, uint256 _bonus) {
    if (redeemPaused()) revert ErrorRedeemPaused();
    _beforeRedeemFToken();

    if (_fTokenIn == type(uint256).max) {
      _fTokenIn = IERC20Upgradeable(fToken).balanceOf(_msgSender());
    }
    if (_fTokenIn == 0) revert ErrorRedeemZeroAmount();

    uint256 _stabilityRatio = stabilityRatio();
    (uint256 _maxBaseOut, uint256 _maxFTokenInBeforeSystemStabilityMode) = IFxTreasuryV2(treasury).maxRedeemableFToken(
      _stabilityRatio
    );
    uint256 _feeRatio = _computeFTokenRedeemFeeRatio(_fTokenIn, _maxFTokenInBeforeSystemStabilityMode);

    _baseOut = IFxTreasuryV2(treasury).redeem(_fTokenIn, 0, _msgSender());
    // give bonus when redeem fToken
    if (_baseOut < _maxBaseOut) {
      _bonus = _baseOut;
    } else {
      _bonus = _maxBaseOut;
    }

    // request bonus
    if (_bonus > 0 && IFxRebalancePoolRegistry(registry).totalSupply() == 0) {
      (uint256 _defaultRatio, int256 _deltaRatio) = fTokenMintFeeRatio();
      _bonus -= (_bonus * uint256(int256(_defaultRatio) + _deltaRatio)) / FEE_PRECISION; // deduct fee
      _bonus = IFxReservePool(reservePool).requestBonus(
        baseToken,
        _recipient,
        IFxTreasuryV2(treasury).getWrapppedValue(_bonus)
      );
    } else {
      _bonus = 0;
    }

    _baseOut = IFxTreasuryV2(treasury).getWrapppedValue(_baseOut);
    uint256 _balance = IERC20Upgradeable(baseToken).balanceOf(address(this));
    // consider possible slippage
    if (_balance < _baseOut) {
      _baseOut = _balance;
    }

    uint256 _fee = (_baseOut * _feeRatio) / FEE_PRECISION;
    if (_fee > 0) {
      IERC20Upgradeable(baseToken).safeTransfer(platform, _fee);
      _baseOut = _baseOut - _fee;
    }
    if (_baseOut < _minBaseOut) revert ErrorInsufficientBaseOutput();

    IERC20Upgradeable(baseToken).safeTransfer(_recipient, _baseOut);

    emit RedeemFToken(_msgSender(), _recipient, _fTokenIn, _baseOut, _bonus, _fee);
  }

  /// @inheritdoc IFxMarketV2
  function redeemXToken(
    uint256 _xTokenIn,
    address _recipient,
    uint256 _minBaseOut
  ) external override nonReentrant returns (uint256 _baseOut) {
    if (redeemPaused()) revert ErrorRedeemPaused();
    _beforeRedeemXToken();

    if (_xTokenIn == type(uint256).max) {
      _xTokenIn = IERC20Upgradeable(xToken).balanceOf(_msgSender());
    }
    if (_xTokenIn == 0) revert ErrorRedeemZeroAmount();

    uint256 _stabilityRatio = stabilityRatio();
    uint256 _feeRatio;
    (, uint256 _maxXTokenInBeforeSystemStabilityMode) = IFxTreasuryV2(treasury).maxRedeemableXToken(_stabilityRatio);

    if (xTokenRedeemPausedInStabilityMode()) {
      uint256 _collateralRatio = IFxTreasuryV2(treasury).collateralRatio();
      if (_collateralRatio <= _stabilityRatio) revert ErrorXTokenRedeemPausedInStabilityMode();

      // bound maximum amount of xToken to redeem.
      if (_xTokenIn > _maxXTokenInBeforeSystemStabilityMode) {
        _xTokenIn = _maxXTokenInBeforeSystemStabilityMode;
      }
    }

    _feeRatio = _computeXTokenRedeemFeeRatio(_xTokenIn, _maxXTokenInBeforeSystemStabilityMode);

    _baseOut = IFxTreasuryV2(treasury).redeem(0, _xTokenIn, _msgSender());
    _baseOut = IFxTreasuryV2(treasury).getWrapppedValue(_baseOut);
    uint256 _balance = IERC20Upgradeable(baseToken).balanceOf(address(this));
    // consider possible slippage
    if (_balance < _baseOut) {
      _baseOut = _balance;
    }

    uint256 _fee = (_baseOut * _feeRatio) / FEE_PRECISION;
    if (_fee > 0) {
      IERC20Upgradeable(baseToken).safeTransfer(platform, _fee);
      _baseOut = _baseOut - _fee;
    }
    if (_baseOut < _minBaseOut) revert ErrorInsufficientBaseOutput();

    IERC20Upgradeable(baseToken).safeTransfer(_recipient, _baseOut);

    emit RedeemXToken(_msgSender(), _recipient, _xTokenIn, _baseOut, _fee);
  }

  /*******************************
   * Public Restricted Functions *
   *******************************/

  /// @notice Update the fee ratio for redeeming.
  /// @param _defaultFeeRatio The new default fee ratio, multipled by 1e18.
  /// @param _extraFeeRatio The new extra fee ratio, multipled by 1e18.
  /// @param _isFToken Whether we are updating for fToken.
  function updateRedeemFeeRatio(
    uint256 _defaultFeeRatio,
    int256 _extraFeeRatio,
    bool _isFToken
  ) external onlyRole(DEFAULT_ADMIN_ROLE) {
    _validateFeeRatio(_defaultFeeRatio, _extraFeeRatio);

    bytes32 _redeemFeeData = redeemFeeData;
    if (_isFToken) {
      _redeemFeeData = _redeemFeeData.insertUint(_defaultFeeRatio, FTOKEN_DEFAULT_FEE_OFFSET, 64);
      _redeemFeeData = _redeemFeeData.insertInt(_extraFeeRatio, FTOKEN_DELTA_FEE_OFFSET, 64);
      emit UpdateRedeemFeeRatioFToken(_defaultFeeRatio, _extraFeeRatio);
    } else {
      _redeemFeeData = _redeemFeeData.insertUint(_defaultFeeRatio, XTOKEN_DEFAULT_FEE_OFFSET, 64);
      _redeemFeeData = _redeemFeeData.insertInt(_extraFeeRatio, XTOKEN_DELTA_FEE_OFFSET, 64);
      emit UpdateRedeemFeeRatioXToken(_defaultFeeRatio, _extraFeeRatio);
    }
    redeemFeeData = _redeemFeeData;
  }

  /// @notice Update the fee ratio for minting.
  /// @param _defaultFeeRatio The new default fee ratio, multipled by 1e18.
  /// @param _extraFeeRatio The new extra fee ratio, multipled by 1e18.
  /// @param _isFToken Whether we are updating for fToken.
  function updateMintFeeRatio(
    uint128 _defaultFeeRatio,
    int128 _extraFeeRatio,
    bool _isFToken
  ) external onlyRole(DEFAULT_ADMIN_ROLE) {
    _validateFeeRatio(_defaultFeeRatio, _extraFeeRatio);

    bytes32 _mintFeeData = mintFeeData;
    if (_isFToken) {
      _mintFeeData = _mintFeeData.insertUint(_defaultFeeRatio, FTOKEN_DEFAULT_FEE_OFFSET, 64);
      _mintFeeData = _mintFeeData.insertInt(_extraFeeRatio, FTOKEN_DELTA_FEE_OFFSET, 64);
      emit UpdateMintFeeRatioFToken(_defaultFeeRatio, _extraFeeRatio);
    } else {
      _mintFeeData = _mintFeeData.insertUint(_defaultFeeRatio, XTOKEN_DEFAULT_FEE_OFFSET, 64);
      _mintFeeData = _mintFeeData.insertInt(_extraFeeRatio, XTOKEN_DELTA_FEE_OFFSET, 64);
      emit UpdateMintFeeRatioXToken(_defaultFeeRatio, _extraFeeRatio);
    }
    mintFeeData = _mintFeeData;
  }

  /// @notice Update the stability ratio.
  /// @param _newRatio The new collateral ratio to enter stability mode, multiplied by 1e18.
  function updateStabilityRatio(uint256 _newRatio) external onlyRole(DEFAULT_ADMIN_ROLE) {
    _updateStabilityRatio(_newRatio);
  }

  /// @notice Update mint pause status.
  /// @param _newStatus The new mint pause status.
  function updateMintStatus(bool _newStatus) external onlyRole(EMERGENCY_DAO_ROLE) {
    bool _oldStatus = _updateBoolInMarketConfigData(MINT_FLAG_OFFSET, _newStatus);

    emit UpdateMintStatus(_oldStatus, _newStatus);
  }

  /// @notice Update redeem pause status.
  /// @param _newStatus The new redeem pause status.
  function updateRedeemStatus(bool _newStatus) external onlyRole(EMERGENCY_DAO_ROLE) {
    bool _oldStatus = _updateBoolInMarketConfigData(REDEEM_FLAG_OFFSET, _newStatus);

    emit UpdateRedeemStatus(_oldStatus, _newStatus);
  }

  /// @notice Update fToken mint pause status in stability mode.
  /// @param _newStatus The new mint pause status.
  function updateFTokenMintStatusInStabilityMode(bool _newStatus) external onlyRole(EMERGENCY_DAO_ROLE) {
    bool _oldStatus = _updateBoolInMarketConfigData(MINT_FLAG_STABILITY_OFFSET, _newStatus);

    emit UpdateFTokenMintStatusInStabilityMode(_oldStatus, _newStatus);
  }

  /// @notice Update xToken redeem status in stability mode
  /// @param _newStatus The new redeem pause status.
  function updateXTokenRedeemStatusInStabilityMode(bool _newStatus) external onlyRole(EMERGENCY_DAO_ROLE) {
    bool _oldStatus = _updateBoolInMarketConfigData(REDEEM_FLAG_STABILITY_OFFSET, _newStatus);

    emit UpdateXTokenRedeemStatusInStabilityMode(_oldStatus, _newStatus);
  }

  /// @notice Change address of platform contract.
  /// @param _newPlatform The new address of platform contract.
  function updatePlatform(address _newPlatform) external onlyRole(DEFAULT_ADMIN_ROLE) {
    _updatePlatform(_newPlatform);
  }

  /// @notice Change address of reserve pool contract.
  /// @param _newReservePool The new address of reserve pool contract.
  function updateReservePool(address _newReservePool) external onlyRole(DEFAULT_ADMIN_ROLE) {
    _updateReservePool(_newReservePool);
  }

  /// @notice Change address of RebalancePoolRegistry contract.
  /// @param _newRegistry The new address of RebalancePoolRegistry contract.
  function updateRebalancePoolRegistry(address _newRegistry) external onlyRole(DEFAULT_ADMIN_ROLE) {
    _updateRebalancePoolRegistry(_newRegistry);
  }

  /// @notice Enable fxUSD mint.
  /// @param _fxUSD The address of fxUSD token.
  function enableFxUSD(address _fxUSD) external onlyRole(DEFAULT_ADMIN_ROLE) {
    if (_fxUSD == address(0)) revert ErrorZeroAddress();

    if (fxUSD == address(0)) fxUSD = _fxUSD;
  }

  /**********************
   * Internal Functions *
   **********************/

  /// @dev Hook function to call before mint fToken.
  function _beforeMintFToken() internal virtual {}

  /// @dev Hook function to call before mint xToken.
  function _beforeMintXToken() internal virtual {}

  /// @dev Hook function to call before redeem fToken.
  function _beforeRedeemFToken() internal virtual {}

  /// @dev Hook function to call before redeem xToken.
  function _beforeRedeemXToken() internal virtual {}

  /// @dev Internal function to validate fee ratio.
  function _validateFeeRatio(uint256 _defaultFeeRatio, int256 _extraFeeRatio) internal pure {
    if (_defaultFeeRatio > FEE_PRECISION) revert ErrorDefaultFeeTooLarge();
    if (_extraFeeRatio < 0) {
      if (uint256(-_extraFeeRatio) > _defaultFeeRatio) revert ErrorDeltaFeeTooSmall();
    } else {
      if (uint256(_extraFeeRatio) > FEE_PRECISION - _defaultFeeRatio) revert ErrorTotalFeeTooLarge();
    }
  }

  /// @dev Internal function to update bool value in `marketConfigData`.
  /// @param offset The offset of the value in `marketConfigData`.
  /// @param newValue The value to update.
  /// @return oldValue The original value in the `offset`.
  function _updateBoolInMarketConfigData(uint256 offset, bool newValue) private returns (bool oldValue) {
    bytes32 _data = marketConfigData;
    oldValue = _data.decodeBool(offset);
    marketConfigData = _data.insertBool(newValue, offset);
  }

  /// @dev Internal function to update stability ratio.
  /// @param _newRatio The new collateral ratio to enter stability mode, multiplied by 1e18.
  function _updateStabilityRatio(uint256 _newRatio) private {
    if (_newRatio > type(uint64).max) revert ErrorStabilityRatioTooLarge();

    bytes32 _data = marketConfigData;
    uint256 _oldRatio = _data.decodeUint(STABILITY_RATIO_OFFSET, 64);
    marketConfigData = _data.insertUint(_newRatio, STABILITY_RATIO_OFFSET, 64);

    emit UpdateStabilityRatio(_oldRatio, _newRatio);
  }

  /// @notice Change address of platform contract.
  /// @param _newPlatform The new address of platform contract.
  function _updatePlatform(address _newPlatform) private {
    if (_newPlatform == address(0)) revert ErrorZeroAddress();

    address _oldPlatform = platform;
    platform = _newPlatform;

    emit UpdatePlatform(_oldPlatform, _newPlatform);
  }

  /// @notice Change address of reserve pool contract.
  /// @param _newReservePool The new address of reserve pool contract.
  function _updateReservePool(address _newReservePool) private {
    if (_newReservePool == address(0)) revert ErrorZeroAddress();

    address _oldReservePool = reservePool;
    reservePool = _newReservePool;

    emit UpdateReservePool(_oldReservePool, _newReservePool);
  }

  /// @notice Change address of RebalancePoolRegistry contract.
  /// @param _newRegistry The new address of RebalancePoolRegistry contract.
  function _updateRebalancePoolRegistry(address _newRegistry) private {
    if (_newRegistry == address(0)) revert ErrorZeroAddress();

    address _oldRegistry = registry;
    registry = _newRegistry;

    emit UpdateRebalancePoolRegistry(_oldRegistry, _newRegistry);
  }

  /// @dev Internal function to deduct fToken mint fee for base token.
  /// @param _baseIn The amount of base token.
  /// @param _maxBaseInBeforeSystemStabilityMode The maximum amount of base token can be deposit before entering system stability mode.
  /// @return _baseInWithoutFee The amount of base token without fee.
  function _deductFTokenMintFee(uint256 _baseIn, uint256 _maxBaseInBeforeSystemStabilityMode)
    private
    returns (uint256 _baseInWithoutFee)
  {
    // [0, _maxBaseInBeforeSystemStabilityMode) => default = fee_ratio_0
    // [_maxBaseInBeforeSystemStabilityMode, infinity) => default + extra = fee_ratio_1

    (uint256 _defaultRatio, int256 _deltaRatio) = fTokenMintFeeRatio();
    uint256 _feeRatio0 = _defaultRatio;
    uint256 _feeRatio1 = uint256(int256(_defaultRatio) + _deltaRatio);

    _baseInWithoutFee = _deductMintFee(_baseIn, _feeRatio0, _feeRatio1, _maxBaseInBeforeSystemStabilityMode);
  }

  /// @dev Internal function to deduct fToken mint fee for base token.
  /// @param _baseIn The amount of base token.
  /// @param _maxBaseInBeforeSystemStabilityMode The maximum amount of base token can be deposit before entering system stability mode.
  /// @return _baseInWithoutFee The amount of base token without fee.
  function _deductXTokenMintFee(uint256 _baseIn, uint256 _maxBaseInBeforeSystemStabilityMode)
    private
    returns (uint256 _baseInWithoutFee)
  {
    // [0, _maxBaseInBeforeSystemStabilityMode) => default + extra = fee_ratio_0
    // [_maxBaseInBeforeSystemStabilityMode, infinity) => default = fee_ratio_1

    (uint256 _defaultRatio, int256 _deltaRatio) = xTokenMintFeeRatio();
    uint256 _feeRatio0 = uint256(int256(_defaultRatio) + _deltaRatio);
    uint256 _feeRatio1 = _defaultRatio;

    _baseInWithoutFee = _deductMintFee(_baseIn, _feeRatio0, _feeRatio1, _maxBaseInBeforeSystemStabilityMode);
  }

  function _deductMintFee(
    uint256 _baseIn,
    uint256 _feeRatio0,
    uint256 _feeRatio1,
    uint256 _maxBaseInBeforeSystemStabilityMode
  ) private returns (uint256 _baseInWithoutFee) {
    uint256 _maxBaseIn = (_maxBaseInBeforeSystemStabilityMode * FEE_PRECISION) / (FEE_PRECISION - _feeRatio0);

    // compute fee
    uint256 _fee;
    if (_baseIn <= _maxBaseIn) {
      _fee = (_baseIn * _feeRatio0) / FEE_PRECISION;
    } else {
      _fee = (_maxBaseIn * _feeRatio0) / FEE_PRECISION;
      _fee += ((_baseIn - _maxBaseIn) * _feeRatio1) / FEE_PRECISION;
    }

    _baseInWithoutFee = _baseIn - _fee;
    // take fee to platform
    if (_fee > 0) {
      IERC20Upgradeable(baseToken).safeTransferFrom(_msgSender(), platform, _fee);
    }
  }

  /// @dev Internal function to deduct mint fee for base token.
  /// @param _amountIn The amount of fToken.
  /// @param _maxInBeforeSystemStabilityMode The maximum amount of fToken can be redeemed before leaving system stability mode.
  /// @return _feeRatio The computed fee ratio for base token redeemed.
  function _computeFTokenRedeemFeeRatio(uint256 _amountIn, uint256 _maxInBeforeSystemStabilityMode)
    private
    view
    returns (uint256 _feeRatio)
  {
    // [0, _maxBaseInBeforeSystemStabilityMode) => default + extra = fee_ratio_0
    // [_maxBaseInBeforeSystemStabilityMode, infinity) => default = fee_ratio_1

    (uint256 _defaultRatio, int256 _deltaRatio) = fTokenRedeemFeeRatio();
    uint256 _feeRatio0 = uint256(int256(_defaultRatio) + _deltaRatio);
    uint256 _feeRatio1 = _defaultRatio;

    _feeRatio = _computeRedeemFeeRatio(_amountIn, _feeRatio0, _feeRatio1, _maxInBeforeSystemStabilityMode);
  }

  /// @dev Internal function to deduct mint fee for base token.
  /// @param _amountIn The amount of xToken.
  /// @param _maxInBeforeSystemStabilityMode The maximum amount of xToken can be redeemed before entering system stability mode.
  /// @return _feeRatio The computed fee ratio for base token redeemed.
  function _computeXTokenRedeemFeeRatio(uint256 _amountIn, uint256 _maxInBeforeSystemStabilityMode)
    private
    view
    returns (uint256 _feeRatio)
  {
    // [0, _maxBaseInBeforeSystemStabilityMode) => default = fee_ratio_0
    // [_maxBaseInBeforeSystemStabilityMode, infinity) => default + extra = fee_ratio_1

    (uint256 _defaultRatio, int256 _deltaRatio) = xTokenRedeemFeeRatio();
    uint256 _feeRatio0 = _defaultRatio;
    uint256 _feeRatio1 = uint256(int256(_defaultRatio) + _deltaRatio);

    _feeRatio = _computeRedeemFeeRatio(_amountIn, _feeRatio0, _feeRatio1, _maxInBeforeSystemStabilityMode);
  }

  /// @dev Internal function to deduct mint fee for base token.
  /// @param _amountIn The amount of fToken or xToken.
  /// @param _feeRatio0 The default fee ratio.
  /// @param _feeRatio1 The second fee ratio.
  /// @param _maxInBeforeSystemStabilityMode The maximum amount of fToken/xToken can be redeemed before entering/leaving system stability mode.
  /// @return _feeRatio The computed fee ratio for base token redeemed.
  function _computeRedeemFeeRatio(
    uint256 _amountIn,
    uint256 _feeRatio0,
    uint256 _feeRatio1,
    uint256 _maxInBeforeSystemStabilityMode
  ) private pure returns (uint256 _feeRatio) {
    if (_amountIn <= _maxInBeforeSystemStabilityMode) {
      return _feeRatio0;
    }
    uint256 _fee = _maxInBeforeSystemStabilityMode * _feeRatio0;
    _fee += (_amountIn - _maxInBeforeSystemStabilityMode) * _feeRatio1;
    return _fee / _amountIn;
  }
}
