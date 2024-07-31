// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.25;

import { AccessControlUpgradeable } from "@openzeppelin/contracts-upgradeable-v4/access/AccessControlUpgradeable.sol";
import { SafeERC20Upgradeable } from "@openzeppelin/contracts-upgradeable-v4/token/ERC20/utils/SafeERC20Upgradeable.sol";
import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable-v4/token/ERC20/IERC20Upgradeable.sol";

import { IERC3156FlashBorrower } from "../../common/ERC3156/IERC3156FlashBorrower.sol";
import { IERC3156FlashLender } from "../../common/ERC3156/IERC3156FlashLender.sol";

import { FeeManagement } from "./FeeManagement.sol";

abstract contract FlashLoans is FeeManagement, IERC3156FlashLender {
  using SafeERC20Upgradeable for IERC20Upgradeable;

  error ErrorInsufficientFlashLoanReturn();

  error ErrorERC3156CallbackFailed();

  bytes32 public constant CALLBACK_SUCCESS = keccak256("ERC3156FlashBorrower.onFlashLoan");

  function __FlashLoans_init() internal onlyInitializing {}

  /// @inheritdoc IERC3156FlashLender
  function maxFlashLoan(address token) external view override returns (uint256) {
    return IERC20Upgradeable(token).balanceOf(address(this));
  }

  /// @inheritdoc IERC3156FlashLender
  function flashFee(
    address, /*token*/
    uint256 amount
  ) public view returns (uint256) {
    return (amount * getFlashLoanFeeRatio()) / FEE_PRECISION;
  }

  /// @inheritdoc IERC3156FlashLender
  function flashLoan(
    IERC3156FlashBorrower receiver,
    address token,
    uint256 amount,
    bytes calldata data
  ) external nonReentrant returns (bool) {
    // save the current balance
    uint256 prevBalance = IERC20Upgradeable(token).balanceOf(address(this));
    uint256 fee = flashFee(token, amount);

    IERC20Upgradeable(token).safeTransfer(address(receiver), amount);

    // invoke the recipient's callback
    if (receiver.onFlashLoan(_msgSender(), token, amount, fee, data) != CALLBACK_SUCCESS) {
      revert ErrorERC3156CallbackFailed();
    }

    // ensure that the tokens + fee have been deposited back to the network
    uint256 returnedAmount = IERC20Upgradeable(token).balanceOf(address(this)) - prevBalance;
    if (returnedAmount < amount + fee) {
      revert ErrorInsufficientFlashLoanReturn();
    }

    return true;
  }
}
