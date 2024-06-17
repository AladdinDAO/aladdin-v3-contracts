// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.7.0 || ^0.8.0;

interface IFxBasePool {
  /**********
   * Events *
   **********/

  /// @notice Emitted when the ratio for protocol treasury is updated.
  /// @param oldRatio The value of the previous ratio, multiplied by 1e9.
  /// @param newRatio The value of the current ratio, multiplied by 1e9.
  event UpdateExpenseRatio(uint256 oldRatio, uint256 newRatio);

  /// @notice Emitted when the ratio for harvester is updated.
  /// @param oldRatio The value of the previous ratio, multiplied by 1e9.
  /// @param newRatio The value of the current ratio, multiplied by 1e9.
  event UpdateHarvesterRatio(uint256 oldRatio, uint256 newRatio);

  /// @notice Emitted when the price oracle contract is updated.
  /// @param oldPriceOracle The address of previous price oracle.
  /// @param newPriceOracle The address of current price oracle.
  event UpdatePriceOracle(address indexed oldPriceOracle, address indexed newPriceOracle);

  /// @notice Emitted when the rate provider contract is updated.
  /// @param oldRateProvider The address of previous rate provider.
  /// @param newRateProvider The address of current rate provider.
  event UpdateRateProvider(address indexed oldRateProvider, address indexed newRateProvider);

  /// @notice Emitted when the effective base token capacity is updated.
  /// @param oldCapacity The previous effective base token capacity.
  /// @param newCapacity The current effective base token capacity.
  event UpdateEffectiveBaseTokenCapacity(uint256 oldCapacity, uint256 newCapacity);

  /// @notice Emitted when the mint status for fractional token or leveraged token is updated.
  /// @param oldStatus The previous status for mint.
  /// @param newStatus The current status for mint.
  event UpdateMintStatus(uint256 oldStatus, uint256 newStatus);

  /// @notice Emitted when the redeem status for fractional token or leveraged token is updated.
  /// @param oldStatus The previous status for redeem.
  /// @param newStatus The current status for redeem.
  event UpdateRedeemStatus(uint256 oldStatus, uint256 newStatus);

  /// @notice Emitted when the stability ratio is updated.
  /// @param oldRatio The previous collateral ratio to enter stability mode, multiplied by 1e18.
  /// @param newRatio The current collateral ratio to enter stability mode, multiplied by 1e18.
  event UpdateStabilityRatio(uint256 oldRatio, uint256 newRatio);

  /// @notice Emitted when the mint pause ratio is updated.
  /// @param oldRatio The previous collateral ratio to pause fractional token, multiplied by 1e18.
  /// @param newRatio The current collateral ratio to pause fractional token, multiplied by 1e18.
  event UpdateMintPauseRatio(uint256 oldRatio, uint256 newRatio);

  /// @notice Emitted when the mint/redeem fee ratio is updated.
  /// @param isRedeem Whether we are updating redeem fee ratio.
  /// @param isLeveragedToken Whether we are updating fee ratio for leveraged token.
  /// @param newDefaultRatio The new default fee ratio, multiplied by 1e9.
  /// @param newDeltaRatio The new extra fee ratio, multiplied by 1e9.
  event UpdateMintOrRedeemFeeRatio(bool isRedeem, bool isLeveragedToken, uint256 newDefaultRatio, int256 newDeltaRatio);

  /// @notice Emitted when pool is initialized.
  /// @param owner The address of base token owner.
  /// @param recipient The address of receiver for fractional token and leveraged token.
  /// @param referencePrice The price of base token used to initialize.
  /// @param amountIn The amount of effective base tokens used.
  /// @param amountsOut The amount of fractional and leveraged tokens minted.
  event InitializePool(
    address indexed owner,
    address indexed recipient,
    uint256 referencePrice,
    uint256 amountIn,
    uint256[] amountsOut
  );

  /// @notice Emitted when fractional token is minted.
  /// @param owner The address of base token owner.
  /// @param recipient The address of receiver for fractional token.
  /// @param amountIn The amount of effective base tokens used, including protocol fee.
  /// @param amountOut The amount of fractional tokens minted.
  /// @param mintFee The amount of effective base tokens as mint fee charged.
  event MintFractionalToken(
    address indexed owner,
    address indexed recipient,
    uint256 amountIn,
    uint256 amountOut,
    uint256 mintFee
  );

