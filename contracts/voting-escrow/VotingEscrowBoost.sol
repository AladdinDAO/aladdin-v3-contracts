// SPDX-License-Identifier: MIT

pragma solidity =0.8.20;

import { IERC20Metadata } from "@openzeppelin/contracts-v4/token/ERC20/extensions/IERC20Metadata.sol";
import { ECDSA } from "@openzeppelin/contracts-v4/utils/cryptography/ECDSA.sol";
import { EIP712 } from "@openzeppelin/contracts-v4/utils/cryptography/EIP712.sol";
import { Context } from "@openzeppelin/contracts-v4/utils/Context.sol";

import { IVotingEscrow } from "./interfaces/IVotingEscrow.sol";
import { IVotingEscrowBoost } from "./interfaces/IVotingEscrowBoost.sol";

// solhint-disable const-name-snakecase
// solhint-disable not-rely-on-time

contract VotingEscrowBoost is EIP712, Context, IVotingEscrowBoost {
  /*************
   * Constants *
   *************/

  /// @notice The address of VotingEscrow contract.
  address public immutable ve;

  /// @inheritdoc IVotingEscrowBoost
  uint8 public constant override decimals = 18;

  // solhint-disable-next-line var-name-mixedcase
  bytes32 private constant _PERMIT_TYPEHASH =
    keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)");

  /// @dev The number of seconds in a week.
  uint256 private constant WEEK = 7 days;

  /***********
   * Structs *
   ***********/

  /// @dev Compiler will pack this into single `uint256`.
  /// The boost power can be represented as `bias - slope * (t - ts)` if the time `t` and `ts`
  /// is in the same epoch. If epoch cross happens, we will change the corresponding value based
  /// on slope changes.
  struct Point {
    // The bias for the linear function
    uint112 bias;
    // The slop for the linear function
    uint112 slope;
    // The start timestamp in seconds for current epoch.
    // `uint32` should be enough for next 83 years.
    uint32 ts;
  }

  /// @dev Compiler will pack this into two `uint256`.
  struct BoostItem {
    // The address of boost recipient.
    address receiver;
    // The start timestamp of the boost.
    uint48 startTime;
    // The end timestamp of the boost.
    uint48 endTime;
    // The initial amount of boost.
    uint128 initialAmount;
    // The amount of cancelled boost.
    uint128 cancelAmount;
  }

  /*************
   * Variables *
   *************/

  /// @inheritdoc IVotingEscrowBoost
  mapping(address => mapping(address => uint256)) public override allowance;

  /// @inheritdoc IVotingEscrowBoost
  mapping(address => uint256) public override nonces;

  /// @notice Mapping from user address to a list of boosts.
  mapping(address => BoostItem[]) public boosts;

  /// @notice Mapping from user address to delegation information.
  mapping(address => Point) public delegated;

  /// @notice Mapping from user address to delegation endtime to slope changes.
  mapping(address => mapping(uint256 => uint256)) public delegatedSlopeChanges;

  /// @notice Mapping from user address to received information.
  mapping(address => Point) public received;

  /// @notice Mapping from user address to received endtime to slope changes.
  mapping(address => mapping(uint256 => uint256)) public receivedSlopeChanges;

  /***************
   * Constructor *
   ***************/

  constructor(address _ve) EIP712("VotingEscrow Boost", "1") {
    ve = _ve;
  }

  /*************************
   * Public View Functions *
   *************************/

  /// @inheritdoc IVotingEscrowBoost
  function name() external view returns (string memory) {
    return string(abi.encodePacked(IERC20Metadata(ve).name(), " Boost"));
  }

  /// @inheritdoc IVotingEscrowBoost
  function symbol() external view returns (string memory) {
    return string(abi.encodePacked(IERC20Metadata(ve).symbol(), "Boost"));
  }

  /// @inheritdoc IVotingEscrowBoost
  function totalSupply() external view returns (uint256) {
    return IERC20Metadata(ve).totalSupply();
  }

  /// @inheritdoc IVotingEscrowBoost
  function balanceOf(address _account) external view returns (uint256) {
    return _balanceOf(_account);
  }

  /// @inheritdoc IVotingEscrowBoost
  function adjustedVeBalance(address _account) external view returns (uint256) {
    return _balanceOf(_account);
  }

  /// @inheritdoc IVotingEscrowBoost
  function delegatedBalance(address _account) public view returns (uint256) {
    (Point memory p, ) = _checkpoint(_account, true);
    return p.bias - p.slope * (block.timestamp - p.ts);
  }

  /// @inheritdoc IVotingEscrowBoost
  function receivedBalance(address _account) external view returns (uint256) {
    (Point memory p, ) = _checkpoint(_account, false);
    return p.bias - p.slope * (block.timestamp - p.ts);
  }

  /// @inheritdoc IVotingEscrowBoost
  function delegableBalance(address _account) external view returns (uint256) {
    return IVotingEscrow(ve).balanceOf(_account) - delegatedBalance(_account);
  }

  /// @notice Return the number of boosts from this user.
  function boostLength(address _account) public view returns (uint256) {
    return boosts[_account].length;
  }

  /// @inheritdoc IVotingEscrowBoost
  // solhint-disable-next-line func-name-mixedcase
  function DOMAIN_SEPARATOR() external view override returns (bytes32) {
    return _domainSeparatorV4();
  }

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @inheritdoc IVotingEscrowBoost
  function approve(address spender, uint256 amount) external {
    address owner = _msgSender();
    _approve(owner, spender, amount);
  }

  /// @inheritdoc IVotingEscrowBoost
  function increaseAllowance(address spender, uint256 addedValue) external {
    address owner = _msgSender();
    _approve(owner, spender, allowance[owner][spender] + addedValue);
  }

  /// @inheritdoc IVotingEscrowBoost
  function decreaseAllowance(address spender, uint256 subtractedValue) external {
    address owner = _msgSender();
    uint256 currentAllowance = allowance[owner][spender];
    if (currentAllowance < subtractedValue) revert DecreasedAllowanceBelowZero();
    unchecked {
      _approve(owner, spender, currentAllowance - subtractedValue);
    }
  }

  /// @inheritdoc IVotingEscrowBoost
  function permit(
    address owner,
    address spender,
    uint256 value,
    uint256 deadline,
    uint8 v,
    bytes32 r,
    bytes32 s
  ) external {
    if (block.timestamp > deadline) {
      revert ExpiredDeadline();
    }

    bytes32 structHash = keccak256(abi.encode(_PERMIT_TYPEHASH, owner, spender, value, _useNonce(owner), deadline));

    bytes32 hash = _hashTypedDataV4(structHash);

    address signer = ECDSA.recover(hash, v, r, s);
    if (signer != owner) {
      revert InvalidSignature();
    }

    _approve(owner, spender, value);
  }

  /// @inheritdoc IVotingEscrowBoost
  function boost(
    address _receiver,
    uint256 _amount,
    uint256 _endtime
  ) external {
    address owner = _msgSender();
    _boost(owner, _receiver, _amount, _endtime);
  }

  /// @inheritdoc IVotingEscrowBoost
  function boostFrom(
    address _owner,
    address _receiver,
    uint256 _amount,
    uint256 _endtime
  ) external {
    address spender = _msgSender();

    _spendAllowance(_owner, spender, _amount);
    _boost(_owner, _receiver, _amount, _endtime);
  }

  /// @inheritdoc IVotingEscrowBoost
  function unboost(uint256 _index, uint128 _amount) external {
    address _owner = _msgSender();
    if (_index >= boostLength(_owner)) revert IndexOutOfBound();

    BoostItem memory _item = boosts[_owner][_index];
    _item.cancelAmount += _amount;
    if (_item.cancelAmount > _item.initialAmount) revert CancelBoostExceedBalance();
    if (_item.endTime <= block.timestamp) revert CancelExpiredBoost();

    // update amount based on current timestamp
    _amount -= uint128((uint256(_amount) * (block.timestamp - _item.startTime)) / (_item.endTime - _item.startTime));

    // checkpoint delegated point
    Point memory p = _checkpointWrite(_owner, true);

    // calculate slope and bias being added
    uint112 slope = uint112(_amount / (_item.endTime - block.timestamp));
    uint112 bias = uint112(slope * (_item.endTime - block.timestamp));

    // update delegated point
    p.bias -= bias;
    p.slope -= slope;

    // store updated values
    delegated[_owner] = p;
    delegatedSlopeChanges[_owner][_item.endTime] -= slope;

    // update received amount
    p = _checkpointWrite(_item.receiver, false);
    p.bias -= bias;
    p.slope -= slope;

    // store updated values
    received[_item.receiver] = p;
    receivedSlopeChanges[_item.receiver][_item.endTime] -= slope;

    emit Transfer(_item.receiver, address(0), bias);

    // also checkpoint received and delegated
    received[_owner] = _checkpointWrite(_owner, false);
    delegated[_item.receiver] = _checkpointWrite(_item.receiver, true);

    emit Unboost(_owner, _item.receiver, bias, slope, block.timestamp);

    boosts[_owner][_index] = _item;
  }

  /// @inheritdoc IVotingEscrowBoost
  function checkpoint(address _account) external {
    delegated[_account] = _checkpointWrite(_account, true);
    received[_account] = _checkpointWrite(_account, false);
  }

  /**********************
   * Internal Functions *
   **********************/

  /// @dev Internal function to boost votes to others.
  function _boost(
    address _owner,
    address _receiver,
    uint256 _amount,
    uint256 _endtime
  ) private {
    if (_amount == 0) revert BoostZeroAmount();
    if (_endtime <= block.timestamp) revert EndTimeSmallerThanCurrentTimestamp();
    if (_endtime % WEEK != 0) revert EndTimeNotAlignedWithWeek();
    if (_endtime > IVotingEscrow(ve).locked__end(_owner)) revert EndTimeExceedLockEnd();

    // checkpoint delegated point
    Point memory p = _checkpointWrite(_owner, true);
    if (_amount > IVotingEscrow(ve).balanceOf(_owner) - (p.bias - p.slope * (block.timestamp - p.ts))) {
      revert BoostExceedBalance();
    }

    // calculate slope and bias being added
    uint112 slope = uint112(_amount / (_endtime - block.timestamp));
    uint112 bias = uint112(slope * (_endtime - block.timestamp));

    // update delegated point
    p.bias += bias;
    p.slope += slope;

    // store updated values
    delegated[_owner] = p;
    delegatedSlopeChanges[_owner][_endtime] += slope;

    // update received amount
    p = _checkpointWrite(_receiver, false);
    p.bias += bias;
    p.slope += slope;

    // store updated values
    received[_receiver] = p;
    receivedSlopeChanges[_receiver][_endtime] += slope;

    emit Transfer(_owner, _receiver, bias);
    emit Boost(_owner, _receiver, bias, slope, block.timestamp);

    // also checkpoint received and delegated
    received[_owner] = _checkpointWrite(_owner, false);
    delegated[_receiver] = _checkpointWrite(_receiver, true);

    boosts[_owner].push(
      BoostItem({
        receiver: _receiver,
        startTime: uint48(block.timestamp),
        endTime: uint48(_endtime),
        initialAmount: uint128(bias),
        cancelAmount: 0
      })
    );
  }

  function _balanceOf(address _account) private view returns (uint256) {
    uint256 _amount = IVotingEscrow(ve).balanceOf(_account);

    (Point memory p, ) = _checkpoint(_account, true);
    _amount -= uint256(p.bias - p.slope * (block.timestamp - p.ts));

    (p, ) = _checkpoint(_account, false);
    _amount += uint256(p.bias - p.slope * (block.timestamp - p.ts));

    return _amount;
  }

  /// @dev Internal function to read checkpoint result without state change.
  /// @param _account The address of user to checkpoint.
  /// @param _isDelegated whether to checkpoint delegate snapshot.
  /// @return p The snapshot point after checkpoint.
  /// @return dbias The ve balance decreased due to time decay.
  function _checkpoint(address _account, bool _isDelegated) internal view returns (Point memory p, uint256 dbias) {
    p = _isDelegated ? delegated[_account] : received[_account];
    if (p.ts == 0) {
      p.ts = uint32(block.timestamp);
    }
    if (p.ts == block.timestamp) {
      return (p, dbias);
    }

    uint256 ts = (p.ts / WEEK) * WEEK;
    for (uint256 i = 0; i < 255; i++) {
      ts += WEEK;
      uint256 _slopeChange = 0;
      if (ts > block.timestamp) {
        ts = block.timestamp;
      } else {
        _slopeChange = _isDelegated ? delegatedSlopeChanges[_account][ts] : receivedSlopeChanges[_account][ts];
      }

      uint112 _amount = p.slope * uint112(ts - p.ts);
      dbias += uint256(_amount);
      p.bias -= _amount;
      p.slope -= uint112(_slopeChange);
      p.ts = uint32(ts);

      if (p.ts == block.timestamp) {
        break;
      }
    }
  }

  /// @dev Internal function to read checkpoint result with state change.
  /// @param _account The address of user to checkpoint.
  /// @param _isDelegated whether to checkpoint delegate snapshot.
  /// @return p The snapshot point after checkpoint.
  function _checkpointWrite(address _account, bool _isDelegated) internal returns (Point memory p) {
    uint256 dbias;
    (p, dbias) = _checkpoint(_account, _isDelegated);

    // received boost
    if (!_isDelegated && dbias > 0) {
      emit Transfer(_account, address(0), dbias);
    }
  }

  /// @dev Updates `owner` s allowance for `spender` based on spent `amount`.
  ///
  /// Does not update the allowance amount in case of infinite allowance.
  /// Revert if not enough allowance is available.
  ///
  /// Might emit an {Approval} event.
  function _spendAllowance(
    address owner,
    address spender,
    uint256 amount
  ) private {
    uint256 currentAllowance = allowance[owner][spender];
    if (currentAllowance != type(uint256).max) {
      if (currentAllowance < amount) revert InsufficientAllowance();
      unchecked {
        _approve(owner, spender, currentAllowance - amount);
      }
    }
  }

  /// @dev See {IVotingEscrowBoost-approve}.
  ///
  /// NOTE: If `amount` is the maximum `uint256`, the allowance is not updated on
  /// `transferFrom`. This is semantically equivalent to an infinite approval.
  ///
  /// Requirements:
  ///
  /// - `spender` cannot be the zero address.
  function _approve(
    address owner,
    address spender,
    uint256 amount
  ) private {
    if (owner == address(0)) revert ApproveFromZeroAddress();
    if (spender == address(0)) revert ApproveToZeroAddress();

    allowance[owner][spender] = amount;
    emit Approval(owner, spender, amount);
  }

  /// @dev "Consume a nonce": return the current value and increment.
  function _useNonce(address _owner) private returns (uint256 _current) {
    _current = nonces[_owner];
    unchecked {
      nonces[_owner] = _current + 1;
    }
  }
}
