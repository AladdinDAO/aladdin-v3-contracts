// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

interface IWBETH {
  /**
   * @dev Returns the current exchange rate scaled by by 10**18
   * @return _exchangeRate The exchange rate
   */
  function exchangeRate() external view returns (uint256 _exchangeRate);

  /**
   * @dev Function to deposit eth to the contract for wBETH
   * @param referral The referral address
   */
  function deposit(address referral) external payable;

  /**
   * @dev Function to deposit eth to the contract for wBETH
   * @param amount The eth amount to deposit
   * @param referral The referral address
   */
  function deposit(uint256 amount, address referral) external;
}