  /// @notice Emitted when leveraged token is minted.
  /// @param owner The address of base token owner.
  /// @param recipient The address of receiver for leveraged token.
  /// @param amountIn The amount of effective base tokens used, including protocol fee.
  /// @param amountOut The amount of leveraged tokens minted.
  /// @param mintFee The amount of effective base tokens as mint fee charged.
  /// @param bonusEligibleAmount The amount of effective base token eligible for bonus.
  event MintLeveragedToken(
    address indexed owner,
    address indexed recipient,
    uint256 amountIn,
    uint256 amountOut,
    uint256 mintFee,
    uint256 bonusEligibleAmount
  );

  /// @notice Emitted when someone redeem base token with fractional token.
  /// @param owner The address of fractional token owner.
  /// @param recipient The address of receiver for base token.
  /// @param amountIn The amount of fractional tokens burned.
  /// @param amountOut The amount of effective base tokens redeemed, excluding protocol fee.
  /// @param redeemFee The amount of effective base tokens as redeem fee charged.
  /// @param bonusEligibleAmount The amount of effective base token eligible for bonus.
  event RedeemFractionalToken(
    address indexed owner,
    address indexed recipient,
    uint256 amountIn,
    uint256 amountOut,
    uint256 redeemFee,
    uint256 bonusEligibleAmount
  );

  /// @notice Emitted when someone redeem base token with leveraged token.
  /// @param owner The address of leveraged token owner.
  /// @param recipient The address of receiver for base token.
  /// @param amountIn The amount of leveraged tokens burned.
  /// @param amountOut The amount of effective base tokens redeemed, excluding protocol fee.
  /// @param redeemFee The amount of effective base tokens as redeem fee charged.
  event RedeemLeveragedToken(
    address indexed owner,
    address indexed recipient,
    uint256 amountIn,
    uint256 amountOut,
    uint256 redeemFee
  );

  /*************************
   * Public View Functions *
   *************************/

  /// @notice Return the address of FxOmniVault contract.
  function getVault() external view returns (address);

  /// @notice Return the address of base token.
  function getBaseToken() external view returns (address);

  /// @notice Return the address of fractional token.
  function getFractionalToken() external view returns (address);

  /// @notice Return the address of leveraged token.
  function getLeveragedToken() external view returns (address);

  /// @notice Return the address of fxUSD token.
  function getFxUSD() external view returns (address);

  /// @notice Return the address of base token price oracle.
  function getPriceOracle() external view returns (address);

  /// @notice Return the address of base token rate provider.
  function getRateProvider() external view returns (address);

  /// @notice Return the scaling factor of base token.
  function getScalingFactor() external view returns (uint256);

  /// @notice Return the net asset value  of the given token.
  function getNetAssetValue(address token) external view returns (uint256);

  /// @notice Return the current collateral ratio of fractional token, multiplied by 1e18.
  ///
  /// @dev This function is designed to be called by `FxOmniVault` for gas saving.
  ///
  /// @param fSupply The supply of fractional token.
  /// @param xSupply The supply of leveraged token.
  function getCollateralRatio(uint256 fSupply, uint256 xSupply) external view returns (uint256);

  /// @notice Return the current collateral ratio of fractional token, multiplied by 1e18.
  function getCollateralRatio() external view returns (uint256);

  /// @notice Return current mint pause status.
  /// @return fractionalTokenStatus Whether the fractional token minting is paused.
  /// @return leveragedTokenStatus Whether the leveraged token minting is paused.
  function getMintStatus() external view returns (bool fractionalTokenStatus, bool leveragedTokenStatus);

  /// @notice Return current redeem pause status.
  /// @return fractionalTokenStatus Whether the fractional token redeeming is paused.
  /// @return leveragedTokenStatus Whether the leveraged token redeeming is paused.
  /// @return leveragedTokenStatusInStabilityMode Whether the leveraged token redeeming in stability mode is paused.
  function getRedeemStatus()
    external
    view
    returns (
      bool fractionalTokenStatus,
      bool leveragedTokenStatus,
      bool leveragedTokenStatusInStabilityMode
    );

