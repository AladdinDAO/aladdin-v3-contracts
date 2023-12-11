// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { IERC20 } from "@openzeppelin/contracts-v4/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts-v4/token/ERC20/utils/SafeERC20.sol";

import { IConverterRegistry } from "../../helpers/converter/IConverterRegistry.sol";
import { ITokenConverter } from "../../helpers/converter/ITokenConverter.sol";

import { ConcentratorStrategyBaseV2 } from "./ConcentratorStrategyBaseV2.sol";

abstract contract ManualCompoundingStrategyBaseV2 is ConcentratorStrategyBaseV2 {
  using SafeERC20 for IERC20;

  function _harvest(
    address _converter,
    address _intermediate,
    address[] memory _rewards,
    uint256[] memory _amounts
  ) internal returns (uint256 _harvested) {
    address _registry = ITokenConverter(_converter).registry();

    for (uint256 i = 0; i < rewards.length; i++) {
      address _rewardToken = _rewards[i];
      uint256 _amount = _amounts[i];
      if (_rewardToken == _intermediate) {
        _harvested += _amount;
      } else if (_amount > 0) {
        _transferToken(_rewardToken, _converter, _amount);
        _harvested += _convert(
          _converter,
          _amount,
          IConverterRegistry(_registry).getRoutes(_rewardToken, _intermediate),
          address(this)
        );
      }
    }
  }
}
