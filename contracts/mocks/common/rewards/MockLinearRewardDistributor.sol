// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { LinearRewardDistributor } from "../../../common/rewards/distributor/LinearRewardDistributor.sol";

contract MockLinearRewardDistributor is LinearRewardDistributor {
  event AccumulateReward(uint256 amount);

  constructor(uint40 period) LinearRewardDistributor(period) {}

  function initialize(address _rewardToken) external initializer {
    __LinearRewardDistributor_init(_rewardToken);

    _grantRole(DEFAULT_ADMIN_ROLE, _msgSender());
  }

  function _accumulateReward(uint256 _amount) internal virtual override {
    emit AccumulateReward(_amount);
  }
}
