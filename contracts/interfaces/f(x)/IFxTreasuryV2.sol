// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

interface IFxTreasuryV2 {
  /**********
   * Events *
   **********/

  /// @notice Emitted when the platform contract is updated.
  /// @param oldPlatform The address of previous platform contract.
  /// @param newPlatform The address of current platform contract.
  event UpdatePlatform(address indexed oldPlatform, address indexed newPlatform);

  /// @notice Emitted when the RebalancePoolSplitter contract is updated.
  /// @param oldRebalancePoolSplitter The address of previous RebalancePoolSplitter contract.
  /// @param newRebalancePoolSplitter The address of current RebalancePoolSplitter.
  event UpdateRebalancePoolSplitter(address indexed oldRebalancePoolSplitter, address indexed newRebalancePoolSplitter);

  /// @notice Emitted when the price oracle contract is updated.
  /// @param oldPriceOracle The address of previous price oracle.
  /// @param newPriceOracle The address of current price oracle.
  event UpdatePriceOracle(address indexed oldPriceOracle, address indexed newPriceOracle);

  /// @notice Emitted when the strategy contract is updated.
  /// @param oldStrategy The address of previous strategy.
  /// @param newStrategy The address of current strategy.
  event UpdateStrategy(address indexed oldStrategy, address indexed newStrategy);

  /// @notice Emitted when the base token cap is updated.
  /// @param oldBaseTokenCap The value of previous base token cap.
  /// @param newBaseTokenCap The value of current base token cap.
  event UpdateBaseTokenCap(uint256 oldBaseTokenCap, uint256 newBaseTokenCap);

  /// @notice Emitted when the EMA sample interval is updated.
  /// @param oldSampleInterval The value of previous EMA sample interval.
  /// @param newSampleInterval The value of current EMA sample interval.
  event UpdateEMASampleInterval(uint256 oldSampleInterval, uint256 newSampleInterval);

  /// @notice Emitted when the reference price is updated.
  /// @param oldPrice The value of previous reference price.
  /// @param newPrice The value of current reference price.
  event Settle(uint256 oldPrice, uint256 newPrice);

  /// @notice Emitted when the ratio for rebalance pool is updated.
  /// @param oldRatio The value of the previous ratio, multiplied by 1e9.
  /// @param newRatio The value of the current ratio, multiplied by 1e9.
  event UpdateRebalancePoolRatio(uint256 oldRatio, uint256 newRatio);

  /// @notice Emitted when the ratio for harvester is updated.
  /// @param oldRatio The value of the previous ratio, multiplied by 1e9.
  /// @param newRatio The value of the current ratio, multiplied by 1e9.
  event UpdateHarvesterRatio(uint256 oldRatio, uint256 newRatio);

  /// @notice Emitted when someone harvest pending stETH rewards.
  /// @param caller The address of caller.
  /// @param totalRewards The amount of total harvested rewards.
  /// @param rebalancePoolRewards The amount of harvested rewards distributed to stability pool.
  /// @param harvestBounty The amount of harvested rewards distributed to caller as harvest bounty.
  event Harvest(address indexed caller, uint256 totalRewards, uint256 rebalancePoolRewards, uint256 harvestBounty);

  /**********
   * Errors *
   **********/

  /// @dev Thrown when the collateral ratio is smaller than 100%.
  error ErrorCollateralRatioTooSmall();

  /// @dev Thrown when mint exceed total capacity.
  error ErrorExceedTotalCap();

  /// @dev Thrown when the oracle price is invalid.
  error ErrorInvalidOraclePrice();

  /// @dev Thrown when the twap price is invalid.
  error ErrorInvalidTwapPrice();

  /// @dev Thrown when initialize protocol twice.
  error ErrorProtocolInitialized();

  /// @dev Thrown when the initial amount of base token is not enough.
  error ErrorInsufficientInitialBaseToken();

  /// @dev Thrown when current is under collateral.
  error ErrorUnderCollateral();

  /// @dev Thrown when the sample internal for EMA is too small.
  error ErrorEMASampleIntervalTooSmall();

  /// @dev Thrown when the expense ratio exceeds `MAX_REBALANCE_POOL_RATIO`.
  error ErrorRebalancePoolRatioTooLarge();

  /// @dev Thrown when the harvester ratio exceeds `MAX_HARVESTER_RATIO`.
  error ErrorHarvesterRatioTooLarge();

  /// @dev Thrown when the given address is zero.
  error ErrorZeroAddress();

  /*********
   * Enums *
   *********/

  enum Action {
    None,
    MintFToken,
    MintXToken,
    RedeemFToken,
    RedeemXToken
  }

  /*************************
   * Public View Functions *
   *************************/

  /// @notice Return the address of price oracle contract.
  function priceOracle() external view returns (address);

  /// @notice Return the address of base token.
  function baseToken() external view returns (address);

  /// @notice Return the address fractional base token.
  function fToken() external view returns (address);

  /// @notice Return the address leveraged base token.
  function xToken() external view returns (address);

  /// @notice The reference base token price.
  function referenceBaseTokenPrice() external view returns (uint256);

