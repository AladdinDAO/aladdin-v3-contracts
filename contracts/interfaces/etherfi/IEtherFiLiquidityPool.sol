// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

/// @dev from: https://etherscan.io/address/0x308861a430be4cce5502d0a12724771fc6daf216
interface IEtherFiLiquidityPool {
  // Used by eETH staking flow
  function deposit() external payable returns (uint256);

  function deposit(address _referral) external payable returns (uint256);

  function depositToRecipient(
    address _recipient,
    uint256 _amount,
    address _referral
  ) external returns (uint256);

  // Used by ether.fan staking flow
  function deposit(address _user, address _referral) external payable returns (uint256);

  /// @notice withdraw from pool
  /// @dev Burns user balance from msg.senders account & Sends equal amount of ETH back to the recipient
  /// @param _recipient the recipient who will receives the ETH
  /// @param _amount the amount to withdraw from contract
  /// it returns the amount of shares burned
  function withdraw(address _recipient, uint256 _amount) external returns (uint256);

  /// @notice request withdraw from pool and receive a WithdrawRequestNFT
  /// @dev Transfers the amount of eETH from msg.senders account to the WithdrawRequestNFT contract & mints an NFT to the msg.sender
  /// @param recipient address that will be issued the NFT
  /// @param amount requested amount to withdraw from contract
  /// @return uint256 requestId of the WithdrawRequestNFT
  function requestWithdraw(address recipient, uint256 amount) external returns (uint256);
}
