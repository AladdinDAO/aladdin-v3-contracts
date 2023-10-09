// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

import { IWETH } from "../../interfaces/IWETH.sol";
import { ITokenConverter } from "./ITokenConverter.sol";

abstract contract ConverterBase is ITokenConverter {
  using SafeERC20 for IERC20;

  /*************
   * Constants *
   *************/

  /// @inheritdoc ITokenConverter
  address public immutable override registry;

  /// @dev The address of ETH which is commonly used.
  address internal constant ETH = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

  /// @dev The address of WETH token.
  address internal constant WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;

  /***************
   * Constructor *
   ***************/

  constructor(address _registry) {
    registry = _registry;
  }

  /****************************
   * Public Mutated Functions *
   ****************************/

  // solhint-disable-next-line no-empty-blocks
  receive() external payable {}

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @inheritdoc ITokenConverter
  function withdrawFund(address _token, address _recipient) external override {
    require(msg.sender == registry, "only registry");

    if (_token == address(0)) {
      (bool success, ) = _recipient.call{ value: address(this).balance }("");
      require(success, "withdraw ETH failed");
    } else {
      IERC20(_token).safeTransfer(_recipient, IERC20(_token).balanceOf(address(this)));
    }
  }

  /**********************
   * Internal Functions *
   **********************/

  /// @dev Internal function to get the pool type of the route.
  /// @param encoding The route encoding.
  function _getPoolType(uint256 encoding) internal pure returns (uint256) {
    return encoding & 255;
  }

  /// @dev Internal function to get the action of the route.
  /// @param encoding The route encoding.
  function _getAction(uint256 encoding) internal pure returns (uint256) {
    return (encoding >> 8) & 3;
  }

  function _isETH(address _token) internal pure returns (bool) {
    return _token == ETH || _token == address(0);
  }

  function _wrapTokenIfNeeded(address _token, uint256 _amount) internal {
    if (_token == WETH && IERC20(_token).balanceOf(address(this)) < _amount) {
      IWETH(_token).deposit{ value: _amount }();
    }
  }

  function _unwrapIfNeeded(uint256 _amount) internal {
    if (address(this).balance < _amount) {
      IWETH(WETH).withdraw(_amount);
    }
  }

  function _approve(
    address _token,
    address _spender,
    uint256 _amount
  ) internal {
    if (!_isETH(_token) && IERC20(_token).allowance(address(this), _spender) < _amount) {
      // hBTC cannot approve 0
      if (_token != 0x0316EB71485b0Ab14103307bf65a021042c6d380) {
        IERC20(_token).safeApprove(_spender, 0);
      }
      IERC20(_token).safeApprove(_spender, uint256(-1));
    }
  }
}
