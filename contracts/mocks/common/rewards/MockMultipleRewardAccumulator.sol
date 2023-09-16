// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { MultipleRewardAccumulator } from "../../../common/rewards/accumulator/MultipleRewardAccumulator.sol";
import { LinearMultipleRewardDistributor } from "../../../common/rewards/distributor/LinearMultipleRewardDistributor.sol";

contract MockMultipleRewardAccumulator is MultipleRewardAccumulator {
  event AccumulateReward(address token, uint256 amount);

  uint256 public totalPoolShare;
  uint256 public userPoolShare;

  constructor(uint40 period) LinearMultipleRewardDistributor(period) {}

  function initialize() external initializer {
    _grantRole(DEFAULT_ADMIN_ROLE, _msgSender());

    __ReentrancyGuard_init();
    __MultipleRewardAccumulator_init();
  }

  function setTotalPoolShare(uint256 _totalPoolShare) external {
    totalPoolShare = _totalPoolShare;
  }

  function setUserPoolShare(uint256 _userPoolShare) external {
    userPoolShare = _userPoolShare;
  }

  function reentrantCall(bytes calldata _data) external nonReentrant {
    (bool _success, ) = address(this).call(_data);
    // below lines will propagate inner error up
    if (!_success) {
      // solhint-disable-next-line no-inline-assembly
      assembly {
        let ptr := mload(0x40)
        let size := returndatasize()
        returndatacopy(ptr, 0, size)
        revert(ptr, size)
      }
    }
  }

  function _getTotalPoolShare() internal view virtual override returns (uint256) {
    return totalPoolShare;
  }

  function _getUserPoolShare(address) internal view virtual override returns (uint256) {
    return userPoolShare;
  }
}
