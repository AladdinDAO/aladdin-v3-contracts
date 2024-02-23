// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

interface IFxBoostableRebalancePool {
  /**********
   * Events *
   **********/

  /// @notice Emitted when user deposit asset into this contract.
  /// @param owner The address of asset owner.
  /// @param reciever The address of receiver of the asset in this contract.
  /// @param amount The amount of asset deposited.
  event Deposit(address indexed owner, address indexed reciever, uint256 amount);

  /// @notice Emitted when the amount of deposited asset changed due to liquidation or deposit or unlock.
  /// @param owner The address of asset owner.
  /// @param newDeposit The new amount of deposited asset.
  /// @param loss The amount of asset used by liquidation.
  event UserDepositChange(address indexed owner, uint256 newDeposit, uint256 loss);

  /// @notice Emitted when user withdraw asset.
  /// @param owner The address of asset owner.
  /// @param reciever The address of receiver of the asset.
  /// @param amount The amount of token to withdraw.
  event Withdraw(address indexed owner, address indexed reciever, uint256 amount);

  /// @notice Emitted when liquidation happens.
  /// @param liquidated The amount of asset liquidated.
  /// @param baseGained The amount of base token gained.
  event Liquidate(uint256 liquidated, uint256 baseGained);

  /// @notice Emitted when the address of reward wrapper is updated.
  /// @param oldWrapper The address of previous reward wrapper.
  /// @param newWrapper The address of current reward wrapper.
  event UpdateWrapper(address indexed oldWrapper, address indexed newWrapper);

  /// @notice Emitted when the liquidatable collateral ratio is updated.
  /// @param oldRatio The previous liquidatable collateral ratio.
  /// @param newRatio The current liquidatable collateral ratio.
  event UpdateLiquidatableCollateralRatio(uint256 oldRatio, uint256 newRatio);

  /**********
   * Errors *
   **********/

  /// @dev Thrown then the src token mismatched.
  error ErrorWrapperSrcMismatch();

  /// @dev Thrown then the dst token mismatched.
  error ErrorWrapperDstMismatch();

  /// @dev Thrown when the deposited amount is zero.
  error DepositZeroAmount();

  /// @dev Thrown when the withdrawn amount is zero.
  error WithdrawZeroAmount();

  /// @dev Thrown the cannot liquidate.
  error CannotLiquidate();

  /*************************
   * Public View Functions *
   *************************/

  /// @notice Return the address of treasury contract.
  function treasury() external view returns (address);

  /// @notice Return the address of market contract.
  function market() external view returns (address);

  /// @notice Return the address of base token.
  function baseToken() external view returns (address);

  /// @notice Return the address of underlying token of this contract.
  function asset() external view returns (address);

  /// @notice Return the total amount of asset deposited to this contract.
  function totalSupply() external view returns (uint256);

  /// @notice Return the amount of deposited asset for some specific user.
  /// @param account The address of user to query.
  function balanceOf(address account) external view returns (uint256);

  /// @notice Return the current boost ratio for some specific user.
  /// @param account The address of user to query, multiplied by 1e18.
  function getBoostRatio(address account) external view returns (uint256);

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @notice Deposit some asset to this contract.
  /// @dev Use `amount=uint256(-1)` if you want to deposit all asset held.
  /// @param amount The amount of asset to deposit.
  /// @param receiver The address of recipient for the deposited asset.
  function deposit(uint256 amount, address receiver) external;

  /// @notice Withdraw asset from this contract.
  function withdraw(uint256 amount, address receiver) external;

  /// @notice Liquidate asset for base token.
  /// @param maxAmount The maximum amount of asset to liquidate.
  /// @param minBaseOut The minimum amount of base token should receive.
  /// @return liquidated The amount of asset liquidated.
  /// @return baseOut The amount of base token received.
  function liquidate(uint256 maxAmount, uint256 minBaseOut) external returns (uint256 liquidated, uint256 baseOut);
}
