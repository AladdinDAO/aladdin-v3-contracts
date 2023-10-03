// SPDX-License-Identifier: MIT

pragma solidity ^0.7.0 || ^0.8.0;

interface IConverterRegistry {
  /**********
   * Events *
   **********/

  /// @notice Emitted when the converter route is updated.
  /// @param src The address of source token.
  /// @param dst The address of destination token.
  /// @param routes The list of route encodings.
  event UpdateRoute(address indexed src, address indexed dst, uint256[] routes);

  /// @notice Emitted when the token converter is updated for some pool type.
  /// @param poolType The pool type updated.
  /// @param oldConverter The address of previous converter.
  /// @param newConverter The address of current converter.
  event UpdateConverter(uint256 indexed poolType, address indexed oldConverter, address indexed newConverter);

  /*************************
   * Public View Functions *
   *************************/

  /// @notice Return the routes used to convert source token to destination token.
  /// @param src The address of source token.
  /// @param dst The address of destination token.
  /// @return routes The list of route encodings.
  function getRoutes(address src, address dst) external view returns (uint256[] memory routes);

  /// @notice Return the input token and output token for the route.
  /// @param route The encoding of the route.
  /// @return tokenIn The address of input token.
  /// @return tokenOut The address of output token.
  function getTokenPair(uint256 route) external view returns (address tokenIn, address tokenOut);

  /// @notice Return the address of converter for a specific pool type.
  /// @param poolType The type of converter.
  /// @return converter The address of converter.
  function getConverter(uint256 poolType) external view returns (address converter);
}
