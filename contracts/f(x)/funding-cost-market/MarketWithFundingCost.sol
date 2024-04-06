// SPDX-License-Identifier: MIT

pragma solidity =0.8.20;

import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable-v4/token/ERC20/IERC20Upgradeable.sol";
import { SafeERC20Upgradeable } from "@openzeppelin/contracts-upgradeable-v4/token/ERC20/utils/SafeERC20Upgradeable.sol";

import { IFxTreasuryV2 } from "../../interfaces/f(x)/IFxTreasuryV2.sol";

import { MarketV2 } from "../v2/MarketV2.sol";

contract MarketWithFundingCost is MarketV2 {
  using SafeERC20Upgradeable for IERC20Upgradeable;

  /*************
   * Modifiers *
   *************/

  /// @dev Harvest funding cost from treasury. If we have harvest bounty, transfer to caller.
  modifier harvestFundingCost() {
    uint256 _balance = IERC20Upgradeable(baseToken).balanceOf(address(this));
    IFxTreasuryV2(treasury).harvest();
    uint256 _bounty = IERC20Upgradeable(baseToken).balanceOf(address(this)) - _balance;
    if (_bounty > 0) {
      IERC20Upgradeable(baseToken).safeTransfer(_msgSender(), _bounty);
    }
    _;
  }

  /***************
   * Constructor *
   ***************/

  constructor(address _treasury) MarketV2(_treasury) {}

  /**********************
   * Internal Functions *
   **********************/

  /// @dev Hook function to call before mint fToken.
  function _beforeMintFToken() internal virtual override harvestFundingCost {}

  /// @dev Hook function to call before mint xToken.
  function _beforeMintXToken() internal virtual override harvestFundingCost {}

  /// @dev Hook function to call before redeem fToken.
  function _beforeRedeemFToken() internal virtual override harvestFundingCost {}

  /// @dev Hook function to call before redeem xToken.
  function _beforeRedeemXToken() internal virtual override harvestFundingCost {}
}