  /// @notice The current base token price.
  function currentBaseTokenPrice() external view returns (uint256);

  /// @notice Return whether the price is valid.
  function isBaseTokenPriceValid() external view returns (bool);

  /// @notice Return the total amount of underlying value of base token deposited.
  function totalBaseToken() external view returns (uint256);

  /// @notice Return the address of strategy contract.
  function strategy() external view returns (address);

  /// @notice Return the total amount of base token managed by strategy.
  function strategyUnderlying() external view returns (uint256);

  /// @notice Return the current collateral ratio of fToken, multiplied by 1e18.
  function collateralRatio() external view returns (uint256);

  /// @notice Return whether the system is under collateral.
  function isUnderCollateral() external view returns (bool);

  /// @notice Compute the amount of base token needed to reach the new collateral ratio.
  /// @param newCollateralRatio The target collateral ratio, multiplied by 1e18.
  /// @return maxBaseIn The amount of underlying value of base token needed.
  /// @return maxFTokenMintable The amount of fToken can be minted.
  function maxMintableFToken(uint256 newCollateralRatio)
    external
    view
    returns (uint256 maxBaseIn, uint256 maxFTokenMintable);

  /// @notice Compute the amount of base token needed to reach the new collateral ratio.
  /// @param newCollateralRatio The target collateral ratio, multiplied by 1e18.
  /// @return maxBaseIn The amount of underlying value of base token needed.
  /// @return maxXTokenMintable The amount of xToken can be minted.
  function maxMintableXToken(uint256 newCollateralRatio)
    external
    view
    returns (uint256 maxBaseIn, uint256 maxXTokenMintable);

  /// @notice Compute the amount of fToken needed to reach the new collateral ratio.
  /// @param newCollateralRatio The target collateral ratio, multiplied by 1e18.
  /// @return maxBaseOut The amount of underlying value of base token redeemed.
  /// @return maxFTokenRedeemable The amount of fToken needed.
  function maxRedeemableFToken(uint256 newCollateralRatio)
    external
    view
    returns (uint256 maxBaseOut, uint256 maxFTokenRedeemable);

  /// @notice Compute the amount of xToken needed to reach the new collateral ratio.
  /// @param newCollateralRatio The target collateral ratio, multiplied by 1e18.
  /// @return maxBaseOut The amount of underlying value of base token redeemed.
  /// @return maxXTokenRedeemable The amount of xToken needed.
  function maxRedeemableXToken(uint256 newCollateralRatio)
    external
    view
    returns (uint256 maxBaseOut, uint256 maxXTokenRedeemable);

  /// @notice Return the exponential moving average of the leverage ratio.
  function leverageRatio() external view returns (uint256);

  /// @notice Convert underlying token amount to wrapped token amount.
  /// @param amount The underlying token amount.
  function getWrapppedValue(uint256 amount) external view returns (uint256);

  /// @notice Convert wrapped token amount to underlying token amount.
  /// @param amount The wrapped token amount.
  function getUnderlyingValue(uint256 amount) external view returns (uint256);

  /// @notice Return the fee ratio distributed to rebalance pool, multiplied by 1e9.
  function getRebalancePoolRatio() external view returns (uint256);

  /// @notice Return the fee ratio distributed to harvester, multiplied by 1e9.
  function getHarvesterRatio() external view returns (uint256);

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @notice Initialize the protocol.
  /// @param baseIn The amount of underlying value of the base token used to initialize.
  function initializeProtocol(uint256 baseIn) external returns (uint256 fTokenOut, uint256 xTokenOut);

  /// @notice Mint fToken with some base token.
  /// @param baseIn The amount of underlying value of base token deposited.
  /// @param recipient The address of receiver.
  /// @return fTokenOut The amount of fToken minted.
  function mintFToken(uint256 baseIn, address recipient) external returns (uint256 fTokenOut);

  /// @notice Mint xToken with some base token.
  /// @param baseIn The amount of underlying value of base token deposited.
  /// @param recipient The address of receiver.
  /// @return xTokenOut The amount of xToken minted.
  function mintXToken(uint256 baseIn, address recipient) external returns (uint256 xTokenOut);

  /// @notice Redeem fToken and xToken to base token.
  /// @param fTokenIn The amount of fToken to redeem.
  /// @param xTokenIn The amount of xToken to redeem.
  /// @param owner The owner of the fToken or xToken.
  /// @param baseOut The amount of underlying value of base token redeemed.
  function redeem(
    uint256 fTokenIn,
    uint256 xTokenIn,
    address owner
  ) external returns (uint256 baseOut);

  /// @notice Settle the nav of base token, fToken and xToken.
  function settle() external;

  /// @notice Transfer some base token to strategy contract.
  /// @param amount The amount of token to transfer.
  function transferToStrategy(uint256 amount) external;

  /// @notice Notify base token profit from strategy contract.
  /// @param amount The amount of base token.
  function notifyStrategyProfit(uint256 amount) external;

  /// @notice Harvest pending rewards to stability pool.
  function harvest() external;
}
