// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

import { IConverterRegistry } from "./IConverterRegistry.sol";
import { ITokenConverter } from "./ITokenConverter.sol";

contract ConverterRegistry is Ownable, IConverterRegistry {
  /*************
   * Variables *
   *************/

  /// @dev Mapping from pool type to the address of converter.
  mapping(uint256 => address) private converters;

  /// @dev Mapping from tokenIn to tokenOut to routes.
  /// @dev See {ITokenConverter-convert} for the meaning.
  mapping(address => mapping(address => uint256[])) private routes;

  /*************************
   * Public View Functions *
   *************************/

  /// @inheritdoc IConverterRegistry
  function getRoutes(address src, address dst) external view override returns (uint256[] memory) {
    return routes[src][dst];
  }

  /// @inheritdoc IConverterRegistry
  function getTokenPair(uint256 _route) external view override returns (address, address) {
    uint256 _poolType = _route & 255;
    return ITokenConverter(converters[_poolType]).getTokenPair(_route);
  }

  /// @inheritdoc IConverterRegistry
  function getConverter(uint256 _poolType) external view override returns (address) {
    return converters[_poolType];
  }

  /*******************************
   * Public Restricted Functions *
   *******************************/

  /// @notice Register a converter or update the converter.
  ///
  /// @param _poolType The pool type to update.
  /// @param _newConverter The address of converter to update.
  function register(uint256 _poolType, address _newConverter) external onlyOwner {
    address _oldConverter = converters[_poolType];
    converters[_poolType] = _newConverter;

    emit UpdateConverter(_poolType, _oldConverter, _newConverter);
  }

  /// @notice Update the routes for converting from source token to destination token.
  ///
  /// @param _src The address of source token.
  /// @param _dst The address of destination token.
  /// @param _routes The list of route encodings.
  function updateRoute(
    address _src,
    address _dst,
    uint256[] memory _routes
  ) external onlyOwner {
    delete routes[_src][_dst];

    routes[_src][_dst] = _routes;

    emit UpdateRoute(_src, _dst, _routes);
  }

  /// @notice Withdraw dust assets from a converter contract.
  /// @param _converter The address of converter contract.
  /// @param _token The address of token to withdraw.
  /// @param _recipient The address of token receiver.
  function withdrawFund(
    address _converter,
    address _token,
    address _recipient
  ) external onlyOwner {
    ITokenConverter(_converter).withdrawFund(_token, _recipient);
  }
}
