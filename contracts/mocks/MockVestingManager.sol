// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import { IERC20 } from "@openzeppelin/contracts-v4/token/ERC20/IERC20.sol";

import { IVestingManager } from "../helpers/vesting/IVestingManager.sol";

contract MockVestingManager is IVestingManager {
  event Call();

  address private immutable token;
  address private immutable reward;

  constructor(address _token, address _reward) {
    token = _token;
    reward = _reward;
  }

  function originalToken() external view returns (address) {
    return token;
  }

  function managedToken() external view returns (address) {
    return token;
  }

  function balanceOf(address proxy) external view returns (uint256) {
    return IERC20(token).balanceOf(proxy);
  }

  function manage(uint256 amount, address receiver) external {}

  function withdraw(uint256 amount, address receiver) external {
    IERC20(token).transfer(receiver, amount);
  }

  /// @notice Claim pending rewards.
  ///
  /// @dev This is designed to be delegatecalled.
  ///
  /// @param receiver The designed reward token receiver.
  function getReward(address receiver) external {
    IERC20(reward).transfer(receiver, IERC20(reward).balanceOf(address(this)));
  }

  function doCall() external {
    emit Call();
  }

  function doRevert() external pure {
    revert("revert");
  }
}
