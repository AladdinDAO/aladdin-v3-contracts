// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import { SafeERC20Upgradeable } from "@openzeppelin/contracts-upgradeable-v4/token/ERC20/utils/SafeERC20Upgradeable.sol";
import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable-v4/token/ERC20/IERC20Upgradeable.sol";

import { IStandardizedYield } from "../../interfaces/pendle/IStandardizedYield.sol";

import { LibGatewayRouter } from "../libraries/LibGatewayRouter.sol";

contract ERC5115CompounderFacet {
  using SafeERC20Upgradeable for IERC20Upgradeable;

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @notice Deposit to ERC5115 vault with given token and convert parameters.
  function ERC5115Deposit(
    LibGatewayRouter.ConvertInParams memory params,
    address compounder,
    address tokenIn,
    uint256 minSharesOut
  ) external payable returns (uint256 sharesOut) {
    LibGatewayRouter.ensureWhitelisted(compounder, LibGatewayRouter.WhitelistKind.ERC5115Compounder);

    uint256 amount = LibGatewayRouter.transferInAndConvert(params, tokenIn);
    LibGatewayRouter.approve(tokenIn, compounder, amount);
    return IStandardizedYield(compounder).deposit(msg.sender, tokenIn, amount, minSharesOut);
  }

  /// @notice Redeem fToken and convert to some other token.
  /// @param params The output token converting parameters.
  /// @param compounder The address of ERC5115 compounder.
  /// @param shares The amount of ERC5115 token share to redeem.
  /// @param tokenOut The address of token to redeem from ERC5115 compounder.
  /// @param minTokenOut The minimum amount of `tokenOut` should be received in this contract.
  /// @return amountToken The amount of `tokenOut` received.
  /// @return amountDst The amount of destination token received.
  function ERC5115Redeem(
    LibGatewayRouter.ConvertOutParams memory params,
    address compounder,
    uint256 shares,
    address tokenOut,
    uint256 minTokenOut
  ) external returns (uint256 amountToken, uint256 amountDst) {
    LibGatewayRouter.ensureWhitelisted(compounder, LibGatewayRouter.WhitelistKind.ERC5115Compounder);

    shares = LibGatewayRouter.transferTokenIn(compounder, compounder, shares);
    amountToken = IStandardizedYield(compounder).redeem(address(this), shares, tokenOut, minTokenOut, true);

    amountDst = LibGatewayRouter.convertAndTransferOut(params, tokenOut, amountToken, msg.sender);
  }
}
