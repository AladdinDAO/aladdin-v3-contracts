// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

interface IFxMarketV2 {
  /**********
   * Events *
   **********/

  /// @notice Emitted when fToken is minted.
  /// @param owner The address of base token owner.
  /// @param recipient The address of receiver for fToken or xToken.
  /// @param baseTokenIn The amount of base token deposited.
  /// @param fTokenOut The amount of fToken minted.
  /// @param mintFee The amount of mint fee charged.
  event MintFToken(
    address indexed owner,
    address indexed recipient,
    uint256 baseTokenIn,
    uint256 fTokenOut,
    uint256 mintFee
  );

  /// @notice Emitted when xToken is minted.
  /// @param owner The address of base token owner.
  /// @param recipient The address of receiver for fToken or xToken.
  /// @param baseTokenIn The amount of base token deposited.
  /// @param xTokenOut The amount of xToken minted.
  /// @param bonus The amount of base token as bonus.
  /// @param mintFee The amount of mint fee charged.
  event MintXToken(
    address indexed owner,
    address indexed recipient,
    uint256 baseTokenIn,
    uint256 xTokenOut,
    uint256 bonus,
    uint256 mintFee
  );

  /// @notice Emitted when someone redeem base token with fToken or xToken.
  /// @param owner The address of fToken and xToken owner.
  /// @param recipient The address of receiver for base token.
  /// @param fTokenBurned The amount of fToken burned.
  /// @param baseTokenOut The amount of base token redeemed.
  /// @param bonus The amount of base token as bonus.
  /// @param redeemFee The amount of redeem fee charged.
  event RedeemFToken(
    address indexed owner,
    address indexed recipient,
    uint256 fTokenBurned,
    uint256 baseTokenOut,
    uint256 bonus,
    uint256 redeemFee
  );

  /// @notice Emitted when someone redeem base token with fToken or xToken.
  /// @param owner The address of fToken and xToken owner.
  /// @param recipient The address of receiver for base token.
  /// @param xTokenBurned The amount of xToken burned.
  /// @param baseTokenOut The amount of base token redeemed.
  /// @param redeemFee The amount of redeem fee charged.
  event RedeemXToken(
    address indexed owner,
    address indexed recipient,
    uint256 xTokenBurned,
    uint256 baseTokenOut,
    uint256 redeemFee
  );

  /// @notice Emitted when the fee ratio for minting fToken is updated.
  /// @param defaultFeeRatio The new default fee ratio, multipled by 1e18.
  /// @param extraFeeRatio The new extra fee ratio, multipled by 1e18.
  event UpdateMintFeeRatioFToken(uint256 defaultFeeRatio, int256 extraFeeRatio);

  /// @notice Emitted when the fee ratio for minting xToken is updated.
  /// @param defaultFeeRatio The new default fee ratio, multipled by 1e18.
  /// @param extraFeeRatio The new extra fee ratio, multipled by 1e18.
  event UpdateMintFeeRatioXToken(uint256 defaultFeeRatio, int256 extraFeeRatio);

  /// @notice Emitted when the fee ratio for redeeming fToken is updated.
  /// @param defaultFeeRatio The new default fee ratio, multipled by 1e18.
  /// @param extraFeeRatio The new extra fee ratio, multipled by 1e18.
  event UpdateRedeemFeeRatioFToken(uint256 defaultFeeRatio, int256 extraFeeRatio);

  /// @notice Emitted when the fee ratio for redeeming xToken is updated.
  /// @param defaultFeeRatio The new default fee ratio, multipled by 1e18.
  /// @param extraFeeRatio The new extra fee ratio, multipled by 1e18.
  event UpdateRedeemFeeRatioXToken(uint256 defaultFeeRatio, int256 extraFeeRatio);

  /// @notice Emitted when the stability ratio is updated.
  /// @param oldRatio The previous collateral ratio to enter stability mode, multiplied by 1e18.
  /// @param newRatio The current collateral ratio to enter stability mode, multiplied by 1e18.
  event UpdateStabilityRatio(uint256 oldRatio, uint256 newRatio);

  /// @notice Emitted when the platform contract is updated.
  /// @param oldPlatform The address of previous platform contract.
  /// @param newPlatform The address of current platform contract.
  event UpdatePlatform(address indexed oldPlatform, address indexed newPlatform);

  /// @notice Emitted when the  reserve pool contract is updated.
  /// @param oldReservePool The address of previous reserve pool contract.
  /// @param newReservePool The address of current reserve pool contract.
  event UpdateReservePool(address indexed oldReservePool, address indexed newReservePool);

  /// @notice Emitted when the RebalancePoolRegistry contract is updated.
  /// @param oldRegistry The address of previous RebalancePoolRegistry contract.
  /// @param newRegistry The address of current RebalancePoolRegistry contract.
  event UpdateRebalancePoolRegistry(address indexed oldRegistry, address indexed newRegistry);

  /// @notice Pause or unpause mint.
  /// @param oldStatus The previous status for mint.
  /// @param newStatus The current status for mint.
  event UpdateMintStatus(bool oldStatus, bool newStatus);

