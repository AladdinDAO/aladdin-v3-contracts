// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import { AccessControl } from "@openzeppelin/contracts-v4/access/AccessControl.sol";
import { IERC20 } from "@openzeppelin/contracts-v4/token/ERC20/IERC20.sol";

import { ITokenConverter } from "../../helpers/converter/ITokenConverter.sol";
import { IFlashLoanRecipient } from "../../interfaces/balancer/IFlashLoanRecipient.sol";
import { IFxUSD } from "../../interfaces/f(x)/IFxUSD.sol";
import { IBalancerVault } from "../../interfaces/IBalancerVault.sol";

/// WETH => baseToken => fxUSD => WETH
contract FxUSDArbitrager is AccessControl, IFlashLoanRecipient {
  /*************
   * Constants *
   *************/

  /// @dev The role for arbitrager.
  bytes32 private constant ARBITRAGER_ROLE = keccak256("ARBITRAGER_ROLE");

  /// @dev The address of WETH.
  address private constant WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;

  /// @dev The address of Balancer V2 Vault.
  address private constant BALANCER_VAULT = 0xBA12222222228d8Ba445958a75a0704d566BF2C8;

  /// @dev The address of GeneralTokenConverter
  address private constant CONVERTER = 0x11C907b3aeDbD863e551c37f21DD3F36b28A6784;

  /***************
   * Constructor *
   ***************/

  constructor(address _arbitrager) {
    _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    _grantRole(ARBITRAGER_ROLE, _arbitrager);
  }

  /****************************
   * Public Mutated Functions *
   ****************************/

  function balancerRun(
    uint256 amount,
    uint256 minProfit,
    bytes calldata userData
  ) external onlyRole(ARBITRAGER_ROLE) returns (uint256) {
    // do arbitrage
    address[] memory tokens = new address[](1);
    uint256[] memory amounts = new uint256[](1);
    tokens[0] = WETH;
    amounts[0] = amount;
    IBalancerVault(BALANCER_VAULT).flashLoan(address(this), tokens, amounts, userData);

    // take profit
    uint256 balance = IERC20(WETH).balanceOf(address(this));
    require(balance >= minProfit, "insufficient profit");
    IERC20(WETH).transfer(msg.sender, balance);
    return balance;
  }

  function simpleRun(
    uint256 amountIn,
    uint256 minProfit,
    address baseToken,
    address fxUSD,
    uint256[] memory routesA,
    uint256[] memory routesB
  ) external onlyRole(ARBITRAGER_ROLE) returns (uint256) {
    uint256 t = amountIn;
    IERC20(WETH).transferFrom(msg.sender, CONVERTER, amountIn);
    amountIn = _swap(amountIn, routesA); // amount of base token
    IERC20(baseToken).approve(fxUSD, 0);
    IERC20(baseToken).approve(fxUSD, amountIn);
    amountIn = IFxUSD(fxUSD).mint(baseToken, amountIn, CONVERTER, 0); // amount of fxUSD
    amountIn = _swap(amountIn, routesB); // amount of WETH
    require(amountIn >= t + minProfit, "insufficient profit");
    IERC20(WETH).transfer(msg.sender, amountIn);
    return amountIn - t;
  }

  function receiveFlashLoan(
    address[] memory,
    uint256[] memory amounts,
    uint256[] memory feeAmounts,
    bytes memory userData
  ) external override {
    require(msg.sender == BALANCER_VAULT, "unauthorized");
    (address baseToken, address fxUSD, uint256[] memory routesA, uint256[] memory routesB) = abi.decode(
      userData,
      (address, address, uint256[], uint256[])
    );

    uint256 amountIn = amounts[0]; // amount of WETH
    IERC20(WETH).transfer(CONVERTER, amountIn);
    amountIn = _swap(amountIn, routesA); // amount of base token
    IERC20(baseToken).approve(fxUSD, 0);
    IERC20(baseToken).approve(fxUSD, amountIn);
    amountIn = IFxUSD(fxUSD).mint(baseToken, amountIn, CONVERTER, 0); // amount of fxUSD
    amountIn = _swap(amountIn, routesB); // amount of WETH
    IERC20(WETH).transfer(BALANCER_VAULT, amounts[0] + feeAmounts[0]);
  }

  /**********************
   * Internal Functions *
   **********************/

  function _swap(uint256 amountIn, uint256[] memory routes) internal returns (uint256) {
    uint256 length = routes.length;
    if (length == 0) return amountIn; // this won't happen
    for (uint256 i = 0; i < length; i++) {
      address recipient = i < length - 1 ? CONVERTER : address(this);
      amountIn = ITokenConverter(CONVERTER).convert(routes[i], amountIn, recipient);
    }
    return amountIn;
  }
}
