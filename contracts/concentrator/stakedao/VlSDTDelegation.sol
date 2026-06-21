// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/SafeERC20Upgradeable.sol";

import { IStakeDAOVlBoost } from "../../interfaces/stakedao/IStakeDAOVlBoost.sol";

// solhint-disable not-rely-on-time

contract VlSDTDelegation is OwnableUpgradeable {
  using SafeERC20Upgradeable for IERC20Upgradeable;

  /// @notice Emitted when someone boost `StakeDaoLockerProxy` contract.
  /// @param _owner The address of veSDT owner.
  /// @param _recipient The address of recipient who will receive the pool share.
  /// @param _amount The amount of veSDT to boost.
  /// @param _endtime The timestamp in seconds when the boost will end.
  event Boost(address indexed _owner, address indexed _recipient, uint256 _amount, uint256 _endtime);

  /// @notice Emitted when someone checkpoint pending rewards.
  /// @param _timestamp The timestamp in seconds when the checkpoint happened.
  /// @param _amount The amount of pending rewards distributed.
  event CheckpointReward(uint256 _timestamp, uint256 _amount);

  /// @notice Emitted when user claim pending rewards
  /// @param _owner The owner of the pool share.
  /// @param _recipient The address of recipient who will receive the rewards.
  /// @param _amount The amount of pending rewards claimed.
  event Claim(address indexed _owner, address indexed _recipient, uint256 _amount);

  /// @dev The address of SDT Token.
  address private constant SDT = 0x73968b9a57c6E53d41345FD57a6E6ae27d6CDB2F;

  uint256 private constant REWARD_CHECKPOINT_DELAY = 1 days;

  /// @dev The number of seconds in a week.
  uint256 private constant WEEK = 86400 * 7;

  /// @notice The name of the vault.
  // solhint-disable-next-line const-name-snakecase
  string public constant name = "Aladdin vlSDT Boost";

  /// @notice The symbol of the vault.
  // solhint-disable-next-line const-name-snakecase
  string public constant symbol = "vlSDT-boost";

  /// @notice The decimal of the vault share.
  // solhint-disable-next-line const-name-snakecase
  uint8 public constant decimals = 18;

  /// @notice The address of StakeDaoLockerProxy contract.
  address public immutable stakeDAOProxy;

  /// @notice The address of StakeDAO VlBoost contract.
  address public immutable vlBoost;

  /// @dev Compiler will pack this into single `uint256`.
  /// The boost power can be represented as `bias - slope * (t - ts)` if the time `t` and `ts`
  /// is in the same epoch. If epoch cross happens, we will change the corresponding value based
  /// on slope changes.
  struct Point {
    // The amount of delegated boost.
    uint128 delegated;
    // The start timestamp in seconds for current epoch.
    // `uint32` should be enough for next 83 years.
    uint128 timestamp;
  }

  /// @dev Compiler will pack this into single `uint256`.
  struct RewardData {
    // The current balance of SDT token.
    uint128 balance;
    // The timestamp in second when last distribute happened.
    uint128 timestamp;
  }

  /// @notice Mapping from user address to current updated point.
  /// @dev The global information is stored in address(0)
  mapping(address => Point) public boosts;

  /// @notice Mapping from user address to boost endtime to slope changes.
  /// @dev The global information is stored in address(0)
  mapping(address => mapping(uint256 => uint256)) public delegatedExpiring;

  /// @notice Mapping from user address to week timestamp to the boost power.
  /// @dev The global information is stored in address(0)
  mapping(address => mapping(uint256 => uint256)) public historyBoosts;

  /// @notice Mapping from week timestamp to the number of SDT rewards accured during the week.
  mapping(uint256 => uint256) public weeklyRewards;

  /// @notice Mapping from user address to reward claimed week timestamp.
  mapping(address => uint256) public claimIndex;

  /// @notice The lastest SDT reward distribute information.
  RewardData public lastSDTReward;

  /********************************** Constructor **********************************/

  constructor(address _stakeDAOProxy, address _vlBoost) {
    stakeDAOProxy = _stakeDAOProxy;
    vlBoost = _vlBoost;
  }

  function initialize(uint256 _startTimestamp) external initializer {
    OwnableUpgradeable.__Ownable_init();

    boosts[address(0)] = Point({ delegated: 0, timestamp: uint128(block.timestamp) });
    lastSDTReward = RewardData({ balance: 0, timestamp: uint128(_startTimestamp) });
  }

  /********************************** View Functions **********************************/

  /// @notice Return the current total pool shares.
  function totalSupply() external view returns (uint256) {
    Point memory p = _checkpointRead(address(0));
    return p.delegated;
  }

  /// @notice Return the current pool share for the user.
  /// @param _user The address of the user to query.
  function balanceOf(address _user) external view returns (uint256) {
    if (_user == address(0)) return 0;

    Point memory p = _checkpointRead(_user);
    return p.delegated;
  }

  /********************************** Mutated Functions **********************************/

  /// @notice Boost some veSDT to `StakeDaoLockerProxy` contract.
  /// @dev Use `_amount=-1` to boost all available power.
  /// @param _amount The amount of veSDT to boost.
  /// @param _endtime The timestamp in seconds when the boost will end.
  /// @param _recipient The address of recipient who will receive the pool share.
  function boost(
    uint256 _amount,
    uint256 _endtime,
    address _recipient
  ) public {
    require(_recipient != address(0), "recipient is zero address");
    if (_amount == uint256(-1)) {
      _amount = IStakeDAOVlBoost(vlBoost).delegableBalance(msg.sender);
    }
    _endtime = (_endtime / WEEK) * WEEK;

    IStakeDAOVlBoost(vlBoost).boost(msg.sender, _amount, _endtime, stakeDAOProxy);

    _boost(_amount, _endtime, _recipient);
  }

  /// @notice Claim SDT rewards for some user.
  /// @param _user The address of user to claim.
  /// @param _recipient The address of recipient who will receive the SDT.
  /// @return The amount of SDT claimed.
  function claim(address _user, address _recipient) external returns (uint256) {
    if (_user != msg.sender) {
      require(_recipient == _user, "claim from others to others");
    }
    require(_user != address(0), "claim for zero address");

    // during claiming, update the point if 1 day pasts, since we will not use the latest point
    Point memory p = boosts[address(0)];
    if (block.timestamp >= p.timestamp + REWARD_CHECKPOINT_DELAY) {
      _checkpointWrite(address(0), p);
      boosts[address(0)] = p;
    }

    // during claiming, update the point if 1 day pasts, since we will not use the latest point
    p = boosts[_user];
    if (block.timestamp >= p.timestamp + REWARD_CHECKPOINT_DELAY) {
      _checkpointWrite(_user, p);
      boosts[_user] = p;
    }

    // checkpoint weekly reward
    _checkpointReward(false);

    // claim reward
    return _claim(_user, _recipient);
  }

  /// @notice Force checkpoint SDT reward status.
  function checkpointReward() external {
    _checkpointReward(true);
  }

  /// @notice Force checkpoint user information.
  /// @dev User `_user=address(0)` to checkpoint total supply.
  /// @param _user The address of user to checkpoint.
  function checkpoint(address _user) external {
    Point memory p = boosts[_user];
    _checkpointWrite(_user, p);
    boosts[_user] = p;
  }

  /********************************** Internal Functions **********************************/

  /// @dev Internal function to update boost records
  /// @param _amount The amount of veSDT to boost.
  /// @param _endtime The timestamp in seconds when the boost will end.
  /// @param _recipient The address of recipient who will receive the pool share.
  function _boost(
    uint256 _amount,
    uint256 _endtime,
    address _recipient
  ) internal {
    // initialize claim index
    if (claimIndex[_recipient] == 0) {
      claimIndex[_recipient] = (block.timestamp / WEEK) * WEEK;
    }

    // update global state
    _update(_amount, _endtime, address(0));

    // update user state
    _update(_amount, _endtime, _recipient);

    emit Boost(msg.sender, _recipient, _amount, _endtime);
  }

  /// @dev Internal function to update veBoost point
  /// @param _delegated The delegated delta of the point.
  /// @param _endtime The endtime in seconds for the boost.
  /// @param _user The address of user to update.
  function _update(
    uint256 _delegated,
    uint256 _endtime,
    address _user
  ) internal {
    Point memory p = boosts[_user];
    _checkpointWrite(_user, p);
    p.delegated += uint128(_delegated);

    delegatedExpiring[_user][_endtime] += _delegated;
    boosts[_user] = p;

    if (p.timestamp % WEEK == 0) {
      historyBoosts[_user][p.timestamp] = p.delegated;
    }
  }

  /// @dev Internal function to claim user rewards.
  /// @param _user The address of user to claim.
  /// @param _recipient The address of recipient who will receive the SDT.
  /// @return The amount of SDT claimed.
  function _claim(address _user, address _recipient) internal returns (uint256) {
    uint256 _index = claimIndex[_user];
    uint256 _lastTime = lastSDTReward.timestamp;
    uint256 _amount = 0;
    uint256 _thisWeek = (block.timestamp / WEEK) * WEEK;

    // claim at most 50 weeks in one tx
    for (uint256 i = 0; i < 50; i++) {
      // we don't claim rewards from current week.
      if (_index >= _lastTime || _index >= _thisWeek) break;
      uint256 _totalPower = historyBoosts[address(0)][_index];
      uint256 _userPower = historyBoosts[_user][_index];
      if (_totalPower != 0 && _userPower != 0) {
        _amount += (_userPower * weeklyRewards[_index]) / _totalPower;
      }
      _index += WEEK;
    }
    claimIndex[_user] = _index;

    if (_amount > 0) {
      IERC20Upgradeable(SDT).safeTransfer(_recipient, _amount);
      lastSDTReward.balance -= uint128(_amount);
    }

    emit Claim(_user, _recipient, _amount);
    return _amount;
  }

  /// @dev Internal function to read checkpoint result without change state.
  /// @param _user The address of user to checkpoint.
  /// @return The result point for the user.
  function _checkpointRead(address _user) internal view returns (Point memory) {
    Point memory p = boosts[_user];

    if (p.timestamp == 0) {
      p.timestamp = uint128(block.timestamp);
    }
    if (p.timestamp == block.timestamp) {
      return p;
    }

    uint256 ts = (p.timestamp / WEEK) * WEEK;
    for (uint256 i = 0; i < 255; i++) {
      ts += WEEK;
      uint256 _delegatedExpiring = 0;
      if (ts > block.timestamp) {
        ts = block.timestamp;
      } else {
        _delegatedExpiring = delegatedExpiring[_user][ts];
      }

      p.delegated -= uint128(_delegatedExpiring);
      p.timestamp = uint128(ts);

      if (p.timestamp == block.timestamp) {
        break;
      }
    }
    return p;
  }

  /// @dev Internal function to read checkpoint result and change state.
  /// @param _user The address of user to checkpoint.
  function _checkpointWrite(address _user, Point memory p) internal {
    if (p.timestamp == 0) p.timestamp = uint128(block.timestamp);
    if (p.timestamp == block.timestamp) return;

    uint256 ts = (p.timestamp / WEEK) * WEEK;
    for (uint256 i = 0; i < 255; i++) {
      ts += WEEK;
      uint256 _delegatedExpiring = 0;
      if (ts > block.timestamp) {
        ts = block.timestamp;
      } else {
        _delegatedExpiring = delegatedExpiring[_user][ts];
      }

      p.delegated -= uint128(_delegatedExpiring);
      p.timestamp = uint128(ts);

      if (ts % WEEK == 0) {
        historyBoosts[_user][ts] = p.delegated;
      }

      if (p.timestamp == block.timestamp) {
        break;
      }
    }
  }

  /// @dev Internal function to checkpoint SDT rewards
  /// @param _force Whether to do force checkpoint.
  function _checkpointReward(bool _force) internal {
    RewardData memory _last = lastSDTReward;
    // We only claim in the next week, so the update can delay 1 day.
    if (!_force && block.timestamp <= _last.timestamp + REWARD_CHECKPOINT_DELAY) return;
    require(block.timestamp >= _last.timestamp, "not start yet");

    // update timestamp
    uint256 _lastTime = _last.timestamp;
    uint256 _sinceLast = block.timestamp - _last.timestamp;
    _last.timestamp = uint128(block.timestamp);
    // update balance
    uint256 _balance = IERC20Upgradeable(SDT).balanceOf(address(this));
    uint256 _amount = _balance - _last.balance;
    _last.balance = uint128(_balance);
    lastSDTReward = _last;

    if (_amount > 0) {
      uint256 _thisWeek = (_lastTime / WEEK) * WEEK;

      // 20 should be enough, since we are doing checkpoint every week.
      for (uint256 i = 0; i < 20; i++) {
        uint256 _nextWeek = _thisWeek + WEEK;
        if (block.timestamp < _nextWeek) {
          if (_sinceLast == 0) {
            weeklyRewards[_thisWeek] += _amount;
          } else {
            weeklyRewards[_thisWeek] += (_amount * (block.timestamp - _lastTime)) / _sinceLast;
          }
          break;
        } else {
          if (_sinceLast == 0 && _nextWeek == _lastTime) {
            weeklyRewards[_thisWeek] += _amount;
          } else {
            weeklyRewards[_thisWeek] += (_amount * (_nextWeek - _lastTime)) / _sinceLast;
          }
        }
        _lastTime = _nextWeek;
        _thisWeek = _nextWeek;
      }
    }

    emit CheckpointReward(block.timestamp, _amount);
  }
}