  /// @notice Pause or unpause redeem.
  /// @param oldStatus The previous status for redeem.
  /// @param newStatus The current status for redeem.
  event UpdateRedeemStatus(bool oldStatus, bool newStatus);

  /// @notice Pause or unpause fToken mint in stability mode.
  /// @param oldStatus The previous status for mint.
  /// @param newStatus The current status for mint.
  event UpdateFTokenMintStatusInStabilityMode(bool oldStatus, bool newStatus);

  /// @notice Pause or unpause xToken redeem in stability mode.
  /// @param oldStatus The previous status for redeem.
  /// @param newStatus The current status for redeem.
  event UpdateXTokenRedeemStatusInStabilityMode(bool oldStatus, bool newStatus);

  /**********
   * Errors *
   **********/

  /// @dev Thrown when the caller if not fUSD contract.
  error ErrorCallerNotFUSD();

  /// @dev Thrown when token mint is paused.
  error ErrorMintPaused();

  /// @dev Thrown when fToken mint is paused in stability mode.
  error ErrorFTokenMintPausedInStabilityMode();

  /// @dev Thrown when mint with zero amount base token.
  error ErrorMintZeroAmount();

  /// @dev Thrown when the amount of fToken is not enough.
  error ErrorInsufficientFTokenOutput();

  /// @dev Thrown when the amount of xToken is not enough.
  error ErrorInsufficientXTokenOutput();

  /// @dev Thrown when token redeem is paused.
  error ErrorRedeemPaused();

  /// @dev Thrown when xToken redeem is paused in stability mode.
  error ErrorXTokenRedeemPausedInStabilityMode();

  /// @dev Thrown when redeem with zero amount fToken or xToken.
  error ErrorRedeemZeroAmount();

  /// @dev Thrown when the amount of base token is not enough.
  error ErrorInsufficientBaseOutput();

  /// @dev Thrown when the stability ratio is too large.
  error ErrorStabilityRatioTooLarge();

  /// @dev Thrown when the default fee is too large.
  error ErrorDefaultFeeTooLarge();

  /// @dev Thrown when the delta fee is too small.
  error ErrorDeltaFeeTooSmall();

  /// @dev Thrown when the sum of default fee and delta fee is too large.
  error ErrorTotalFeeTooLarge();

  /// @dev Thrown when the given address is zero.
  error ErrorZeroAddress();

  /*************************
   * Public View Functions *
   *************************/

  /// @notice The address of Treasury contract.
  function treasury() external view returns (address);

  /// @notice Return the address of base token.
  function baseToken() external view returns (address);

  /// @notice Return the address fractional base token.
  function fToken() external view returns (address);

  /// @notice Return the address leveraged base token.
  function xToken() external view returns (address);

  /// @notice Return the address of fxUSD token.
  function fxUSD() external view returns (address);

  /// @notice Return the collateral ratio to enter stability mode, multiplied by 1e18.
  function stabilityRatio() external view returns (uint256);

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @notice Mint some fToken with some base token.
  /// @param baseIn The amount of wrapped value of base token supplied, use `uint256(-1)` to supply all base token.
  /// @param recipient The address of receiver for fToken.
  /// @param minFTokenMinted The minimum amount of fToken should be received.
  /// @return fTokenMinted The amount of fToken should be received.
  function mintFToken(
    uint256 baseIn,
    address recipient,
    uint256 minFTokenMinted
  ) external returns (uint256 fTokenMinted);

  /// @notice Mint some xToken with some base token.
  /// @param baseIn The amount of wrapped value of base token supplied, use `uint256(-1)` to supply all base token.
  /// @param recipient The address of receiver for xToken.
  /// @param minXTokenMinted The minimum amount of xToken should be received.
  /// @return xTokenMinted The amount of xToken should be received.
  /// @return bonus The amount of wrapped value of base token as bonus.
  function mintXToken(
    uint256 baseIn,
    address recipient,
    uint256 minXTokenMinted
  ) external returns (uint256 xTokenMinted, uint256 bonus);

  /// @notice Redeem base token with fToken.
  /// @param fTokenIn the amount of fToken to redeem, use `uint256(-1)` to redeem all fToken.
  /// @param recipient The address of receiver for base token.
  /// @param minBaseOut The minimum amount of wrapped value of base token should be received.
  /// @return baseOut The amount of wrapped value of base token should be received.
  /// @return bonus The amount of wrapped value of base token as bonus.
  function redeemFToken(
    uint256 fTokenIn,
    address recipient,
    uint256 minBaseOut
  ) external returns (uint256 baseOut, uint256 bonus);

  /// @notice Redeem base token with xToken.
  /// @param xTokenIn the amount of xToken to redeem, use `uint256(-1)` to redeem all xToken.
  /// @param recipient The address of receiver for base token.
  /// @param minBaseOut The minimum amount of wrapped value of base token should be received.
  /// @return baseOut The amount of wrapped value of base token should be received.
  function redeemXToken(
    uint256 xTokenIn,
    address recipient,
    uint256 minBaseOut
  ) external returns (uint256 baseOut);
}
