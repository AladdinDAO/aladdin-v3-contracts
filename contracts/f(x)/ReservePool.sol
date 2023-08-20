// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;
pragma abicoder v2;

import { AccessControl } from "@openzeppelin/contracts/access/AccessControl.sol";
import { SafeMath } from "@openzeppelin/contracts/math/SafeMath.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

import { IReservePool } from "./interfaces/IReservePool.sol";
import { IMarket } from "./interfaces/IMarket.sol";

contract ReservePool is AccessControl, IReservePool {
  using SafeERC20 for IERC20;
  using SafeMath for uint256;

  event RequestBonus(address indexed token, address indexed recipient, uint256 originalAmount, uint256 bonus);

  /// @dev The precison use to calculation.
  uint256 private constant PRECISION = 1e18;

  bytes32 public constant LIQUIDATOR_ROLE = keccak256("LIQUIDATOR_ROLE");

  address public immutable market;

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

  mapping(address => uint256) public bonusRatio;

  constructor(address _market, address _fToken) {
    market = _market;
    fToken = _fToken;

    _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
  }

  /// @inheritdoc IReservePool
  function requestBonus(
    address _token,
    address _recipient,
    uint256 _originalAmount
  ) external override {
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
  }

  function liquidate(ZapInCall memory _call, uint256 _minBaseOut) external returns (uint256 _baseOut) {
    require(hasRole(LIQUIDATOR_ROLE, msg.sender), "only liquidator");

    bool _success;
    if (_call.src == address(0)) {
      (_success, ) = _call.target.call{ value: _call.amount }(_call.data);
    } else {
      IERC20(_call.src).safeApprove(_call.target, 0);
      IERC20(_call.src).safeApprove(_call.target, _call.amount);
      (_success, ) = _call.target.call(_call.data);
    }

    // below lines will propagate inner error up
    if (!_success) {
      // solhint-disable-next-line no-inline-assembly
      assembly {
        let ptr := mload(0x40)
        let size := returndatasize()
        returndatacopy(ptr, 0, size)
        revert(ptr, size)
      }
    }

    uint256 _fTokenIn = IERC20(fToken).balanceOf(address(this));
    IERC20(fToken).safeApprove(market, 0);
    IERC20(fToken).safeApprove(market, _fTokenIn);
    _baseOut = IMarket(market).liquidate(_fTokenIn, address(this), _minBaseOut);

    // make sure all fToken is used to prevent liquidator steal fund.
    require(IERC20(fToken).balanceOf(address(this)) == 0, "has dust fToken");
  }

  /// @notice Withdraw dust assets in this contract.
  /// @param _token The address of token to withdraw.
  /// @param _recipient The address of token receiver.
  function withdrawFund(address _token, address _recipient) external {
    require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "only admin");

    _transferToken(_token, _recipient, _getBalance(_token));
  }

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
