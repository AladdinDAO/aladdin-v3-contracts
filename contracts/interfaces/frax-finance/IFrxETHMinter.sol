// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

/// @dev from: https://etherscan.io/address/0xbafa44efe7901e04e39dad13167d089c559c1138
interface IFrxETHMinter {
  /// @notice Mint frxETH and deposit it to receive sfrxETH in one transaction
  /// @dev Could try using EIP-712 / EIP-2612 here in the future if you replace this contract,
  ///      but you might run into msg.sender vs tx.origin issues with the ERC4626
  function submitAndDeposit(address recipient) external payable returns (uint256 shares);

  /// @notice Mint frxETH to the sender depending on the ETH value sent
  function submit() external payable;

  /// @notice Mint frxETH to the recipient using sender's funds
  function submitAndGive(address recipient) external payable;

  /// @notice Deposit batches of ETH to the ETH 2.0 deposit contract
  /// @dev Usually a bot will call this periodically
  /// @param max_deposits Used to prevent gassing out if a whale drops in a huge amount of ETH. Break it down into batches.
  function depositEther(uint256 max_deposits) external;
}
