// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

import { IFxTokenWrapper } from "../../interfaces/f(x)/IFxTokenWrapper.sol";
import { ILidoWstETH } from "../../interfaces/ILidoWstETH.sol";

// solhint-disable const-name-snakecase
// solhint-disable contract-name-camelcase

contract wstETHWrapper is IFxTokenWrapper {
  using SafeERC20 for IERC20;

  /*************
   * Constants *
   *************/

  /// @notice The address of Lido's stETH token.
  address public constant override src = 0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84;

  /// @notice The address of Lido's wstETH token.
  address public constant override dst = 0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0;

  /***************
   * Constructor *
   ***************/

  constructor() {
    IERC20(src).safeApprove(dst, uint256(-1));
  }

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @inheritdoc IFxTokenWrapper
  function wrap(uint256 _amount) external override returns (uint256) {
    _amount = ILidoWstETH(dst).wrap(_amount);

    IERC20(dst).safeTransfer(msg.sender, _amount);
    return _amount;
  }

  /// @inheritdoc IFxTokenWrapper
  function unwrap(uint256 _amount) external override returns (uint256) {
    _amount = ILidoWstETH(dst).unwrap(_amount);

    IERC20(src).safeTransfer(msg.sender, _amount);
    return _amount;
  }
}
