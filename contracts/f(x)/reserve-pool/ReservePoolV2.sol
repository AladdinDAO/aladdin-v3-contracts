// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;
pragma abicoder v2;

import { AccessControl } from "@openzeppelin/contracts-v4/access/AccessControl.sol";
import { IERC20 } from "@openzeppelin/contracts-v4/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts-v4/token/ERC20/utils/SafeERC20.sol";
import { Address } from "@openzeppelin/contracts-v4/utils/Address.sol";

import { IFxReservePool } from "../../interfaces/f(x)/IFxReservePool.sol";

contract ReservePoolV2 is AccessControl, IFxReservePool {
  using SafeERC20 for IERC20;

  /**********
   * Events *
   **********/

  /// @notice Emitted when the bonus ratio is updated.
  /// @param token The address of the token updated.
  /// @param oldRatio The value of previous bonus ratio, multiplied by 1e18.
  /// @param newRatio The value of current bonus ratio, multiplied by 1e18.
  event UpdateBonusRatio(address indexed token, uint256 oldRatio, uint256 newRatio);

  /// @notice Emitted when the market request bonus.
  /// @param market The address of market contract.
  /// @param token The address of the token requested.
  /// @param receiver The address of token receiver.
  /// @param originalAmount The amount used to compute bonus.
  /// @param bonus The amount of bonus token.
  event RequestBonus(
    address indexed market,
    address indexed token,
    address indexed receiver,
    uint256 originalAmount,
    uint256 bonus
  );

  /**********
   * Errors *
   **********/

  /// @dev Thrown the bonus ratio is too large.
  error ErrorRatioTooLarge();

  /*************
   * Constants *
   *************/

  /// @notice The role for market contract.
  bytes32 public constant MARKET_ROLE = keccak256("MARKET_ROLE");

  /// @dev The precison use to calculation.
  uint256 private constant PRECISION = 1e18;

  /*************
   * Variables *
   *************/

  /// @notice Mapping from token address to bonus ratio.
  mapping(address => uint256) public bonusRatio;

  /***************
   * Constructor *
   ***************/

  constructor() {
    _grantRole(DEFAULT_ADMIN_ROLE, _msgSender());
  }

  /****************************
   * Public Mutated Functions *
   ****************************/

  // solhint-disable-next-line no-empty-blocks
  receive() external payable {}

  /// @inheritdoc IFxReservePool
  function requestBonus(
    address _token,
    address _recipient,
    uint256 _originalAmount
  ) external override onlyRole(MARKET_ROLE) returns (uint256) {
    uint256 _bonus = (_originalAmount * bonusRatio[_token]) / PRECISION;
    uint256 _balance = _getBalance(_token);

    if (_bonus > _balance) {
      _bonus = _balance;
    }
    if (_bonus > 0) {
      _transferToken(_token, _recipient, _bonus);

      emit RequestBonus(_msgSender(), _token, _recipient, _originalAmount, _bonus);
    }

    return _bonus;
  }

  /************************
   * Restricted Functions *
   ************************/

  /// @notice Update the bonus ratio for the token.
  /// @param _token The address of the token.
  /// @param _newRatio The new ratio, multiplied by 1e18.
  function updateBonusRatio(address _token, uint256 _newRatio) external onlyRole(DEFAULT_ADMIN_ROLE) {
    if (_newRatio > PRECISION) revert ErrorRatioTooLarge();

    uint256 _oldRatio = bonusRatio[_token];
    bonusRatio[_token] = _newRatio;

    emit UpdateBonusRatio(_token, _oldRatio, _newRatio);
  }

  /// @notice Withdraw dust assets in this contract.
  /// @param _token The address of token to withdraw.
  /// @param _recipient The address of token receiver.
  function withdrawFund(address _token, address _recipient) external onlyRole(DEFAULT_ADMIN_ROLE) {
    _transferToken(_token, _recipient, _getBalance(_token));
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
