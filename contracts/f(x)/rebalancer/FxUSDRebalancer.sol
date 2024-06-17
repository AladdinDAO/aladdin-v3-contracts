// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import { AccessControl } from "@openzeppelin/contracts-v4/access/AccessControl.sol";
import { IERC20 } from "@openzeppelin/contracts-v4/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts-v4/token/ERC20/utils/SafeERC20.sol";
import { Address } from "@openzeppelin/contracts-v4/utils/Address.sol";

import { IFxRebalancePool } from "../../interfaces/f(x)/IFxRebalancePool.sol";

contract FxUSDRebalancer is AccessControl {
  using SafeERC20 for IERC20;

  /**********
   * Events *
   **********/

  /// @notice Emitted when the bonus amount is updated.
  /// @param oldBonus The value of previous bonus.
  /// @param newBonus The value of current bonus.
  event UpdateBonus(uint256 oldBonus, uint256 newBonus);

  /*************
   * Constants *
   *************/

  /// @notice The role for rebalance pool contract.
  bytes32 public constant REBALANCE_POOL_ROLE = keccak256("REBALANCE_POOL_ROLE");

  /// @notice The address of the bonus token.
  address public immutable bonusToken;

  /*************
   * Variables *
   *************/

  /// @notice The amount of bonus token each call to `liquidate`.
  uint256 public bonus;

  /***************
   * Constructor *
   ***************/

  constructor(address _bonusToken) {
    bonusToken = _bonusToken;

    _grantRole(DEFAULT_ADMIN_ROLE, _msgSender());
  }

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @notice Call liquidation for rebalance pool.
  /// @param _pool The address of rebalance pool.
  /// @param _minBaseOut The minimum amount of base token should liquidated.
  function liquidate(address _pool, uint256 _minBaseOut) external {
    _checkRole(REBALANCE_POOL_ROLE, _pool);

    IFxRebalancePool(_pool).liquidate(type(uint256).max, _minBaseOut);

    uint256 _balance = _getBalance(bonusToken);
    uint256 _bonus = bonus;
    if (_bonus > _balance) _bonus = _balance;
    if (_bonus > 0) {
      _transferToken(bonusToken, _msgSender(), _bonus);
    }
  }

  /************************
   * Restricted Functions *
   ************************/

  /// @notice Withdraw dust assets in this contract.
  /// @param _token The address of token to withdraw.
  /// @param _recipient The address of token receiver.
  function withdrawFund(address _token, address _recipient) external onlyRole(DEFAULT_ADMIN_ROLE) {
    _transferToken(_token, _recipient, _getBalance(_token));
  }

  /// @notice Update the bonus amount.
  /// @param _newBonus The new bonus amount.
  function updateBonus(uint256 _newBonus) external onlyRole(DEFAULT_ADMIN_ROLE) {
    uint256 _oldBonus = bonus;
    bonus = _newBonus;

    emit UpdateBonus(_oldBonus, _newBonus);
  }

  /**********************
   * Internal Functions *
   **********************/

  /// @dev Internal function to return the balance of the token in this contract.
  /// @param _token The address of token to query.
  function _getBalance(address _token) internal view returns (uint256) {
    if (_token == address(0)) {
      return address(this).balance;
    } else {
      return IERC20(_token).balanceOf(address(this));
    }
  }

  /// @dev Internal function to transfer ETH or ERC20 tokens to some `_receiver`.
  ///
  /// @param _token The address of token to transfer, user `_token=address(0)` if transfer ETH.
  /// @param _receiver The address of token receiver.
  /// @param _amount The amount of token to transfer.
  function _transferToken(
    address _token,
    address _receiver,
    uint256 _amount
  ) internal {
    if (_token == address(0)) {
      Address.sendValue(payable(_receiver), _amount);
    } else {
      IERC20(_token).safeTransfer(_receiver, _amount);
    }
  }
}
