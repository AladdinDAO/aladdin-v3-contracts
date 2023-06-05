// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

import { IWETH } from "../interfaces/IWETH.sol";
import { IMarket } from "./interfaces/IMarket.sol";

contract ETHGateway {
  using SafeERC20 for IERC20;

  /*************
   * Constants *
   *************/

  /// @notice The address of WETH.
  address public immutable weth;

  /// @notice The address of Fractional ETH.
  address public immutable fToken;

  /// @notice The address of Leveraged ETH.
  address public immutable xToken;

  /// @notice The address of Market.
  address public immutable market;

  /************
   * Modifier *
   ************/

  constructor(
    address _market,
    address _weth,
    address _fToken,
    address _xToken
  ) {
    market = _market;
    weth = _weth;
    fToken = _fToken;
    xToken = _xToken;

    IERC20(_weth).safeApprove(_market, uint256(-1));
    IERC20(_fToken).safeApprove(_market, uint256(-1));
    IERC20(_xToken).safeApprove(_market, uint256(-1));
  }

  receive() external payable {
    require(msg.sender == weth, "only WETH");
  }

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @notice Mint some fToken with some ETH.
  /// @param _minFTokenMinted The minimum amount of fToken should be received.
  /// @return _fTokenMinted The amount of fToken should be received.
  function mintFToken(uint256 _minFTokenMinted) external payable returns (uint256 _fTokenMinted) {
    IWETH(weth).deposit{ value: msg.value }();

    _fTokenMinted = IMarket(market).mintFToken(msg.value, msg.sender, _minFTokenMinted);

    _refund(weth, msg.sender);
  }

  /// @notice Mint some xToken with some ETH.
  /// @param _minXTokenMinted The minimum amount of xToken should be received.
  /// @return _xTokenMinted The amount of xToken should be received.
  function mintXToken(uint256 _minXTokenMinted) external payable returns (uint256 _xTokenMinted) {
    IWETH(weth).deposit{ value: msg.value }();

    _xTokenMinted = IMarket(market).mintXToken(msg.value, msg.sender, _minXTokenMinted);

    _refund(weth, msg.sender);
  }

  /// @notice Mint some xToken by add some ETH as collateral.
  /// @param _minXTokenMinted The minimum amount of xToken should be received.
  /// @return _xTokenMinted The amount of xToken should be received.
  function addBaseToken(uint256 _minXTokenMinted) external payable returns (uint256 _xTokenMinted) {
    IWETH(weth).deposit{ value: msg.value }();

    _xTokenMinted = IMarket(market).addBaseToken(msg.value, msg.sender, _minXTokenMinted);

    _refund(weth, msg.sender);
  }

  /// @notice Redeem ETH with fToken and xToken.
  /// @param _fTokenIn the amount of fToken to redeem.
  /// @param _xTokenIn the amount of xToken to redeem.
  /// @param _minBaseOut The minimum amount of base token should be received.
  /// @return _baseOut The amount of base token should be received.
  function redeem(
    uint256 _fTokenIn,
    uint256 _xTokenIn,
    uint256 _minBaseOut
  ) external returns (uint256 _baseOut) {
    if (_fTokenIn > 0) {
      _fTokenIn = _transferTokenIn(fToken, _fTokenIn);
      _xTokenIn = 0;
    } else {
      _xTokenIn = _transferTokenIn(xToken, _xTokenIn);
    }

    _baseOut = IMarket(market).redeem(_fTokenIn, _xTokenIn, address(this), _minBaseOut);

    if (_fTokenIn > 0) {
      _refund(fToken, msg.sender);
    }
    if (_xTokenIn > 0) {
      _refund(xToken, msg.sender);
    }
    _transferETH(_baseOut, msg.sender);
  }

  /// @notice Permissionless liquidate some fToken to increase the collateral ratio.
  /// @param _fTokenIn the amount of fToken to supply.
  /// @param _minBaseOut The minimum amount of base token should be received.
  /// @return _baseOut The amount of base token should be received.
  function liquidate(uint256 _fTokenIn, uint256 _minBaseOut) external returns (uint256 _baseOut) {
    _fTokenIn = _transferTokenIn(fToken, _fTokenIn);

    _baseOut = IMarket(market).liquidate(_fTokenIn, address(this), _minBaseOut);

    _refund(fToken, msg.sender);
    _transferETH(_baseOut, msg.sender);
  }

  /**********************
   * Internal Functions *
   **********************/

  /// @dev Internal function to transfer token to this contract.
  /// @param _token The address of token to transfer.
  /// @param _amount The amount of token to transfer.
  /// @return uint256 The amount of token transfered.
  function _transferTokenIn(address _token, uint256 _amount) internal returns (uint256) {
    if (_amount == uint256(-1)) {
      _amount = IERC20(_token).balanceOf(msg.sender);
    }

    if (_amount > 0) {
      IERC20(_token).safeTransferFrom(msg.sender, address(this), _amount);
    }

    return _amount;
  }

  /// @dev Internal function to refund extra token.
  /// @param _token The address of token to refund.
  /// @param _recipient The address of the token receiver.
  function _refund(address _token, address _recipient) internal {
    uint256 _balance = IERC20(_token).balanceOf(address(this));

    if (_balance > 0) {
      if (_token == weth) {
        _transferETH(_balance, _recipient);
      } else {
        IERC20(_token).safeTransfer(_recipient, _balance);
      }
    }
  }

  /// @dev Internal function to withdraw WETH and transfer ETH.
  /// @param _amount The amount of ETH to transfer.
  /// @param _recipient The address of the ETH receiver.
  function _transferETH(uint256 _amount, address _recipient) internal {
    IWETH(weth).withdraw(_amount);

    (bool _success, ) = _recipient.call{ value: _amount }("");
    require(_success, "transfer ETH failed");
  }
}
