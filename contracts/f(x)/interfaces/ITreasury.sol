// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

interface ITreasury {
  /**********
   * Events *
   **********/

  /// @notice Emitted when net asset value is changed.
  /// @param price The new price of base token.
  /// @param fNav The new net asset value of fToken.
  /// @param xNav The new net asset value of xToken.
  event Settle(uint256 price, uint256 fNav, uint256 xNav);

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

  /// @notice The address of base token.
  function baseToken() external view returns (address);

  /// @notice The address fractional base token.
  function fToken() external view returns (address);

  /// @notice The address leveraged base token.
  function xToken() external view returns (address);

  function strategy() external view returns (address);

  function totalUnderlying() external view returns (uint256);

  function strategyUnderlying() external view returns (uint256);

  function collateralRatio() external view returns (uint256);

  /****************************
   * Public Mutated Functions *
   ****************************/

  function mint(
    uint256 amount,
    address recipient,
    MintOption option
  ) external returns (uint256 fOut, uint256 xOut);

  function redeem(
    uint256 fAmt,
    uint256 xAmt,
    address owner
  ) external returns (uint256 baseOut);

  function addBaseToken(
    uint256 amount,
    uint256 incentiveRatio,
    address recipient
  ) external returns (uint256 xOut);

  function liquidate(
    uint256 fAmt,
    uint256 incentiveRatio,
    address owner,
    address recipient
  ) external returns (uint256 baseOut);

  function settle() external;

  function transferToStrategy(uint256 amount) external;

  function notifyStrategyProfit(uint256 amount) external;
}
