// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;
pragma abicoder v2;

import { AccessControl } from "@openzeppelin/contracts/access/AccessControl.sol";
import { SafeMath } from "@openzeppelin/contracts/math/SafeMath.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

import { IFxReservePool } from "../../interfaces/f(x)/IFxReservePool.sol";

contract ReservePool is AccessControl, IFxReservePool {
  using SafeERC20 for IERC20;
  using SafeMath for uint256;

  /**********
   * Events *
   **********/

  event RequestBonus(address indexed token, address indexed recipient, uint256 originalAmount, uint256 bonus);

  /*************
   * Constants *
   *************/

  /// @dev The precison use to calculation.
  uint256 private constant PRECISION = 1e18;

  /// @notice The address of market contract.
  address public immutable market;

  /// @notice The address of fToken.
  address public immutable fToken;

  /***********
   * Structs *
   ***********/

  struct ZapInCall {
    address src;
    uint256 amount;
    address target;
    bytes data;
  }

  /*************
   * Variables *
   *************/

  mapping(address => uint256) public bonusRatio;

  /************
   * Modifier *
   ************/

  modifier onlyAdmin() {
    require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "only admin");
    _;
  }

  /***************
   * Constructor *
   ***************/

  constructor(address _market, address _fToken) {
    market = _market;
    fToken = _fToken;

    _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
  }

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @inheritdoc IFxReservePool
  function requestBonus(
    address _token,
    address _recipient,
    uint256 _originalAmount
  ) external override returns (uint256) {
    require(msg.sender == market, "only market");

    uint256 _bonus = _originalAmount.mul(bonusRatio[_token]).div(PRECISION);
    uint256 _balance = _getBalance(_token);

    if (_bonus > _balance) {
      _bonus = _balance;
    }
    if (_bonus > 0) {
      _transferToken(_token, _recipient, _bonus);

      emit RequestBonus(_token, _recipient, _originalAmount, _bonus);
    }

    return _bonus;
  }

  /*******************************
   * Public Restricted Functions *
   *******************************/

  function updateBonusRatio(address _token, uint256 _ratio) external onlyAdmin {
    bonusRatio[_token] = _ratio;
  }

  /// @notice Withdraw dust assets in this contract.
  /// @param _token The address of token to withdraw.
  /// @param _recipient The address of token receiver.
  function withdrawFund(address _token, address _recipient) external onlyAdmin {
    _transferToken(_token, _recipient, _getBalance(_token));
  }

  /**********************
   * Internal Functions *
   **********************/

  function _getBalance(address _token) internal view returns (uint256) {
    if (_token == address(0)) {
      return address(this).balance;
    } else {
      return IERC20(_token).balanceOf(address(this));
    }
  }

  function _transferToken(
    address _token,
    address _recipient,
    uint256 _amount
  ) internal {
    if (_token == address(0)) {
      (bool success, ) = _recipient.call{ value: _amount }("");
      require(success, "withdraw ETH failed");
    } else {
      IERC20(_token).safeTransfer(_recipient, _amount);
    }
  }
}
