// SPDX-License-Identifier: MIT

pragma solidity ^0.7.0 || ^0.8.0;

interface IVesting {
  /**********
   * Events *
   **********/

  /// @notice Emitted when a token vest is added.
  /// @param _recipient The address of recipient who will receive the vest.
  /// @param _index The index of the vesting list.
  /// @param _amount The amount of token to vest.
  /// @param _startTime The timestamp in second when the vest starts.
  /// @param _endTime The timestamp in second when the vest ends.
  event Vest(address indexed _recipient, uint256 indexed _index, uint256 _amount, uint256 _startTime, uint256 _endTime);

  /// @notice Emitted when a vest is canceld.
  /// @param _recipient The address of recipient who will receive the vest.
  /// @param _index The index of the vesting list.
  /// @param _unvested The amount of unvested token.
  /// @param _cancelTime The timestamp in second when the vest is canceld.
  event Cancel(address indexed _recipient, uint256 indexed _index, uint256 _unvested, uint256 _cancelTime);

  /// @notice Emitted when a user claim his vest.
  /// @param _recipient The address of recipient who will receive the token.
  /// @param _amount The amount of token claimed.
  event Claim(address indexed _recipient, uint256 _amount);

  /*************************
   * Public View Functions *
   *************************/

  /// @notice Return the total amount of vested tokens.
  /// @param _recipient The address of user to query.
  function vested(address _recipient) external view returns (uint256 _vested);

  /// @notice Return the total amount of unvested tokens.
  /// @param _recipient The address of user to query.
  function locked(address _recipient) external view returns (uint256 _unvested);

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @notice Claim pending tokens
  /// @return _claimable The amount of token will receive in this claim.
  function claim() external returns (uint256 _claimable);

  /// @notice Add a new token vesting
  /// @param _recipient The address of user who will receive the vesting.
  /// @param _amount The amount of token to vest.
  /// @param _startTime The timestamp in second when the vest starts.
  /// @param _endTime The timestamp in second when the vest ends.
  function newVesting(
    address _recipient,
    uint96 _amount,
    uint32 _startTime,
    uint32 _endTime
  ) external;

  /// @notice Cancel a vest for some user. The unvested tokens will be transfered to owner.
  /// @param _user The address of the user to cancel.
  /// @param _index The index of the vest to cancel.
  function cancel(address _user, uint256 _index) external;
}
