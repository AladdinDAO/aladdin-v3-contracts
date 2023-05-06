// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

interface ITreasury {
  /**********
   * Events *
   **********/

  /// @notice Emitted when the intermediate net asset value is updated.
  /// @param price The new price of base token.
  /// @param fNav The new net asset value of fToken.
  /// @param xNav The new net asset value of xToken.
  event MarketSettle(uint256 price, uint256 fNav, uint256 xNav);

  /// @notice Emitted when the net asset value is updated.
  /// @param price The new price of base token.
  /// @param fNav The new net asset value of fToken.
  /// @param xNav The new net asset value of xToken.
  event ProtocolSettle(uint256 price, uint256 fNav, uint256 xNav);

  /*********
   * Enums *
   *********/

  enum MintOption {
    Both,
    FToken,
    XToken
  }

  /*************************
   * Public View Functions *
   *************************/

  /// @notice Return the address of base token.
  function baseToken() external view returns (address);

  /// @notice Return the address fractional base token.
  function fToken() external view returns (address);

  /// @notice Return the address leveraged base token.
  function xToken() external view returns (address);

  /// @notice Return the address of strategy contract.
  function strategy() external view returns (address);

  /// @notice Return the total amount of base token deposited.
  function totalUnderlying() external view returns (uint256);

  /// @notice Return the total amount of base token managed by strategy.
  function strategyUnderlying() external view returns (uint256);

  /// @notice Return the current collateral ratio of fToken, multipled by 1e18.
  function collateralRatio() external view returns (uint256);

  /// @notice Compute the amount of base token needed to reach the new collateral ratio.
  /// @param _newCollateralRatio The target collateral ratio, multipled by 1e18.
  /// @return baseIn The amount of base token needed.
  function tryMintFTokenTo(uint256 _newCollateralRatio) external view returns (uint256 baseIn);

  /// @notice Compute the amount of base token needed to reach the new collateral ratio.
  /// @param _newCollateralRatio The target collateral ratio, multipled by 1e18.
  /// @return baseIn The amount of base token needed.
  function tryMintXTokenTo(uint256 _newCollateralRatio) external view returns (uint256 baseIn);

  /// @notice Compute the amount of fToken needed to reach the new collateral ratio.
  /// @param _newCollateralRatio The target collateral ratio, multipled by 1e18.
  /// @return fIn The amount of fToken needed.
  function tryRedeemFTokenTo(uint256 _newCollateralRatio) external view returns (uint256 fIn);

  /// @notice Compute the amount of xToken needed to reach the new collateral ratio.
  /// @param _newCollateralRatio The target collateral ratio, multipled by 1e18.
  /// @return xIn The amount of xToken needed.
  function tryRedeemXTokenTo(uint256 _newCollateralRatio) external view returns (uint256 xIn);

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @notice Mint fToken and xToken with some base token.
  /// @param amount The amount of base token deposited.
  /// @param recipient The address of receiver.
  /// @param option The mint option, xToken or fToken or both.
  /// @return fOut The amount of fToken minted.
  /// @return xOut The amount of xToken minted.
  function mint(
    uint256 amount,
    address recipient,
    MintOption option
  ) external returns (uint256 fOut, uint256 xOut);

  /// @notice Redeem fToken and xToken to base tokne.
  /// @param fAmt The amount of fToken to redeem.
  /// @param xAmt The amount of xToken to redeem.
  /// @param owner The owner of the fToken or xToken.
  /// @param baseOut The amount of base token redeemed.
  function redeem(
    uint256 fAmt,
    uint256 xAmt,
    address owner
  ) external returns (uint256 baseOut);

  /// @notice Add some base token to mint xToken with incentive.
  /// @param amount The amount of base token deposited.
  /// @param incentiveRatio The incentive ratio.
  /// @param recipient The address of receiver.
  /// @return xOut The amount of xToken minted.
  function addBaseToken(
    uint256 amount,
    uint256 incentiveRatio,
    address recipient
  ) external returns (uint256 xOut);

  /// @notice Liquidate fToken to base token with incentive.
  /// @param fAmt The amount of fToken to liquidate.
  /// @param incentiveRatio The incentive ratio.
  /// @param owner The owner of the fToken.
  /// @param baseOut The amount of base token liquidated.
  function liquidate(
    uint256 fAmt,
    uint256 incentiveRatio,
    address owner,
    address recipient
  ) external returns (uint256 baseOut);

  /// @notice Settle the intermediate nav of base token, fToken and xToken.
  function marketSettle() external;

  /// @notice Settle the nav of base token, fToken and xToken.
  function protocolSettle() external;

  /// @notice Transfer some base token to strategy contract.
  /// @param amount The amount of token to transfer.
  function transferToStrategy(uint256 amount) external;

  /// @notice Notify base token profit from strategy contract.
  /// @param amount The amount of base token.
  function notifyStrategyProfit(uint256 amount) external;
}
