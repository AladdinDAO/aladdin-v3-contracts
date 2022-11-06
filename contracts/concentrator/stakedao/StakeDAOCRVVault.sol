// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;
pragma abicoder v2;

import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/SafeERC20Upgradeable.sol";

import "./StakeDAOVaultBase.sol";

// solhint-disable not-rely-on-time

contract StakeDAOCRVVault is StakeDAOVaultBase {
  using SafeERC20Upgradeable for IERC20Upgradeable;

  /// @notice Emmited when someone withdraw staking token from contract.
  /// @param _owner The address of the owner of the staking token.
  /// @param _recipient The address of the recipient of the locked staking token.
  /// @param _amount The amount of staking token withdrawn.
  /// @param _expiredAt The timestamp in second then the lock expired
  event Lock(address indexed _owner, address indexed _recipient, uint256 _amount, uint256 _expiredAt);

  /// @notice Emitted when someone withdraw expired locked staking token.
  /// @param _owner The address of the owner of the locked staking token.
  /// @param _recipient The address of the recipient of the staking token.
  /// @param _amount The amount of staking token withdrawn.
  event WithdrawExpired(address indexed _owner, address indexed _recipient, uint256 _amount);

  /// @notice Emitted when the withdraw lock time is updated.
  /// @param _withdrawLockTime The new withdraw lock time in seconds.
  event UpdateWithdrawLockTime(uint256 _withdrawLockTime);

  /// @notice Emitted when someone harvest pending sdCRV bribe rewards.
  /// @param _token The address of the reward token.
  /// @param _reward The amount of harvested rewards.
  /// @param _platformFee The amount of platform fee taken.
  /// @param _boostFee The amount SDT for veSDT boost delegation fee.
  event HarvestBribe(address _token, uint256 _reward, uint256 _platformFee, uint256 _boostFee);

  /// @dev Compiler will pack this into single `uint256`.
  struct LockedBalance {
    // The amount of staking token locked.
    uint128 amount;
    // The timestamp in seconds when the lock expired.
    uint128 expireAt;
  }

  /// @dev The minimum number of seconds needed to lock.
  uint256 private constant MIN_WITHDRAW_LOCK_TIME = 86400;

  /// @notice The number of seconds to lock for withdrawing assets from the contract.
  uint256 public withdrawLockTime;

  /// @dev Mapping from user address to list of locked staking tokens.
  mapping(address => LockedBalance[]) private locks;

  /// @dev Mapping from user address to next index in `LockedBalance` lists.
  mapping(address => uint256) private nextLockIndex;

  /********************************** Constructor **********************************/

  constructor(address _stakeDAOProxy, address _delegation) StakeDAOVaultBase(_stakeDAOProxy, _delegation) {}

  function _initialize(address _gauge, uint256 _withdrawLockTime) external initializer {
    require(_withdrawLockTime >= MIN_WITHDRAW_LOCK_TIME, "lock time too small");

    StakeDAOVaultBase._initialize(_gauge);

    withdrawLockTime = _withdrawLockTime;
  }

  /********************************** View Functions **********************************/

  /// @notice Return the list of locked staking token in the contract.
  /// @param _user The address of user to query.
  function getUserLocks(address _user) external view returns (LockedBalance[] memory _locks) {
    uint256 _nextIndex = nextLockIndex[_user];
    uint256 _length = locks[_user].length;
    _locks = new LockedBalance[](_length - _nextIndex);
    for (uint256 i = _nextIndex; i < _length; i++) {
      _locks[i - _nextIndex] = locks[_user][i];
    }
  }

  /********************************** Mutated Functions **********************************/

  /// @inheritdoc IStakeDAOVault
  function withdraw(uint256 _amount, address _recipient) external override {
    _checkpoint(msg.sender);

    uint256 _balance = userInfo[_recipient].balance;
    if (_amount == uint256(-1)) {
      _amount = _balance;
    }
    require(_amount <= _balance, "insufficient staked token");

    userInfo[_recipient].balance = _balance - _amount;
    totalSupply -= _amount;

    // take withdraw fee here
    uint256 _withdrawFee = feeInfo.withdrawPercentage;
    if (_withdrawFee > 0 && !whitelist[msg.sender]) {
      _withdrawFee = (_amount * _withdrawFee) / FEE_PRECISION;
      withdrawFeeAccumulated += _withdrawFee;
      _amount -= _withdrawFee;
    }

    uint256 _expiredAt = block.timestamp + withdrawLockTime;
    locks[_recipient].push(LockedBalance({ amount: uint128(_amount), expireAt: uint128(_expiredAt) }));

    emit Lock(msg.sender, _recipient, _amount, _expiredAt);

    emit Withdraw(msg.sender, _recipient, _amount, _withdrawFee);
  }

  /// @notice Withdraw all expired locks from contract.
  /// @param _user The address of user to withdraw.
  /// @param _recipient The address of recipient who will receive the token.
  /// @return _amount The amount of staking token withdrawn.
  function withdrawExpired(address _user, address _recipient) external returns (uint256 _amount) {
    if (_user != msg.sender) {
      require(_recipient == _user, "withdraw from others to others");
    }

    LockedBalance[] storage _locks = locks[_user];
    uint256 _nextIndex = nextLockIndex[_user];
    uint256 _length = _locks.length;
    while (_nextIndex < _length) {
      LockedBalance memory _lock = _locks[_nextIndex];
      if (_lock.expireAt > block.timestamp) break;
      _amount += _lock.amount;

      delete _locks[_nextIndex]; // clear to refund gas
      _nextIndex += 1;
    }
    nextLockIndex[_user] = _nextIndex;

    IStakeDAOLockerProxy(stakeDAOProxy).withdraw(gauge, stakingToken, _amount, _recipient);

    emit WithdrawExpired(_user, _recipient, _amount);
  }

  /// @notice Harvest sdCRV bribes.
  /// @dev No harvest bounty when others call this function.
  /// @param _claims The claim parameters passing to StakeDAOMultiMerkleStash contract.
  function harvestBribes(IStakeDAOMultiMerkleStash.claimParam[] memory _claims) external {
    IStakeDAOLockerProxy(stakeDAOProxy).claimBribeRewards(_claims, address(this));

    FeeInfo memory _fee = feeInfo;
    uint256[] memory _amounts = new uint256[](_claims.length);
    address[] memory _tokens = new address[](_claims.length);
    for (uint256 i = 0; i < _claims.length; i++) {
      address _token = _claims[i].token;
      uint256 _reward = _claims[i].amount;
      uint256 _platformFee = _fee.platformPercentage;
      uint256 _boostFee = _fee.boostPercentage;

      // Currently, we will only receive SDT as bribe rewards.
      // If there are other tokens, we will transfer all of them to platform contract.
      if (_token != SDT) {
        _platformFee = FEE_PRECISION;
        _boostFee = 0;
      }
      if (_platformFee > 0) {
        _platformFee = (_reward * _platformFee) / FEE_PRECISION;
        IERC20Upgradeable(_token).safeTransfer(_fee.platform, _platformFee);
      }
      if (_boostFee > 0) {
        _boostFee = (_reward * _boostFee) / FEE_PRECISION;
        IERC20Upgradeable(_token).safeTransfer(delegation, _boostFee);
      }
      emit HarvestBribe(_token, _reward, _platformFee, _boostFee);

      _amounts[i] = _reward - _platformFee - _boostFee;
      _tokens[i] = _token;
    }
    _distribute(_tokens, _amounts);
  }

  /********************************** Restricted Functions **********************************/

  /// @notice Update the withdraw lock time.
  /// @param _withdrawLockTime The new withdraw lock time in seconds.
  function updateWithdrawLockTime(uint256 _withdrawLockTime) external onlyOwner {
    require(_withdrawLockTime >= MIN_WITHDRAW_LOCK_TIME, "lock time too small");

    withdrawLockTime = _withdrawLockTime;

    emit UpdateWithdrawLockTime(_withdrawLockTime);
  }

  /********************************** Internal Functions **********************************/

  /// @inheritdoc StakeDAOVaultBase
  function _checkpoint(address _user) internal override returns (bool) {
    bool _hasSDT = StakeDAOVaultBase._checkpoint(_user);
    if (!_hasSDT) {
      _checkpoint(SDT, userInfo[_user], userInfo[_user].balance);
    }
    return true;
  }
}
