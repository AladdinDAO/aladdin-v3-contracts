// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;
pragma abicoder v2;

/// @dev from: https://etherscan.io/address/0x74a09653a083691711cf8215a6ab074bb4e99ef5
interface IRenzoRestakeManager {
  /// @dev Stores the list of collateral tokens
  function collateralTokens(uint256 index) external view returns (address);

  /// @dev Finds the index of the collateral token in the list
  /// Reverts if the token is not found in the list
  function getCollateralTokenIndex(address collateralToken) external view returns (uint256);

  /// @dev This function calculates the TVLs for each operator delegator by individual token, total for each OD, and total for the protocol.
  /// @return operatorDelegatorTokenTVLs Each OD's TVL indexed by operatorDelegators array by collateralTokens array
  /// @return operatorDelegatorTVLs Each OD's Total TVL in order of operatorDelegators array
  /// @return totalTVL The total TVL across all operator delegators.
  function calculateTVLs()
    external
    view
    returns (
      uint256[][] memory,
      uint256[] memory,
      uint256
    );

  /// @notice Deposits an ERC20 collateral token into the protocol
  /// @dev Convenience function to deposit without a referral ID and backwards compatibility
  /// @param collateralToken  The address of the collateral ERC20 token to deposit
  /// @param amount The amount of the collateral token to deposit in base units
  function deposit(address collateralToken, uint256 amount) external;

  /// @notice  Deposits an ERC20 collateral token into the protocol
  /// @dev The msg.sender must pre-approve this contract to move the tokens into the protocol.
  ///
  /// To deposit, the contract will:
  ///   - Figure out which operator delegator to use
  ///   - Transfer the collateral token to the operator delegator and deposit it into EigenLayer
  ///   - Calculate and mint the appropriate amount of ezETH back to the user
  ///
  /// ezETH will get inflated proportional to the value they are depositing vs the value already in the protocol.
  /// The collateral token specified must be pre-configured to be allowed in the protocol.
  ///
  /// @param   collateralToken  The address of the collateral ERC20 token to deposit
  /// @param   amount The amount of the collateral token to deposit in base units
  /// @param   referralId The referral ID to use for the deposit (can be 0 if none)
  function deposit(
    address collateralToken,
    uint256 amount,
    uint256 referralId
  ) external;

  /// @notice Allows a user to deposit ETH into the protocol and get back ezETH
  /// @dev Convenience function to deposit without a referral ID and backwards compatibility
  function depositETH() external payable;

  /// @notice Allows a user to deposit ETH into the protocol and get back ezETH
  /// @dev The amount of ETH sent into this function will be sent to the deposit queue to be
  ///      staked later by a validator.  Once staked it will be deposited into EigenLayer.
  /// @param referralId  The referral ID to use for the deposit (can be 0 if none)
  function depositETH(uint256 referralId) external payable;
}
