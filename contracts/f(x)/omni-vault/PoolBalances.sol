// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.25;

import { SafeERC20Upgradeable } from "@openzeppelin/contracts-upgradeable-v4/token/ERC20/utils/SafeERC20Upgradeable.sol";
import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable-v4/token/ERC20/IERC20Upgradeable.sol";

import { IFxBasePool } from "../../interfaces/f(x)/omni-vault/IFxBasePool.sol";
import { IFxInternalToken } from "../../interfaces/f(x)/omni-vault/IFxInternalToken.sol";
import { IFxOmniVault } from "../../interfaces/f(x)/omni-vault/IFxOmniVault.sol";

import { WordCodec } from "../../common/codec/WordCodec.sol";
import { PoolManagers } from "./PoolManagers.sol";

abstract contract PoolBalances is PoolManagers {
  using SafeERC20Upgradeable for IERC20Upgradeable;
  using WordCodec for bytes32;

  /**********
   * Errors *
   **********/

  error ErrorOverflow();

  /*************
   * Constants *
   *************/

  uint256 private constant MAX_BALANCE = type(uint112).max;

  /***********
   * Structs *
   ***********/

  struct FxPoolBalance {
    // | total cash |  managed | last block |
    // |  112 bits  | 112 bits |  32  bits  |
    bytes32 baseBalance;
    // | f supply | x supply | last block |
    // | 112 bits | 112 bits |  32  bits  |
    bytes32 fxBalance;
  }

  /*************
   * Variables *
   *************/

  /// @dev Mapping from pool address to `FxPoolBalance` state.
  mapping(address => FxPoolBalance) private poolToBalances;

  /// @dev Whether the token is internal token (fractional token, leveraged token or fxUSD)
  mapping(address => bool) internal isInternalToken;

  /// @dev Slots for future use.
  uint256[48] private _gap;

  /*************
   * Modifiers *
   *************/

  modifier onlyValidPool(address pool) {
    _checkPoolValid(pool);
    _;
  }

  /***************
   * Constructor *
   ***************/

  function __PoolBalances_init() internal onlyInitializing {}

  /*************************
   * Public View Functions *
   *************************/

  /// @inheritdoc IFxOmniVault
  function getPoolTokens(address pool) external view returns (address[] memory tokens) {
    tokens = new address[](3);
    tokens[0] = IFxBasePool(pool).getBaseToken();
    tokens[1] = IFxBasePool(pool).getFractionalToken();
    tokens[2] = IFxBasePool(pool).getLeveragedToken();
  }

  /// @inheritdoc IFxOmniVault
  function getPoolBalances(address pool) public view returns (uint256[] memory balances) {
    balances = new uint256[](3);
    (balances[0], balances[1], balances[2]) = _getBaseBalanceAndFxSupply(pool);
  }

  /************************
   * Restricted Functions *
   ************************/

  function registerPool(address pool) external onlyRole(DEFAULT_ADMIN_ROLE) {
    if (_isValidPool(pool)) revert();

    bytes32 cachedBaseBalance = poolToBalances[pool].baseBalance;
    bytes32 cachedFxBalance = poolToBalances[pool].fxBalance;
    poolToBalances[pool].baseBalance = cachedBaseBalance.insertUint(block.number, 224, 32);
    poolToBalances[pool].fxBalance = cachedFxBalance.insertUint(block.number, 224, 32);

    isInternalToken[IFxBasePool(pool).getFractionalToken()] = true;
    isInternalToken[IFxBasePool(pool).getLeveragedToken()] = true;
  }

  /**********************
   * Internal Functions *
   **********************/

  function _checkPoolValid(address pool) internal view {
    if (!_isValidPool(pool)) revert();
  }

  function _isValidPool(address pool) internal view returns (bool) {
    return poolToBalances[pool].baseBalance != bytes32(0);
  }

  function _getBaseBalanceAndFxSupply(address pool)
    internal
    view
    returns (
      uint256 baseBalance,
      uint256 fSupply,
      uint256 xSupply
    )
  {
    bytes32 cachedBaseBalance = poolToBalances[pool].baseBalance;
    unchecked {
      baseBalance = cachedBaseBalance.decodeUint(0, 112) + cachedBaseBalance.decodeUint(112, 112);
    }
    bytes32 cachedFxBalance = poolToBalances[pool].fxBalance;
    fSupply = cachedFxBalance.decodeUint(0, 112);
    xSupply = cachedFxBalance.decodeUint(112, 112);
  }

  function _transferTokenIn(
    address tokenIn,
    address sender,
    uint256 amountIn
  ) internal {
    if (isInternalToken[tokenIn]) {
      IFxInternalToken(tokenIn).burn(sender, amountIn);
    } else {
      IERC20Upgradeable(tokenIn).safeTransferFrom(sender, address(this), amountIn);
    }
  }

  function _transferTokenOut(
    address tokenOut,
    address recipient,
    uint256 amountOut
  ) internal {
    if (isInternalToken[tokenOut]) {
      IFxInternalToken(tokenOut).mint(recipient, amountOut);
    } else {
      IERC20Upgradeable(tokenOut).transfer(recipient, amountOut);
    }
  }

  function _changeBaseBalance(address pool, int256 delta) internal {
    bytes32 cachedBaseBalance = poolToBalances[pool].baseBalance;
    uint256 totalCash = cachedBaseBalance.decodeUint(0, 112);
    if (delta > 0) totalCash += uint256(delta);
    else totalCash -= uint256(-delta);

    if (totalCash > MAX_BALANCE) revert ErrorOverflow();
    cachedBaseBalance = cachedBaseBalance.insertUint(block.number, 224, 32);
    poolToBalances[pool].baseBalance = cachedBaseBalance.insertUint(totalCash, 0, 112);
  }

  function _changeFractionalSupply(address pool, int256 delta) internal {
    bytes32 cachedBaseBalance = poolToBalances[pool].fxBalance;
    uint256 totalCash = cachedBaseBalance.decodeUint(0, 112);
    if (delta > 0) totalCash += uint256(delta);
    else totalCash -= uint256(-delta);

    if (totalCash > MAX_BALANCE) revert ErrorOverflow();
    cachedBaseBalance = cachedBaseBalance.insertUint(block.number, 224, 32);
    poolToBalances[pool].fxBalance = cachedBaseBalance.insertUint(totalCash, 0, 112);
  }

  function _changeLeveragedSupply(address pool, int256 delta) internal {
    bytes32 cachedBaseBalance = poolToBalances[pool].fxBalance;
    uint256 xSupply = cachedBaseBalance.decodeUint(112, 112);
    if (delta > 0) xSupply += uint256(delta);
    else xSupply -= uint256(-delta);

    if (xSupply > MAX_BALANCE) revert ErrorOverflow();
    cachedBaseBalance = cachedBaseBalance.insertUint(block.number, 224, 32);
    poolToBalances[pool].fxBalance = cachedBaseBalance.insertUint(xSupply, 0, 112);
  }
}
