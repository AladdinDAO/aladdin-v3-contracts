// SPDX-License-Identifier: MIT

pragma solidity =0.8.20;

import { IConcentratorStrategy } from "../../interfaces/concentrator/IConcentratorStrategy.sol";

import { ConcentratorConvexCurveStrategy } from "../strategies/ConcentratorConvexCurveStrategy.sol";

contract xETHConvexCurveStrategy is ConcentratorConvexCurveStrategy {
  /*************
   * Constants *
   *************/

  /// @inheritdoc IConcentratorStrategy
  // solhint-disable const-name-snakecase
  string public constant override name = "xETHConvexCurveStrategy";

  /***************
   * Constructor *
   ***************/

  function initialize(
    address _operator,
    address _token,
    address _staker
  ) external initializer {
    __ConcentratorStrategyBase_init(_operator, new address[](0));
    __ConcentratorConvexCurveStrategy_init(_token, _staker);
  }
}
