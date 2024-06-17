// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import { CustomFeeRate } from "../../../common/fees/CustomFeeRate.sol";

contract MockCustomFeeRate is CustomFeeRate {
  function initialize() external initializer {
    _grantRole(DEFAULT_ADMIN_ROLE, _msgSender());
  }

  function getDefaultFeeRate(uint256 _feeType) external view returns (uint256) {
    return _defaultFeeRate(_feeType);
  }
}
