// SPDX-License-Identifier: MIT

pragma solidity =0.8.20;

import { IVotingEscrow } from "../interfaces/voting-escrow/IVotingEscrow.sol";
import { IVotingEscrowHelper } from "../interfaces/voting-escrow/IVotingEscrowHelper.sol";

contract VotingEscrowHelper is IVotingEscrowHelper {
  /*************
   * Constants *
   *************/

  /// @notice The address of VotingEscrow contract.
  address public immutable ve;

  /// @notice The ve start timestamp.
  uint256 public immutable start;

  /// @dev The number of seconds in a week.
  uint256 private constant WEEK = 7 days;

  /***********
   * Structs *
   ***********/

  /// @notice The ve balance/supply struct.
  /// @dev Compiler will pack this into single `uint256`.
  /// @param value The current ve balance/supply.
  /// @param epoch The corresponding ve balance/supply history point epoch.
  struct Balance {
    uint128 value;
    uint128 epoch;
  }

  /*************
   * Variables *
   *************/

  /// @dev Mapping from timestamp to corresponding ve supply struct.
  mapping(uint256 => Balance) private _supply;

  /// @dev Mapping from account address to timestamp to corresponding ve balance struct.
  ///
  /// Note that we only record the struct for the timestamp when `checkpoint(account)` is
  /// invoked. This is used to saving gas, the reasons are below.
  ///
  /// There are two user types: EOA and contract account.  For normal EOA, the number
  /// of history points usually are small and the call to `checkpoint(account)` is also
  /// not frequently. For contract account, the number of history points usually are large
  /// and the call to `checkpoint(account)` is very frequently.
  ///
  /// According to the implementation of `balanceOf(address account, uint256 timestamp)`.
  /// For EOA, it is very likely to binary search for the correct epoch. And since the number
  /// of history points is small, the number of contract call is also small. For contract
  /// account, it is very likely to find the value in `_balances[account][week]`. Overall,
  /// we will find the correct balance using only `O(1)` contract read.
  mapping(address => mapping(uint256 => Balance)) private _balances;

  /***************
   * Constructor *
   ***************/

  constructor(address _ve) {
    ve = _ve;
    start = IVotingEscrow(_ve).point_history(1).ts;

    uint256 epoch = IVotingEscrow(_ve).epoch();
    uint256 week = (block.timestamp / WEEK) * WEEK;
    (uint256 nowEpoch, IVotingEscrow.Point memory nowPoint) = _binarySearchSupplyPoint(week, 1, epoch);
    _supply[week] = Balance(uint128(_computeValue(nowPoint, week)), uint128(nowEpoch));
  }

  /*************************
   * Public View Functions *
   *************************/

  /// @inheritdoc IVotingEscrowHelper
  function totalSupply(uint256 timestamp) external view override returns (uint256) {
    if (timestamp < start) return 0;

    uint256 week = (timestamp / WEEK) * WEEK;
    Balance memory prevSupply = _supply[week];
    IVotingEscrow.Point memory point;
    if (prevSupply.epoch > 0) {
      if (week == timestamp) return prevSupply.value;
      Balance memory nextSupply = _supply[week + WEEK];
      uint256 nextEpoch = nextSupply.epoch;
      if (nextEpoch == 0) nextEpoch = IVotingEscrow(ve).epoch();
      (, point) = _binarySearchSupplyPoint(timestamp, prevSupply.epoch, nextEpoch);
    } else {
      (, point) = _binarySearchSupplyPoint(timestamp, 1, IVotingEscrow(ve).epoch());
    }
    return _computeValue(point, timestamp);
  }

  /// @inheritdoc IVotingEscrowHelper
  function balanceOf(address account, uint256 timestamp) external view override returns (uint256) {
    if (timestamp < start) return 0;

    // check whether the user has no locks
    uint256 epoch = IVotingEscrow(ve).user_point_epoch(account);
    if (epoch == 0) return 0;
    IVotingEscrow.Point memory point = IVotingEscrow(ve).user_point_history(account, 1);
    if (timestamp < point.ts) return 0;

    uint256 week = (timestamp / WEEK) * WEEK;
    Balance memory prevBalance = _balances[account][week];
    if (prevBalance.epoch > 0) {
      if (week == timestamp) return prevBalance.value;
      Balance memory nextBalance = _balances[account][week + WEEK];
      uint256 nextEpoch = nextBalance.epoch;
      if (nextEpoch == 0) nextEpoch = epoch;
      (, point) = _binarySearchBalancePoint(account, timestamp, prevBalance.epoch, nextEpoch);
    } else {
      (, point) = _binarySearchBalancePoint(account, timestamp, 1, epoch);
    }
    return _computeValue(point, timestamp);
  }

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @inheritdoc IVotingEscrowHelper
  function checkpoint(address account) external override {
    // checkpoint supply
    uint256 week = (block.timestamp / WEEK) * WEEK;
    Balance memory nowSupply = _supply[week];
    if (nowSupply.epoch == 0) {
      Balance memory prevSupply = _supply[week - WEEK];
      (uint256 epoch, IVotingEscrow.Point memory point) = _binarySearchSupplyPoint(
        week,
        prevSupply.epoch,
        IVotingEscrow(ve).epoch()
      );

      nowSupply.value = uint128(_computeValue(point, week));
      nowSupply.epoch = uint128(epoch);
      _supply[week] = nowSupply;
    }

    // checkpoint balance
    uint256 userPointEpoch = IVotingEscrow(ve).user_point_epoch(account);
    if (userPointEpoch == 0) return;

    Balance memory nowBalance = _balances[account][week];
    if (nowBalance.epoch == 0) {
      Balance memory prevBalance = _balances[account][week - WEEK];
      uint256 epoch;
      IVotingEscrow.Point memory point;
      if (prevBalance.epoch == 0) {
        (epoch, point) = _binarySearchBalancePoint(account, week, 1, userPointEpoch);
      } else {
        (epoch, point) = _binarySearchBalancePoint(account, week, prevBalance.epoch, userPointEpoch);
      }

      nowBalance.value = uint128(_computeValue(point, week));
      nowBalance.epoch = uint128(epoch);
      _balances[account][week] = nowBalance;
    }
  }

  /**********************
   * Internal Functions *
   **********************/

  /// @dev Internal function to find largest `epoch` belongs to `[startEpoch, endEpoch]` and
  /// `ve.point_history(epoch) <= timestamp`.
  ///
  /// Caller should make sure the `ve.point_history(startEpoch) <= timestamp`.
  ///
  /// @param timestamp The timestamp to search.
  /// @param startEpoch The number of start epoch, inclusive.
  /// @param endEpoch The number of end epoch, inclusive.
  /// @return epoch The largest `epoch` that `ve.point_history(epoch) <= timestamp`.
  /// @return point The value of `ve.point_history(epoch)`.
  function _binarySearchSupplyPoint(
    uint256 timestamp,
    uint256 startEpoch,
    uint256 endEpoch
  ) internal view returns (uint256 epoch, IVotingEscrow.Point memory point) {
    if (startEpoch == endEpoch) {
      point = IVotingEscrow(ve).point_history(startEpoch);
    }
    unchecked {
      while (startEpoch < endEpoch) {
        uint256 mid = (startEpoch + endEpoch + 1) / 2;
        IVotingEscrow.Point memory p = IVotingEscrow(ve).point_history(mid);
        if (p.ts <= timestamp) {
          startEpoch = mid;
          point = p;
        } else {
          endEpoch = mid - 1;
        }
      }
    }
    epoch = startEpoch;
  }

  /// @dev Internal function to find largest `epoch` belongs to `[startEpoch, endEpoch]` and
  /// `ve.user_point_history(account, epoch) <= timestamp`.
  ///
  /// Caller should make sure the `ve.user_point_history(account, startEpoch) <= timestamp`.
  ///
  /// @param account The address of user to search.
  /// @param timestamp The timestamp to search.
  /// @param startEpoch The number of start epoch, inclusive.
  /// @param endEpoch The number of end epoch, inclusive.
  /// @return epoch The largest `epoch` that `ve.user_point_history(account, epoch) <= timestamp`.
  /// @return point The value of `ve.user_point_history(account, epoch)`.
  function _binarySearchBalancePoint(
    address account,
    uint256 timestamp,
    uint256 startEpoch,
    uint256 endEpoch
  ) internal view returns (uint256 epoch, IVotingEscrow.Point memory point) {
    if (startEpoch == endEpoch) {
      point = IVotingEscrow(ve).user_point_history(account, startEpoch);
    }
    unchecked {
      while (startEpoch < endEpoch) {
        uint256 mid = (startEpoch + endEpoch + 1) / 2;
        IVotingEscrow.Point memory p = IVotingEscrow(ve).user_point_history(account, mid);
        if (p.ts <= timestamp) {
          startEpoch = mid;
          point = p;
        } else {
          endEpoch = mid - 1;
        }
      }
    }
    epoch = startEpoch;
  }

  /// @dev Internal function to compute the value. Caller should make sure `timestamp` is not less than `point.ts`.
  /// @param point The point for ve.
  /// @param timestamp The timestamp to compute.
  function _computeValue(IVotingEscrow.Point memory point, uint256 timestamp) internal pure returns (uint256) {
    return uint256(point.bias - point.slope * int256(timestamp - point.ts));
  }
}
