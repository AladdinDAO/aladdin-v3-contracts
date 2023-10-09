// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

interface ILidoStETH {
  /**
   * @notice Send funds to the pool with optional _referral parameter
   * @dev This function is alternative way to submit funds. Supports optional referral address.
   * @return Amount of StETH shares generated
   */
  function submit(address _referral) external payable returns (uint256);

  /**
   * @return the amount of Ether that corresponds to `_sharesAmount` token shares.
   */
  function getPooledEthByShares(uint256 _sharesAmount) external view returns (uint256);
}
