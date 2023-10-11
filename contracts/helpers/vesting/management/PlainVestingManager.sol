// SPDX-License-Identifier: MIT

pragma solidity =0.8.20;

import { IERC20 } from "@openzeppelin/contracts-v4/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts-v4/token/ERC20/utils/SafeERC20.sol";

import { IVestingManager } from "../IVestingManager.sol";

// solhint-disable const-name-snakecase

contract PlainVestingManager is IVestingManager {
  using SafeERC20 for IERC20;

  /*************
   * Constants *
   *************/

  /// @notice The address of token to vest.
  address public immutable token;

  /***************
   * Constructor *
   ***************/

  constructor(address _token) {
    token = _token;
  }

  /*************************
   * Public View Functions *
   *************************/

  /// @inheritdoc IVestingManager
  function originalToken() external view override returns (address) {
    return token;
  }

  /// @inheritdoc IVestingManager
  function managedToken() external view override returns (address) {
    return token;
  }

  /// @inheritdoc IVestingManager
  function balanceOf(address _proxy) external view returns (uint256) {
    return IERC20(token).balanceOf(_proxy);
  }

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @inheritdoc IVestingManager
  function manage(uint256 _amount, address _receiver) external {}

  /// @inheritdoc IVestingManager
  function withdraw(uint256 _amount, address _receiver) external {
    IERC20(token).safeTransfer(_receiver, _amount);
  }

  /// @inheritdoc IVestingManager
  function getReward(address _receiver) external {}
}
