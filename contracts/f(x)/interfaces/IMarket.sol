// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

interface IMarket {
  /**********
   * Events *
   **********/

  /// @notice Emitted when fToken or xToken is minted.
  /// @param owner The address of base token owner.
  /// @param recipient The address of receiver for fToken or xToken.
  /// @param baseTokenIn The amount of base token deposited.
  /// @param fTokenOut The amount of fToken minted.
  /// @param xTokenOut The amount of xToken minted.
  /// @param mintFee The amount of mint fee charged.
  event Mint(
    address indexed owner,
    address indexed recipient,
    uint256 baseTokenIn,
    uint256 fTokenOut,
    uint256 xTokenOut,
    uint256 mintFee
  );

  /// @notice Emitted when someone redeem base token with fToken or xToken.
  /// @param owner The address of fToken and xToken owner.
  /// @param recipient The address of receiver for base token.
  /// @param fTokenIn The amount of fToken burned.
  /// @param xTokenIn The amount of xToken burned.
  /// @param baseTokenOut The amount of base token redeemed.
  /// @param redeemFee The amount of redeem fee charged.
  event Redeem(
    address indexed owner,
    address indexed recipient,
    uint256 fTokenIn,
    uint256 xTokenIn,
    uint256 baseTokenOut,
    uint256 redeemFee
  );

  /// @notice Emitted when someone add more base token.
  /// @param owner The address of base token owner.
  /// @param recipient The address of receiver for fToken or xToken.
  /// @param baseTokenIn The amount of base token deposited.
  /// @param xTokenOut The amount of xToken minted.
  event AddCollateral(address indexed owner, address indexed recipient, uint256 baseTokenIn, uint256 xTokenOut);

  /// @notice Emitted when someone liquidate with fToken.
  /// @param owner The address of fToken and xToken owner.
  /// @param recipient The address of receiver for base token.
  /// @param fTokenIn The amount of fToken burned.
  /// @param baseTokenOut The amount of base token redeemed.
  event UserLiquidate(address indexed owner, address indexed recipient, uint256 fTokenIn, uint256 baseTokenOut);

  /// @notice Emitted when self liquidate with fToken.
  /// @param caller The address of caller.
  /// @param baseTokenAmt The amount of base token used to swap.
  /// @param baseTokenOut The amount of base token redeemed.
  /// @param fTokenAmt The amount of fToken liquidated.
  event SelfLiquidate(address indexed caller, uint256 baseTokenAmt, uint256 baseTokenOut, uint256 fTokenAmt);

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @notice Mint both fToken and xToken with some base token.
  /// @param amount The amount of base token supplied.
  /// @param recipient The address of receiver for fToken and xToken.
  /// @param minFOut The minimum amount of fToken should be received.
  /// @param minXOut The minimum amount of xToken should be received.
  /// @return fOut The amount of fToken should be received.
  /// @return xOut The amount of xToken should be received.
  function mint(
    uint256 amount,
    address recipient,
    uint256 minFOut,
    uint256 minXOut
  ) external returns (uint256 fOut, uint256 xOut);

  /// @notice Mint some fToken with some base token.
  /// @param amount The amount of base token supplied.
  /// @param recipient The address of receiver for fToken.
  /// @param minFOut The minimum amount of fToken should be received.
  /// @return fOut The amount of fToken should be received.
  function mintFToken(
    uint256 amount,
    address recipient,
    uint256 minFOut
  ) external returns (uint256 fOut);

  /// @notice Mint some xToken with some base token.
  /// @param amount The amount of base token supplied.
  /// @param recipient The address of receiver for xToken.
  /// @param minXOut The minimum amount of xToken should be received.
  /// @return xOut The amount of xToken should be received.
  function mintXToken(
    uint256 amount,
    address recipient,
    uint256 minXOut
  ) external returns (uint256 xOut);

  /// @notice Mint some xToken by add some base token as collateral.
  /// @param amount The amount of base token supplied.
  /// @param recipient The address of receiver for xToken.
  /// @param minXOut The minimum amount of xToken should be received.
  /// @return xOut The amount of xToken should be received.
  function addBaseToken(
    uint256 amount,
    address recipient,
    uint256 minXOut
  ) external returns (uint256 xOut);

  /// @notice Redeem base token with fToken and xToken.
  /// @param fAmt the amount of fToken to redeem.
  /// @param xAmt the amount of xToken to redeem.
  /// @param recipient The address of receiver for base token.
  /// @param minBaseOut The minimum amount of base token should be received.
  /// @return baseOut The amount of base token should be received.
  function redeem(
    uint256 fAmt,
    uint256 xAmt,
    address recipient,
    uint256 minBaseOut
  ) external returns (uint256 baseOut);

  /// @notice Permissionless liquidate some fToken to increase the collateral ratio.
  /// @param fAmt the amount of fToken to supply.
  /// @param recipient The address of receiver for base token.
  /// @param minBaseOut The minimum amount of base token should be received.
  /// @return baseOut The amount of base token should be received.
  function liquidate(
    uint256 fAmt,
    address recipient,
    uint256 minBaseOut
  ) external returns (uint256 baseOut);

  /// @notice Self liquidate some fToken to increase the collateral ratio.
  /// @param baseAmt The amount of base token to swap.
  /// @param minFToken The minimum amount of fToken should be liquidated.
  /// @param data The data used to swap base token to fToken.
  /// @return baseOut The amount of base token should be received.
  /// @return fAmt the amount of fToken liquidated.
  function selfLiquidate(
    uint256 baseAmt,
    uint256 minFToken,
    bytes calldata data
  ) external returns (uint256 baseOut, uint256 fAmt);

  /// @notice Callback to swap base token to fToken
  /// @param baseAmt The amount of base token to swap.
  /// @param data The data passed to market contract.
  /// @return fAmt The amount of fToken received.
  function onSelfLiquidate(uint256 baseAmt, bytes calldata data) external returns (uint256 fAmt);
}
