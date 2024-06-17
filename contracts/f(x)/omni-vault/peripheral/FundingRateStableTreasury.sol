// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.25;

import { FxFundingRateStablePool } from "../pool/FxFundingRateStablePool.sol";
import { StableTreasury } from "./StableTreasury.sol";

contract FundingRateStableTreasury is StableTreasury {
  constructor(address _pool) StableTreasury(_pool) {}

  function getFundingRate() public view returns (uint256) {
    return FxFundingRateStablePool(pool).getFundingRate();
  }

  function fundingCostScale() public view returns (uint256) {
    return FxFundingRateStablePool(pool).fundingCostScale();
  }
}