  /// @notice Return the collateral ratio to enter stability mode, multiplied by 1e18.
  function getStabilityRatio() external view returns (uint256);

  /// @notice Return the collateral ratio to pause fractional token mint, multiplied by 1e18.
  function getMintPauseRatio() external view returns (uint256);

  /// @notice Return the default and delta fee ratio.
  /// @param isRedeem Whether to get the redeem fee ratio.
  /// @param isLeveragedToken Whether to get the fee ratio for leveraged token.
  /// @return defaultFee The default fee ratio, multiplied by 1e9.
  /// @return deltaFee The delta fee ratio, multiplied by 1e9.
  function getMintOrRedeemFeeRatio(bool isRedeem, bool isLeveragedToken)
    external
    view
    returns (uint256 defaultFee, int256 deltaFee);

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @notice Add this pool to FxUSD.
  function enableFxUSD(address fxUSD) external;

  /// @notice Cache effective base token prices and base token rate to transient storage.
  function onPriceAndRateCache() external;

  /// @notice Clear previous cached prices and rate.
  function clearPriceAndRateCache() external;

  /// @notice Mint fractional token and leveraged token with base token.
  /// @param sender The address of base token sender.
  /// @param recipient The address of fractional token and leveraged token receiver.
  /// @param balances The amount of base tokens, fractional tokens and leveraged tokens held by this market.
  /// @param userData The custom user calldata.
  /// @return amountIn The actual amount of base token used.
  /// @return amountsOut The amount of fractional tokens and leveraged tokens minted.
  /// @return dueProtocolFeeAmount The amount of base tokens as protocol fee.
  /// @return bonusEligibleAmount The amount of base tokens eligible for bonus.
  function onPoolMint(
    address sender,
    address recipient,
    uint256[] memory balances,
    bytes calldata userData
  )
    external
    returns (
      uint256 amountIn,
      uint256[] memory amountsOut,
      uint256 dueProtocolFeeAmount,
      uint256 bonusEligibleAmount
    );

  /// @notice Redeem base token from this pool.
  /// @param sender The address of fractional token and leveraged token sender.
  /// @param recipient The address of base token receiver.
  /// @param balances The amount of base tokens, fractional tokens and leveraged tokens held by this market.
  /// @param userData The custom user calldata.
  /// @return amountsIn The amount of fractional tokens and leveraged tokens burned.
  /// @return amountOut The amount of base tokens redeemed, excluding protocol fee.
  /// @return dueProtocolFeeAmount The amount of base tokens as protocol fee.
  /// @return bonusEligibleAmount The amount of base tokens eligible for bonus.
  function onPoolRedeem(
    address sender,
    address recipient,
    uint256[] memory balances,
    bytes calldata userData
  )
    external
    returns (
      uint256[] memory amountsIn,
      uint256 amountOut,
      uint256 dueProtocolFeeAmount,
      uint256 bonusEligibleAmount
    );

  /// @notice Do token swap, including single mint and redeem.
  /// @param sender The address of base token sender.
  /// @param recipient The address of fractional token and leveraged token receiver.
  /// @param balances The amount of base tokens, fractional tokens and leveraged tokens held by this market.
  /// @param amount The amount of base tokens to use.
  /// @param indexIn The index of input token.
  /// @param indexOut The index of output token.
  /// @param userData The custom user calldata.
  /// @return amountIn The real amount of base tokens used, including protocol fee.
  /// @return amountOut The amount of fractional tokens minted.
  /// @return dueProtocolFeeAmount The amount of base tokens as protocol fee.
  /// @return bonusEligibleAmount The amount of base tokens eligible for bonus.
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
    returns (
      uint256 amountIn,
      uint256 amountOut,
      uint256 dueProtocolFeeAmount,
      uint256 bonusEligibleAmount
    );

  /// @notice Do harvest.
  /// @param baseBalance The amount of base tokens held by this market.
  /// @param fSupply The supply of fractional token.
  /// @param xSupply The supply of leveraged token.
  function onHarvest(
    uint256 baseBalance,
    uint256 fSupply,
    uint256 xSupply
  ) external returns (uint256 amount);
}
