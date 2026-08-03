// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

import { ITokenConverter } from "./ITokenConverter.sol";
import { ConverterBase } from "./ConverterBase.sol";

/// @title EmergencyConverter
/// @notice A converter that converts tokens to the same token.
/// @dev This converter is used to convert tokens to the same token in case of emergency.
contract EmergencyConverter is ConverterBase {
  using SafeERC20 for IERC20;

  constructor(address _registry) ConverterBase(_registry) {}

  function getTokenPair(uint256 _encoding) public pure override returns (address _tokenIn, address _tokenOut) {
    require(_getPoolType(_encoding) == 15, "unsupported poolType");
    address _pool = _getPool(_encoding);

    _tokenIn = _pool;
    _tokenOut = _pool;
  }

  function queryConvert(uint256 _encoding, uint256 _amountIn) external view override returns (uint256 _amountOut) {
    _amountOut = _amountIn;
  }

  function convert(
    uint256 _encoding,
    uint256 _amountIn,
    address _recipient
  ) external payable override returns (uint256 _amountOut) {
    (address _tokenIn, ) = getTokenPair(_encoding);

    IERC20(_tokenIn).safeTransfer(_recipient, _amountIn);

    _amountOut = 0;
  }
}
