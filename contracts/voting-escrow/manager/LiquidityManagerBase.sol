// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { Ownable2Step } from "@openzeppelin/contracts-v4/access/Ownable2Step.sol";

import { ILiquidityManager } from "../interfaces/ILiquidityManager.sol";

abstract contract LiquidityManagerBase is Ownable2Step, ILiquidityManager {
  /**********
   * Errors *
   **********/

  /// @dev Thrown when try to kill the manager more than once.
  error AlreadyKilled();

  /// @dev Thrown when the call is not operator.
  error CallerIsNotOperator();

  /*************
   * Constants *
   *************/

  /// @notice The address of operator.
  address public immutable operator;

  /// @notice The address of managed token.
  address public immutable token;

  /*************
   * Variables *
   *************/

  /// @inheritdoc ILiquidityManager
  bool public override isActive;

  /*************
   * Modifiers *
   *************/

  modifier onlyOperator() {
    if (_msgSender() != operator) {
      revert CallerIsNotOperator();
    }
    _;
  }

  /***************
   * Constructor *
   ***************/

  constructor(address _operator, address _token) {
    operator = _operator;
    token = _token;
  }

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @inheritdoc ILiquidityManager
  function deposit(address _receiver, uint256 _amount) external onlyOperator {
    _deposit(_receiver, _amount);
  }

  /// @inheritdoc ILiquidityManager
  function withdraw(address _receiver, uint256 _amount) external onlyOperator {
    _withdraw(_receiver, _amount);
  }

  /// @inheritdoc ILiquidityManager
  function execute(
    address _to,
    uint256 _value,
    bytes calldata _data
  ) external payable returns (bool, bytes memory) {
    // solhint-disable-next-line avoid-low-level-calls
    (bool success, bytes memory result) = _to.call{ value: _value }(_data);
    return (success, result);
  }

  /************************
   * Restricted Functions *
   ************************/

  /// @notice Kill the liquidity manager and withdraw all token back to operator.
  function kill() external onlyOwner {
    if (!isActive) {
      revert AlreadyKilled();
    }
    isActive = false;

    uint256 _balance = _managedBalance();
    _withdraw(operator, _balance);
  }

  /**********************
   * Internal Functions *
   **********************/

  /// @dev Internal function to return all managed tokens.
  function _managedBalance() internal view virtual returns (uint256);

  /// @dev Internal function to deposit token.
  ///
  /// @param _receiver The address of recipient who will receive the share.
  /// @param _amount The amount of token to deposit.
  function _deposit(address _receiver, uint256 _amount) internal virtual;

  /// @dev Internal function to withdraw token.
  ///
  /// @param _receiver The address of recipient who will receive the token.
  /// @param _amount The amount of token to withdraw.
  function _withdraw(address _receiver, uint256 _amount) internal virtual;
}
