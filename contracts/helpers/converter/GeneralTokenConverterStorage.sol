// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

import { ConverterBase } from "./ConverterBase.sol";

abstract contract GeneralTokenConverterStorage is Ownable, ConverterBase {
  using SafeERC20 for IERC20;

  /*************
   * Variables *
   *************/

  /// @notice The mask of supported pool types.
  /// @dev If the `i`-th bit is `1`, the `i`-th pool type is supported in this contract.
  uint256 public supportedPoolTypes;

  /// @notice Mapping from token address to token minter.
  /// @dev It is used to determine the pool address for lp token address.
  mapping(address => address) public tokenMinter;

  /// @dev Execution context used in fallback function.
  uint256 internal context;

  /****************************
   * Public Mutated Functions *
   ****************************/

  // solhint-disable-next-line no-complex-fallback
  fallback() external payable {
    uint256 _context = context;
    if (address(_context) == _msgSender() || _context == 1) {
      // handle uniswap v3 swap callback or uniswap v3 quote callback
      // | 4 bytes |   32 bytes   |   32 bytes   |   32 bytes  |   32 bytes  | 32 bytes |
      // |   sig   | amount0Delta | amount1Delta | data.offset | data.length |  tokenIn |
      int256 amount0Delta;
      int256 amount1Delta;
      address tokenIn;
      assembly {
        amount0Delta := calldataload(4)
        amount1Delta := calldataload(36)
        tokenIn := calldataload(132)
      }
      (uint256 amountToPay, uint256 amountReceived) = amount0Delta > 0
        ? (uint256(amount0Delta), uint256(-amount1Delta))
        : (uint256(amount1Delta), uint256(-amount0Delta));
      if (_context == 1) {
        assembly {
          let ptr := mload(0x40)
          mstore(ptr, amountReceived)
          revert(ptr, 32)
        }
      } else {
        IERC20(tokenIn).safeTransfer(address(_context), amountToPay);
      }
    } else {
      revert("invalid call");
    }
  }

  /*******************************
   * Public Restricted Functions *
   *******************************/

  /// @notice Update the pool types supported by this contract by default.
  /// @param _supportedPoolTypes The mask of pool types supported.
  function updateSupportedPoolTypes(uint256 _supportedPoolTypes) external onlyOwner {
    supportedPoolTypes = _supportedPoolTypes;
  }

  /// @notice Update the token minter mapping.
  /// @param _tokens The address list of tokens to update.
  /// @param _minters The address list of corresponding minters.
  function updateTokenMinter(address[] memory _tokens, address[] memory _minters) external onlyOwner {
    for (uint256 i = 0; i < _tokens.length; i++) {
      tokenMinter[_tokens[i]] = _minters[i];
    }
  }
}
