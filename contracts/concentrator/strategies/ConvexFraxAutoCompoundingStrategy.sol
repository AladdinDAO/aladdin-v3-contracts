// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;
pragma abicoder v2;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";

import "../../interfaces/IConvexFraxBooster.sol";
import "../../interfaces/IFraxUnifiedFarm.sol";
import "../../interfaces/IStakingProxyConvex.sol";
import "../../interfaces/IZap.sol";

import "./AutoCompoundingStrategyBase.sol";

// solhint-disable reason-string
// solhint-disable not-rely-on-time
// solhint-disable no-empty-blocks

contract ConvexFraxAutoCompoundingStrategy is OwnableUpgradeable, PausableUpgradeable, AutoCompoundingStrategyBase {
  using SafeERC20 for IERC20;

  /// @dev The address of Convex Booster for Frax vault.
  address private constant BOOSTER = 0x569f5B842B5006eC17Be02B8b94510BA8e79FbCa;

  /// @dev Compiler will pack this into two `uint256`.
  struct LockData {
    // The amount of lock time, in seconds.
    uint64 duration;
    // Next unlock time, in seconds.
    uint64 unlockAt;
    // The amount of token should be unlocked at next unlock time.
    uint128 pendingUnlocked;
    // The key of locked items in frax vault.
    bytes32 key;
  }

  struct UserLockedBalance {
    // The amount of token locked.
    uint128 balance;
    // Next unlock time, in seconds.
    uint64 unlockAt;
    // reserved slot.
    uint64 _unused;
  }

  LockData public locks;

  /// @notice The pid of Convex reward pool.
  uint256 public pid;

  /// @notice The address of staking token.
  address public token;

  /// @notice The address of personal vault.
  address public vault;

  /// @notice Mapping from user address to user locked data.
  mapping(address => UserLockedBalance[]) public userLocks;

  /// @dev Mapping from user address to next index in `userLocks`.
  mapping(address => uint256) private nextIndex;

  function initialize(
    address _operator,
    address _token,
    uint256 _pid,
    address[] memory _rewards
  ) external initializer {
    OwnableUpgradeable.__Ownable_init();
    PausableUpgradeable.__Pausable_init();
    ConcentratorStrategyBase._initialize(_operator, _rewards);

    address _vault = IConvexFraxBooster(BOOSTER).createVault(_pid);
    IERC20(_token).safeApprove(_vault, uint256(-1));

    pid = _pid;
    token = _token;
    vault = _vault;

    locks.duration = 86400 * 7; // default 7 days
  }

  /********************************** View Functions **********************************/

  /// @notice Query the list of locked balance.
  /// @param _account The address of user to query.
  function getUserLocks(address _account) external view returns (UserLockedBalance[] memory _list) {
    UserLockedBalance[] storage _locks = userLocks[_account];
    uint256 _length = _locks.length;
    uint256 _nextIndex = nextIndex[_account];
    _list = new UserLockedBalance[](_length - _nextIndex);
    for (uint256 i = _nextIndex; i < _length; ++i) {
      _list[i - _nextIndex] = _locks[i];
    }
  }

  /********************************** Mutated Functions **********************************/

  /// @inheritdoc IConcentratorStrategy
  function deposit(address, uint256 _amount) external override onlyOperator {
    if (_amount > 0) {
      _createOrLockMore(vault, _amount);
    }
  }

  /// @inheritdoc IConcentratorStrategy
  function withdraw(address _recipient, uint256 _amount) external override onlyOperator {
    if (_amount > 0) {
      LockData memory _locks = locks;

      // add lock record
      userLocks[_recipient].push(
        UserLockedBalance({ balance: uint128(_amount), unlockAt: _locks.unlockAt, _unused: 0 })
      );

      // increase the pending unlocks.
      _locks.pendingUnlocked = uint128(uint256(_locks.pendingUnlocked) + _amount);

      // try extend lock duration
      _extend(vault, _locks);

      // update storage
      locks = _locks;
    }
  }

  /// @inheritdoc IConcentratorStrategy
  function harvest(address _zapper, address _intermediate) external override onlyOperator returns (uint256 _amount) {
    address _vault = vault;

    // 1. claim rewards from Convex rewards contract.
    address[] memory _rewards = rewards;
    uint256[] memory _amounts = new uint256[](rewards.length);
    for (uint256 i = 0; i < rewards.length; i++) {
      _amounts[i] = IERC20(_rewards[i]).balanceOf(address(this));
    }
    IStakingProxyConvex(_vault).getReward(true, _rewards);
    for (uint256 i = 0; i < rewards.length; i++) {
      _amounts[i] = IERC20(_rewards[i]).balanceOf(address(this)) - _amounts[i];
    }

    // 2. zap all rewards to staking token.
    _amount = _harvest(_zapper, _intermediate, token, _rewards, _amounts);

    // 3. deposit into convex
    if (_amount > 0) {
      _createOrLockMore(_vault, _amount);
    }
  }

  /// @inheritdoc IConcentratorStrategy
  function finishMigrate(address _newStrategy) external override onlyOperator {
    claim(_newStrategy);
  }

  /// @notice Claim unlocked token from contract.
  /// @param _account The address of user to claim.
  function claim(address _account) public {
    {
      LockData memory _locks = locks;
      // try to trigger the unlock and extend.
      _extend(vault, _locks);
      locks = _locks;
    }

    UserLockedBalance[] storage _userLocks = userLocks[_account];
    uint256 _length = _userLocks.length;
    uint256 _nextIndex = nextIndex[_account];
    uint256 _unlocked;
    while (_nextIndex < _length) {
      UserLockedBalance memory _lock = _userLocks[_nextIndex];
      if (_lock.unlockAt < block.timestamp) {
        _unlocked += _lock.balance;
        delete _userLocks[_nextIndex];
      }
      _nextIndex += 1;
    }
    nextIndex[_account] = _nextIndex;

    IERC20(token).safeTransfer(_account, _unlocked);
  }

  /********************************** Restricted Functions **********************************/

  /// @notice Pause contract or not.
  /// @param _status The pause status.
  function setPaused(bool _status) external onlyOwner {
    if (_status) _pause();
    else _unpause();
  }

  /// @notice Update current lock duration.
  function updateLockDuration(uint64 _duraion) external onlyOwner {
    address _farm = IStakingProxyConvex(vault).stakingAddress();

    uint256 _minDuration = IFraxUnifiedFarm(_farm).lock_time_min();
    uint256 _maxDuration = IFraxUnifiedFarm(_farm).lock_time_for_max_multiplier();
    require(_minDuration <= _duraion && _duraion <= _maxDuration, "ConcentratorStrategy: invalid duration");

    locks.duration = _duraion;
  }

  /********************************** Internal Functions **********************************/

  /// @dev Internal function to create lock or lock more.
  /// @param _vault The address of the vault.
  /// @param _amount The amount of token to lock.
  function _createOrLockMore(address _vault, uint256 _amount) internal {
    LockData memory _locks = locks;
    if (_locks.key == bytes32(0)) {
      // we don't have a lock yet, create one
      _locks.key = IStakingProxyConvex(_vault).stakeLockedCurveLp(_amount, _locks.duration);
      _locks.unlockAt = uint64(block.timestamp + _locks.duration);
    } else {
      // we already have a lock, lock more
      IStakingProxyConvex(_vault).lockAdditionalCurveLp(_locks.key, _amount);

      // try extend our lock.
      _extend(_vault, _locks);
    }

    locks = _locks;
  }

  /// @dev Internal function to extend lock duration.
  /// @param _vault The address of the vault.
  /// @param _locks The lock data in memory.
  function _extend(address _vault, LockData memory _locks) internal {
    // no need to extend now
    if (_locks.unlockAt >= block.timestamp) return;

    if (_locks.pendingUnlocked > 0) {
      // unlock pending tokens
      _unlock(_vault, _locks, _locks.pendingUnlocked);
      _locks.pendingUnlocked = 0;
    } else if (!paused()) {
      // don't extend lock duration when paused.
      IStakingProxyConvex(_vault).lockLonger(_locks.key, block.timestamp + _locks.duration);
      _locks.unlockAt = uint64(block.timestamp + _locks.duration);
    }
  }

  /// @dev Internal function to unlock some staking token from frax vault.
  /// @param _vault The address of the vault.
  /// @param _locks The lock data in memory.
  /// @param _amount The amount of token to unlock.
  function _unlock(
    address _vault,
    LockData memory _locks,
    uint256 _amount
  ) internal {
    address _token = token;
    uint256 _unlocked = IERC20(_token).balanceOf(address(this));
    IStakingProxyConvex(_vault).withdrawLockedAndUnwrap(_locks.key);
    _unlocked = IERC20(_token).balanceOf(address(this)) - _unlocked;
    require(_amount <= _unlocked, "ConcentratorStrategy: withdraw more than locked");

    if (_unlocked != _amount && !paused()) {
      // don't extend lock duration when paused.
      _locks.key = IStakingProxyConvex(_vault).stakeLockedCurveLp(_unlocked - _amount, _locks.duration);
      _locks.unlockAt = uint64(block.timestamp + _locks.duration);
    } else {
      _locks.key = bytes32(0);
    }
  }
}
