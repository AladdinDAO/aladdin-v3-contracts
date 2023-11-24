// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";

interface IAladdinCRV is IERC20Upgradeable {
  event Harvest(address indexed _caller, uint256 _amount);
  event Deposit(address indexed _sender, address indexed _recipient, uint256 _amount);
  event Withdraw(
    address indexed _sender,
    address indexed _recipient,
    uint256 _shares,
    IAladdinCRV.WithdrawOption _option
  );

  event UpdateWithdrawalFeePercentage(uint256 _feePercentage);
  event UpdatePlatformFeePercentage(uint256 _feePercentage);
  event UpdateHarvestBountyPercentage(uint256 _percentage);
  event UpdatePlatform(address indexed _platform);

  enum WithdrawOption {
    // withdraw as cvxCRV
    Withdraw,
    // withdraw as cvxCRV staking wrapper
    WithdrawAndStake,
    // withdraw as CRV
    WithdrawAsCRV,
    // withdraw as CVX
    WithdrawAsCVX,
    // withdraw as ETH
    WithdrawAsETH
  }

  /// @notice return the total amount of cvxCRV staked.
  function totalUnderlying() external view returns (uint256);

  /// @notice return the amount of cvxCRV staked for user
  /// @param _user - The address of the account
  function balanceOfUnderlying(address _user) external view returns (uint256);

  /// @notice Deposit cvxCRV token to this contract
  /// @param _recipient - The address who will receive the aCRV token.
  /// @param _amount - The amount of cvxCRV to deposit.
  /// @return share - The amount of aCRV received.
  function deposit(address _recipient, uint256 _amount) external returns (uint256 share);

  /// @notice Deposit all cvxCRV token of the sender to this contract
  /// @param _recipient The address who will receive the aCRV token.
  /// @return share - The amount of aCRV received.
  function depositAll(address _recipient) external returns (uint256 share);

  /// @notice Deposit CRV token to this contract
  /// @param _recipient - The address who will receive the aCRV token.
  /// @param _amount - The amount of CRV to deposit.
  /// @return share - The amount of aCRV received.
  function depositWithCRV(address _recipient, uint256 _amount) external returns (uint256 share);

  /// @notice Deposit all CRV token of the sender to this contract
  /// @param _recipient The address who will receive the aCRV token.
  /// @return share - The amount of aCRV received.
  function depositAllWithCRV(address _recipient) external returns (uint256 share);

  /// @notice Withdraw cvxCRV in proportion to the amount of shares sent
  /// @param _recipient - The address who will receive the withdrawn token.
  /// @param _shares - The amount of aCRV to send.
  /// @param _minimumOut - The minimum amount of token should be received.
  /// @param _option - The withdraw option (as cvxCRV or CRV or CVX or ETH or stake to convex).
  /// @return withdrawn - The amount of token returned to the user.
  function withdraw(
    address _recipient,
    uint256 _shares,
    uint256 _minimumOut,
    WithdrawOption _option
  ) external returns (uint256 withdrawn);

  /// @notice Withdraw all cvxCRV in proportion to the amount of shares sent
  /// @param _recipient - The address who will receive the withdrawn token.
  /// @param _minimumOut - The minimum amount of token should be received.
  /// @param _option - The withdraw option (as cvxCRV or CRV or CVX or ETH or stake to convex).
  /// @return withdrawn - The amount of token returned to the user.
  function withdrawAll(
    address _recipient,
    uint256 _minimumOut,
    WithdrawOption _option
  ) external returns (uint256 withdrawn);

  /// @notice Harvest the pending reward and convert to cvxCRV.
  /// @param _recipient - The address of account to receive harvest bounty.
  /// @param _minimumOut - The minimum amount of cvxCRV should get.
  function harvest(address _recipient, uint256 _minimumOut) external returns (uint256);
}
