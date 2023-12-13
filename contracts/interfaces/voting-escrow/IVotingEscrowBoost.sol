// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

interface IVotingEscrowBoost {
  /**********
   * Errors *
   **********/

  /// @dev Thrown when deadline is expired in `permit`.
  error ExpiredDeadline();

  /// @dev Thrown when signature is invalid in `permit`.
  error InvalidSignature();

  /// @dev Thrown when zero address try to approve.
  error ApproveFromZeroAddress();

  /// @dev Thrown when approve to zero address.
  error ApproveToZeroAddress();

  /// @dev Thrown when decrease allowance below zero.
  error DecreasedAllowanceBelowZero();

  /// @dev Thrown when someone try to use more than allowance.
  error InsufficientAllowance();

  /// @dev Thrown when boost zero amount.
  error BoostZeroAmount();

  /// @dev Thrown when boost endtime before current timestamp.
  error EndTimeSmallerThanCurrentTimestamp();

  /// @dev Thrown when boost endtime is not multiple of week.
  error EndTimeNotAlignedWithWeek();

  /// @dev Thrown when boost endtime exceed lock end.
  error EndTimeExceedLockEnd();

  /// @dev Thrown when boost more than current delegable balance.
  error BoostExceedBalance();

  /// @dev Thrown when unboost a non-existed boost.
  error IndexOutOfBound();

  /// @dev Thrown when cancel more than boosted.
  error CancelBoostExceedBalance();

  /// @dev Thrown when cancel expired boost.
  error CancelExpiredBoost();

  /**********
   * Events *
   **********/

  /// @notice Emitted when `value` tokens are moved from one account (`from`) to
  /// another (`to`).
  ///
  /// Note that `value` may be zero.
  event Transfer(address indexed from, address indexed to, uint256 value);

  /// @notice Emitted when the allowance of a `spender` for an `owner` is set by
  /// a call to {approve}. `value` is the new allowance.
  event Approval(address indexed owner, address indexed spender, uint256 value);

  /// @notice Emitted when the owner delegates ve balance to another user.
  /// @param owner The address of ve balance owner.
  /// @param receiver The address of ve balance recipient.
  /// @param bias The bias value at timestamp `start`.
  /// @param slope The slope value.
  /// @param start The timestamp when the boost starts.
  event Boost(address indexed owner, address indexed receiver, uint256 bias, uint256 slope, uint256 start);

  /// @notice Emitted when the owner cancel an old boost.
  /// @param owner The address of ve balance owner.
  /// @param receiver The address of ve balance recipient.
  /// @param bias The bias value at timestamp `start`.
  /// @param slope The slope value.
  /// @param start The timestamp when the boost starts.
  event Unboost(address indexed owner, address indexed receiver, uint256 bias, uint256 slope, uint256 start);

  /*************************
   * Public View Functions *
   *************************/

  /// @notice Returns the name of the token.
  function name() external view returns (string memory);

  /// @notice Returns the symbol of the token.
  function symbol() external view returns (string memory);

  /// @notice Returns the decimals places of the token.
  function decimals() external view returns (uint8);

  /// @notice Returns the amount of tokens in existence.
  function totalSupply() external view returns (uint256);

  /// @notice Returns the remaining number of tokens that `spender` will be
  /// allowed to spend on behalf of `owner` through {transferFrom}. This is
  /// zero by default.
  ///
  /// This value changes when {approve} or {transferFrom} are called.
  function allowance(address owner, address spender) external view returns (uint256);

  /// @notice Returns the amount of tokens owned by `account`.
  function balanceOf(address account) external view returns (uint256);

  /// @notice Return the ve balance considering delegating.
  /// @param account The address of user to query.
  function adjustedVeBalance(address account) external view returns (uint256);

  /// @notice Return the ve balance delegated to others.
  /// @param account The address of user to query.
  function delegatedBalance(address account) external view returns (uint256);

  /// @notice Return the ve balance received from others.
  /// @param account The address of user to query.
  function receivedBalance(address account) external view returns (uint256);

  /// @notice Return the ve balance can be delegated to others.
  /// @param account The address of user to query.
  function delegableBalance(address account) external view returns (uint256);

