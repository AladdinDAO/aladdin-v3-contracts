// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

import { ITokenWrapper } from "../interfaces/ITokenWrapper.sol";
import { IMarket } from "../interfaces/IMarket.sol";

// solhint-disable const-name-snakecase
// solhint-disable contract-name-camelcase

contract StETHAndxETHWrapper is ITokenWrapper {
  using SafeERC20 for IERC20;

  /*************
   * Constants *
   *************/

  /// @notice The address of Lido's stETH token.
  address public constant override src = 0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84;

  /// @notice The address of of xETH.
  address public immutable override dst;

  /// @notice The address of of Market.
  address public immutable market;

  /// @notice The address of of Platform.
  address public immutable platform;

  /***************
   * Constructor *
   ***************/

  constructor(
    address _xETH,
    address _market,
    address _platform
  ) {
    dst = _xETH;
    market = _market;
    platform = _platform;

    IERC20(src).safeApprove(_market, uint256(-1));
  }

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @inheritdoc ITokenWrapper
  function wrap(uint256 _amount) external override returns (uint256) {
    uint256 _bonus;
    (_amount, _bonus) = IMarket(market).mintXToken(_amount, address(this), 0);
    IERC20(dst).safeTransfer(msg.sender, _amount);

    // transfer bonus to platform
    if (_bonus > 0) {
      IERC20(src).safeTransfer(platform, _bonus);
    }
    return _amount;
  }

  /// @inheritdoc ITokenWrapper
  function unwrap(uint256 _amount) external override returns (uint256) {
    uint256 _bonus;
    (_amount, _bonus) = IMarket(market).redeem(0, _amount, address(this), 0);
    IERC20(src).safeTransfer(msg.sender, _amount);

    // transfer bonus to platform
    if (_bonus > 0) {
      IERC20(src).safeTransfer(platform, _bonus);
    }
    return _amount;
  }
}
