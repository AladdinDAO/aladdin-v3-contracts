// SPDX-License-Identifier: MIT

pragma solidity =0.8.20;

import { IERC20 } from "@openzeppelin/contracts-v4/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts-v4/token/ERC20/utils/SafeERC20.sol";

import { IConcentratorStrategy } from "../../interfaces/concentrator/IConcentratorStrategy.sol";

import { ConcentratorStrategyBase } from "../strategies/ConcentratorStrategyBase.sol";

contract ConcentratorPlainStrategy is ConcentratorStrategyBase {
  using SafeERC20 for IERC20;

  /*************
   * Constants *
   *************/

  /// @inheritdoc IConcentratorStrategy
  // solhint-disable const-name-snakecase
  string public constant override name = "ConcentratorPlainStrategy";

  /// @notice The address of holding token.
  address public immutable token;

  /***************
   * Constructor *
   ***************/

  constructor(address _operator, address _token) initializer {
    __ConcentratorStrategyBase_init(_operator, new address[](0));
    token = _token;
  }

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @inheritdoc IConcentratorStrategy
  function deposit(address, uint256) external override onlyOperator {}

  /// @inheritdoc IConcentratorStrategy
  function withdraw(address _recipient, uint256 _amount) external override onlyOperator {
    if (_amount > 0) {
      IERC20(token).safeTransfer(_recipient, _amount);
    }
  }

  /// @inheritdoc IConcentratorStrategy
  function harvest(address, address) external override onlyOperator returns (uint256) {}
}