  /// @notice Returns the current nonce for `owner`. This value must be
  /// included whenever a signature is generated for {permit}.
  ///
  /// Every successful call to {permit} increases ``owner``'s nonce by one. This
  /// prevents a signature from being used multiple times.
  function nonces(address owner) external view returns (uint256);

  /// @dev Returns the domain separator used in the encoding of the signature for {permit}, as defined by {EIP712}.
  // solhint-disable-next-line func-name-mixedcase
  function DOMAIN_SEPARATOR() external view returns (bytes32);

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @notice Sets `amount` as the allowance of `spender` over the caller's tokens.
  ///
  /// Returns a boolean value indicating whether the operation succeeded.
  ///
  /// IMPORTANT: Beware that changing an allowance with this method brings the risk
  /// that someone may use both the old and the new allowance by unfortunate
  /// transaction ordering. One possible solution to mitigate this race
  /// condition is to first reduce the spender's allowance to 0 and set the
  /// desired value afterwards:
  /// https://github.com/ethereum/EIPs/issues/20#issuecomment-263524729
  ///
  /// Emits an {Approval} event.
  function approve(address spender, uint256 amount) external;

  /// @notice Atomically increases the allowance granted to `spender` by the caller.
  ///
  /// This is an alternative to {approve} that can be used as a mitigation for
  /// problems described in {IVotingEscrowBoost-approve}.
  ///
  /// Emits an {Approval} event indicating the updated allowance.
  ///
  /// Requirements:
  ///
  /// - `spender` cannot be the zero address.
  function increaseAllowance(address spender, uint256 addedValue) external;

  /// @notice Atomically decreases the allowance granted to `spender` by the caller.
  ///
  /// This is an alternative to {approve} that can be used as a mitigation for
  /// problems described in {IVotingEscrowBoost-approve}.
  ///
  /// Emits an {Approval} event indicating the updated allowance.
  ///
  /// Requirements:
  ///
  /// - `spender` cannot be the zero address.
  /// - `spender` must have allowance for the caller of at least
  /// `subtractedValue`.
  function decreaseAllowance(address spender, uint256 subtractedValue) external;

  /// @notice Sets `value` as the allowance of `spender` over ``owner``'s tokens,
  /// given ``owner``'s signed approval.
  ///
  /// IMPORTANT: The same issues {IVotingEscrowBoost-approve} has related to transaction
  /// ordering also apply here.
  ///
  /// Emits an {Approval} event.
  ///
  /// Requirements:
  ///
  /// - `spender` cannot be the zero address.
  /// - `deadline` must be a timestamp in the future.
  /// - `v`, `r` and `s` must be a valid `secp256k1` signature from `owner`
  /// over the EIP712-formatted function arguments.
  /// - the signature must use ``owner``'s current nonce (see {nonces}).
  ///
  /// For more information on the signature format, see the
  /// https://eips.ethereum.org/EIPS/eip-2612#specification[relevant EIP
  /// section].
  function permit(
    address owner,
    address spender,
    uint256 value,
    uint256 deadline,
    uint8 v,
    bytes32 r,
    bytes32 s
  ) external;

  /// @notice Boost ve balance to other user.
  /// @param receiver The address of recipient.
  /// @param amount The amount of ve balance to boost.
  /// @param endtime The end timestamp of this boost.
  function boost(
    address receiver,
    uint256 amount,
    uint256 endtime
  ) external;

  /// @notice Boost ve balance to other user on behalf of another user.
  /// @param owner The address of ve balance owner.
  /// @param receiver The address of recipient.
  /// @param amount The amount of ve balance to boost.
  /// @param endtime The end timestamp of this boost.
  function boostFrom(
    address owner,
    address receiver,
    uint256 amount,
    uint256 endtime
  ) external;

  /// @notice Cancel an existing boost.
  /// @param index The index of in the boost lists.
  /// @param amount The amount of boost to cancel.
  function unboost(uint256 index, uint128 amount) external;

  /// @notice Update the user balance snapshot.
  /// @param account The address of the user to update.
  function checkpoint(address account) external;
}
