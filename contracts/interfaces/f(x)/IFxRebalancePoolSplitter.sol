// SPDX-License-Identifier: MIT

pragma solidity ^0.7.0 || ^0.8.0;

interface IFxRebalancePoolSplitter {
  /**********
   * Events *
   **********/

  /// @notice Emitted when the address of splitter is updated.
  /// @param token The address of the token.
  /// @param oldSplitter The address of previous token splitter.
  /// @param newSplitter The address of current token splitter.
  event UpdateSplitter(address indexed token, address indexed oldSplitter, address indexed newSplitter);

  /// @notice Emitted when a new receiver is added.
  /// @param token The address of the token.
  /// @param receiver The address of the receiver.
  event RegisterReceiver(address indexed token, address indexed receiver);

  /// @notice Emitted when an exsited receiver is removed.
  /// @param token The address of the token.
  /// @param receiver The address of the receiver.
  event DeregisterReceiver(address indexed token, address indexed receiver);

  /// @notice Emitted when the split ratio is updated.
  /// @param token The address of the token.
  /// @param ratios The list of new split ratios.
  event UpdateSplitRatios(address indexed token, uint256[] ratios);

  /*************************
   * Public View Functions *
   *************************/

  /// @notice Return the splitter of the given token.
  /// @param token The address of token to query.
  function splitter(address token) external view returns (address);

  /// @notice Return the receivers and split ratios for the given token.
  /// @param token The address of token to query.
  /// @return receivers The address list of receivers.
  /// @return ratios The list of corresponding split ratio.
  function getReceivers(address token) external view returns (address[] memory receivers, uint256[] memory ratios);

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @notice Split token to different RebalancePool.
  /// @param token The address of token to split.
  function split(address token) external;
}
