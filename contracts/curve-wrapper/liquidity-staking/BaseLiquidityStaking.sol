// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import "@openzeppelin/contracts-upgradeable/math/SafeMathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/SafeERC20Upgradeable.sol";

import "../interfaces/ILiquidityStaking.sol";

// solhint-disable not-rely-on-time
// solhint-disable no-empty-blocks

abstract contract BaseLiquidityStaking is ILiquidityStaking {
  using SafeERC20Upgradeable for IERC20Upgradeable;
  using SafeMathUpgradeable for uint256;

  /*************
   * Constants *
   *************/

  /// @dev The precision used to compute reward tokens.
  uint256 internal constant REWARD_PRECISION = 1e18;

  /// @dev The number of seconds in on week.
  uint256 internal constant WEEK = 86400 * 7;

  /***********
   * Structs *
   ***********/

  /// @dev Compiler will pack this into single `uint256`.
  struct AccountRewardInfo {
    uint96 rewards;
    uint160 rewardPerSharePaid;
  }

  /// @dev Compiler will pack this into two `uint256`.
  struct PoolRewardInfo {
    // The current reward rate per second.
    uint128 rate;
    // The timesamp in seconds when reward is updated.
    uint64 lastUpdate;
    // The finish timestamp in seconds of current reward period.
    uint64 finishAt;
    // The accumulated reward per share, with 1e18 precision.
    uint256 accRewardPerShare;
  }

  /*************
   * Variables *
   *************/

  /// @notice The address of CurveBooster;
  address public booster;

  /// @notice The pool reward information.
  PoolRewardInfo public poolRewards;

  /// @dev Mapping from user address to account reward information.
  mapping(address => AccountRewardInfo) private accountRewards;

  uint256[47] private __gap;

  /**********************
   * Function Modifiers *
   **********************/

  modifier onlyBooster() {
    require(booster == msg.sender, "not booster");
    _;
  }

  /***************
   * Constructor *
   ***************/

  function _initialize() internal {
    booster = msg.sender;
  }

  /*************************
   * Public View Functions *
   *************************/

  /// @inheritdoc ILiquidityStaking
  function claimable(address _account) external view override returns (uint256) {
    PoolRewardInfo memory _poolInfo = poolRewards;
    uint256 _supply = _totalSupply();

    uint256 _currentTime = _poolInfo.finishAt;
    if (_currentTime > block.timestamp) _currentTime = block.timestamp;
    uint256 _duration = _currentTime >= _poolInfo.lastUpdate ? _currentTime - _poolInfo.lastUpdate : 0;
    if (_duration > 0 && _supply > 0) {
      _poolInfo.accRewardPerShare = _poolInfo.accRewardPerShare.add(
        _duration.mul(_poolInfo.rate).mul(REWARD_PRECISION) / _supply
      );
    }

    return _claimable(accountRewards[_account], _balanceOf(_account), _poolInfo.accRewardPerShare);
  }

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @inheritdoc ILiquidityStaking
  function claim() external override {
    claim(msg.sender, msg.sender);
  }

  /// @inheritdoc ILiquidityStaking
  function claim(address _account) external override {
    claim(_account, _account);
  }

  /// @inheritdoc ILiquidityStaking
  function claim(address _account, address _recipient) public override {
    if (_account != msg.sender) {
      require(_account == _recipient, "forbid claim other to other");
    }

    _checkpoint(_account);

    _claim(_account, _recipient);
  }

  /// @inheritdoc ILiquidityStaking
  function checkpoint(address _account) external override {
    _checkpoint(_account);
  }

  /// @inheritdoc ILiquidityStaking
  function queueNewRewards(uint256 amount) external override onlyBooster {}

  /// @notice Change the address of booster.
  /// @param _newBooster The address of new booster.
  function newBooster(address _newBooster) external onlyBooster {
    booster = _newBooster;
  }

  /**********************
   * Internal Functions *
   **********************/

  /// @dev Internal function to checkpoint user state change.
  /// @param _account The address of user to update.
  function _checkpoint(address _account) internal {
    // 1. update pool information
    PoolRewardInfo memory _poolInfo = poolRewards;
    uint256 _currentTime = _poolInfo.finishAt;
    if (_currentTime > block.timestamp) {
      _currentTime = block.timestamp;
    }
    uint256 _duration = _currentTime >= _poolInfo.lastUpdate ? _currentTime - _poolInfo.lastUpdate : 0;
    if (_duration > 0) {
      uint256 _supply = _totalSupply();
      _poolInfo.lastUpdate = uint64(block.timestamp);
      if (_supply > 0) {
        _poolInfo.accRewardPerShare = _poolInfo.accRewardPerShare.add(
          _duration.mul(_poolInfo.rate).mul(REWARD_PRECISION) / _supply
        );
        require(_poolInfo.accRewardPerShare <= uint160(-1), "acc per share overflow");
      }
      poolRewards = _poolInfo;
    }

    // 2. update user information
    if (_account != address(0)) {
      AccountRewardInfo memory _userInfo = accountRewards[_account];
      uint256 _rewards = _claimable(_userInfo, _balanceOf(_account), _poolInfo.accRewardPerShare);
      require(_rewards <= uint96(-1), "account rewards overflow");

      // update only when there are changes.
      if (_rewards != _userInfo.rewards || _poolInfo.accRewardPerShare != _userInfo.rewardPerSharePaid) {
        _userInfo.rewards = uint96(_rewards);
        _userInfo.rewardPerSharePaid = uint160(_poolInfo.accRewardPerShare);
        accountRewards[_account] = _userInfo;
      }
    }
  }

  /// @dev Internal function to notify harvested rewards.
  /// @param _amount The amount of harvested rewards.
  function _notifyRewardAmount(uint256 _amount) internal {
    if (_amount == 0) return;

    _checkpoint(address(0));

    PoolRewardInfo memory _info = poolRewards;

    if (block.timestamp >= _info.finishAt) {
      _info.rate = uint128(_amount / WEEK);
    } else {
      uint256 _remaining = _info.finishAt - block.timestamp;
      uint256 _leftover = _remaining * _info.rate;
      _info.rate = uint128((_amount + _leftover) / WEEK);
    }

    _info.lastUpdate = uint64(block.timestamp);
    _info.finishAt = uint64(block.timestamp + WEEK);

    poolRewards = _info;
  }

  /// @dev Internal function to return the amount of pending rewards.
  /// @param _info The account reward information.
  /// @param _balance The balance of the account.
  /// @param _accRewardPerShare Hint used to compute rewards.
  function _claimable(
    AccountRewardInfo memory _info,
    uint256 _balance,
    uint256 _accRewardPerShare
  ) internal pure returns (uint256) {
    return
      uint256(_info.rewards).add(_accRewardPerShare.sub(_info.rewardPerSharePaid).mul(_balance) / REWARD_PRECISION);
  }

  /// @dev Internal function to claim pending rewards.
  /// @param _account The address of account to claim.
  /// @param _recipient The address recipient who will receive the pending rewards.
  function _claim(address _account, address _recipient) internal {
    uint256 _rewards = accountRewards[_account].rewards;
    if (_rewards > 0) {
      address _token = _rewardToken();
      accountRewards[_account].rewards = 0;
      IERC20Upgradeable(_token).safeTransfer(_recipient, _rewards);

      emit Claim(_token, _account, _recipient, _rewards);
    }
  }

  /// @dev Return the address of reward token.
  function _rewardToken() internal view virtual returns (address);

  /// @dev Return the total amount of staked token.
  function _totalSupply() internal view virtual returns (uint256);

  /// @dev Return the amount of staked token.
  /// @param _account The address of user to query.
  function _balanceOf(address _account) internal view virtual returns (uint256);
}
