// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.0;

interface IUniversalRewardsDistributor {
  function root() external view returns (bytes32);

  function claimed(address, address) external view returns (uint256);

  function claim(address account, address reward, uint256 claimable, bytes32[] memory proof)
    external
    returns (uint256 amount);

  function recipients(address account) external view returns (address);

  function setRecipient(address account, address recipient) external;
}
