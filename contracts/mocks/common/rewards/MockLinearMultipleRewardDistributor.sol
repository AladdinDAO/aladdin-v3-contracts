// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { LinearMultipleRewardDistributor } from "../../../common/rewards/distributor/LinearMultipleRewardDistributor.sol";

contract MockLinearMultipleRewardDistributor is LinearMultipleRewardDistributor {
  event AccumulateReward(address token, uint256 amount);

  constructor(uint40 period) LinearMultipleRewardDistributor(period) {}

  function initialize() external initializer {
    __LinearMultipleRewardDistributor_init();

    _grantRole(DEFAULT_ADMIN_ROLE, _msgSender());
  }

  function _accumulateReward(address _token, uint256 _amount) internal virtual override {
    emit AccumulateReward(_token, _amount);
  }
}
