// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import { IERC20 } from "@openzeppelin/contracts-v4/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts-v4/token/ERC20/utils/SafeERC20.sol";

import { IFxTokenWrapper } from "../../interfaces/f(x)/IFxTokenWrapper.sol";
import { IFxMarketV2 } from "../../interfaces/f(x)/IFxMarketV2.sol";

// solhint-disable const-name-snakecase
// solhint-disable contract-name-camelcase

contract LeveragedTokenWrapper is IFxTokenWrapper {
  using SafeERC20 for IERC20;

  /*************
   * Constants *
   *************/

  /// @notice The address of base token.
  address public immutable override src;

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
    address _baseToken,
    address _xETH,
    address _market,
    address _platform
  ) {
    src = _baseToken;
    dst = _xETH;
    market = _market;
    platform = _platform;

    IERC20(_baseToken).safeApprove(_market, type(uint256).max);
  }

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @inheritdoc IFxTokenWrapper
  function wrap(uint256 _amount) external override returns (uint256) {
    uint256 _bonus;
    (_amount, _bonus) = IFxMarketV2(market).mintXToken(_amount, address(this), 0);
    IERC20(dst).safeTransfer(msg.sender, _amount);

    // transfer bonus to platform
    if (_bonus > 0) {
      IERC20(src).safeTransfer(platform, _bonus);
    }
    return _amount;
  }

  /// @inheritdoc IFxTokenWrapper
  function unwrap(uint256 _amount) external override returns (uint256) {
    _amount = IFxMarketV2(market).redeemXToken(_amount, address(this), 0);
    IERC20(src).safeTransfer(msg.sender, _amount);
    return _amount;
  }
}
