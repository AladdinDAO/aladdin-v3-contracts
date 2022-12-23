// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract MockCurveGaugeV4V5 {
  function deposit_reward_token(address _reward_token, uint256 _amount) external {
    IERC20(_reward_token).transferFrom(msg.sender, address(this), _amount);
  }

  function claim_rewards() external {}
}
