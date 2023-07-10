// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;
pragma abicoder v2;

import { OwnableUpgradeable } from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import { SafeMathUpgradeable } from "@openzeppelin/contracts-upgradeable/math/SafeMathUpgradeable.sol";
import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import { SafeERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/SafeERC20Upgradeable.sol";

import { IMarket } from "./interfaces/IMarket.sol";
import { IStabilityPool } from "./interfaces/IStabilityPool.sol";
import { ITokenWrapper } from "./interfaces/ITokenWrapper.sol";
import { ITreasury } from "./interfaces/ITreasury.sol";

// solhint-disable not-rely-on-time
// solhint-disable max-states-count

/// @notice This contract use a modified version of Liquity's StabilityPool.
///
/// @dev see the original contract here: https://github.com/liquity/dev/blob/main/packages/contracts/contracts/StabilityPool.sol
///
/// @dev There are 4 events:
/// + deposit some asset at t[i]
/// + withdraw some asset at t[i]
/// + liquidate at t[i]
/// + distribute reward token at t[i]
///
/// The amount of asset left after n liquidation is:
///   + d[n] = d[0] * (1 - L[1]/D[0]) * (1 - L[2]/D[1]) * ... * (1 - L[n]/D[n-1])
///   + D[i] = D[i-1] - L[i]
/// where
///   + d[0] is the initial deposited amount of a user
///   + L[i] is the amount of liquidated asset at t[i]
///   + D[i] is the total amount of asset at a[i]
/// So we need to maintain the following variables:
///   + D[i] = D[i-1] - L[i]
///   + P[i] = P[i-1] * (1 - L[i]/D[i-1])
///
/// The amount of reward token gained after n distribution is:
///   + gain = d[0] * E[1]/D[0] + d[1] * E[2]/D[1] + ... + d[n-1]*E[n]/D[n-1]
///   + d[i] = d[i-1]*(1 - L[i]/D[i-1]) = d[0] * P[i-1]
///   + D[i] = D[i-1] - L[i]
/// So we need to maintain the flowing variables:
///   + D[i] = D[i-1] - L[i]
///   + P[i] = P[i-1] * (1 - L[i]/D[i-1])
///   + S[i] = S[i-1] * E[i]/D[i-1]*P[i-1]
///
/// There are possibilities the the value of P[i] becomes a very small nonzero number. In Solidity, the floor
/// division will make it become zero. So, to track P accurately, we use a scale factor:
///   if a liquidation would cause P to decrease to <1e-9 (and be rounded to 0 by Solidity), we first multiply P
///   by 1e9, and increment a currentScale factor by 1.
///
/// The added benefit of using 1e9 for the scale factor (rather than 1e18) is that it ensures negligible precision
/// loss close to the scale boundary: when P is at its minimum value of 1e9, the relative precision loss in P due
/// to floor division is only on the order of 1e-9.
///
/// There are possibilities that all assets are liquidated. In such case, we will reset the P[i] to 1, scale[i] = 0,
/// and increase current epoch by 1.
contract StabilityPool is OwnableUpgradeable, IStabilityPool {
  using SafeERC20Upgradeable for IERC20Upgradeable;
  using SafeMathUpgradeable for uint256;

  /**********
   * Events *
   **********/

  /// @notice Emitted when the address of liquidator is updated.
  /// @param liquidator The new address of liquidator.
  event UpdateLiquidator(address liquidator);

  /// @notice Emitted when the address of reward wrapper is updated.
  /// @param wrapper The new address of reward wrapper.
  event UpdateWrapper(address wrapper);

  /// @notice Emitted when the liquidatable collateral ratio is updated.
  /// @param liquidatableCollateralRatio The new liquidatable collateral ratio.
  event UpdateLiquidatableCollateralRatio(uint256 liquidatableCollateralRatio);

  /// @notice Emitted when the unlock duration is updated.
  /// @param unlockDuration The new unlock duration in seconds.
  event UpdateUnlockDuration(uint256 unlockDuration);

  /// @notice Emitted when a new reward token is added.
  /// @param token The address of the token.
  /// @param manager The manager of the reward token.
  /// @param periodLength The period length for reward distribution.
  event AddRewardToken(address token, address manager, uint256 periodLength);

  /// @notice Emitted when the reward token distribution is update.
  /// @param token The address of the token.
  /// @param manager The new manager of the reward token.
  /// @param periodLength The new period length for reward distribution.
  event UpdateRewardToken(address token, address manager, uint256 periodLength);

  /*************
   * Constants *
   *************/

  /// @dev The precison use to calculation.
  uint256 private constant PRECISION = 1e18;

  /// @dev The scale factor.
  uint256 private constant SCALE_FACTOR = 1e9;

  /// @dev The number of seconds in one day.
  uint256 private constant DAY = 1 days;

  /***********
   * Structs *
   ***********/

  /// @dev Compiler will pack this into single `uint256`.
  struct RewardState {
    // The current reward rate per second.
    uint128 rate;
    // The length of reward period in seconds.
    // If the value is zero, the reward will be distributed immediately.
    uint32 periodLength;
    uint48 lastUpdate;
    uint48 finishAt;
    // The number of rewards queued.
    uint256 queued;
  }

  /// @dev Compiler will pack this into single `uint256`.
  struct EpochState {
    // With each offset that fully empties the Pool, the epoch is incremented by 1
    uint64 epoch;
    // Each time the scale of P shifts by SCALE_FACTOR, the scale is incremented by 1
    uint64 scale;
    // Running product by which to multiply an initial deposit, in order to find the current compounded deposit,
    // after a series of liquidations have occurred, each of which cancel some LUSD debt with the deposit.
    //
    // During its lifetime, a deposit's value evolves from d_t to d_t * P / P_t , where P_t
    // is the snapshot of P taken at the instant the deposit was made. 18-digit decimal.
    uint128 prod;
  }

  /// @dev Compiler will pack this into two `uint256`.
  struct UserSnapshot {
    // The initial amount of asset deposited.
    uint256 initialDeposit;
    // The epoch state snapshot at depositing.
    EpochState epoch;
    // The reward state snapshot at depositing.
    mapping(address => uint256) sum;
    // Mapping from token address to the amount of pending rewards.
    mapping(address => uint256) pending;
  }

  /// @dev Compiler will pack this into two `uint256`.
  struct UserUnlock {
    // The initial amount of asset unlocking.
    uint128 initialAmount;
    // The timestamp in seconds when the assets unlocked.
    uint128 unlockAt;
    // The epoch state snapshot at unlocking.
    EpochState epoch;
  }

  struct UserUnlockItem {
    uint256 amount;
    uint256 unlockAt;
  }

  /*************
   * Variables *
   *************/

  /// @notice The address of treasury contract.
  address public treasury;

  /// @notice The address of market contract.
  address public market;

  /// @notice The address of base token.
  address public baseToken;

  /// @inheritdoc IStabilityPool
  address public override asset;

  /// @inheritdoc IStabilityPool
  uint256 public override totalSupply;

  /// @notice The total amount of assets unlocked.
  uint256 public totalUnlocking;

  /// @notice The address of liquidator.
  address public liquidator;

  /// @notice The maximum collateral ratio to call liquidate.
  uint256 public liquidatableCollateralRatio;

  /// @notice The address of token wrapper for liquidated base token;
  address public wrapper;

  /// @notice The address list of reward tokens.
  address[] public rewards;

  /// @notice Mapping from the address of reward token to corresponding reward manager.
  mapping(address => address) public rewardManager;

  /// @notice Mapping from the address of token to reward distribution information.
  mapping(address => RewardState) public rewardState;

  // Mapping from epoch to scale to accumulated sum.
  // - The inner mapping records the sum S at different scales
  // - The outer mapping records the (scale => sum) mappings, for different epochs.
  mapping(address => mapping(uint256 => mapping(uint256 => uint256))) public epochToScaleToSum;

  /// @notice The state of current epoch for all deposited.
  EpochState public epochState;

  /// @dev Mapping from user address to user snapshot.
  mapping(address => UserSnapshot) private snapshots;

  /// @notice The number of seconds needed for unlocking.
  uint256 public unlockDuration;

  /// @dev Mapping from user address to next unlock index in user unlocks.
  mapping(address => uint256) private nextUnlockIndex;

  /// @dev Mapping from user address to a list of unlocks.
  mapping(address => UserUnlock[]) private unlocks;

  /// @notice Error trackers for the error correction in the loss calculation.
  uint256 public lastAssetLossError;

  /************
   * Modifier *
   ************/

  modifier onlyRewardManager(address _token) {
    require(rewardManager[_token] == msg.sender, "only reward manager");
    _;
  }

  /***************
   * Constructor *
   ***************/

  function initialize(address _treasury, address _market) external initializer {
    OwnableUpgradeable.__Ownable_init();

    treasury = _treasury;
    market = _market;

    baseToken = ITreasury(_treasury).baseToken();
    asset = ITreasury(_treasury).fToken();
    wrapper = address(this);
    unlockDuration = 14 * DAY;

    epochState.prod = uint128(PRECISION);
  }

  /*************************
   * Public View Functions *
   *************************/

  /// @notice Return the number of reward tokens.
  function rewardsLength() external view returns (uint256) {
    return rewards.length;
  }

  /// @inheritdoc IStabilityPool
  function balanceOf(address _account) public view override returns (uint256) {
    uint256 initialDeposit = snapshots[_account].initialDeposit;
    if (initialDeposit == 0) {
      return 0;
    }

    EpochState memory snapshot = snapshots[_account].epoch;

    uint256 compoundedDeposit = _getCompoundedStakeFromSnapshots(initialDeposit, snapshot);
    return compoundedDeposit;
  }

  /// @inheritdoc IStabilityPool
  function unlockedBalanceOf(address account) external view override returns (uint256) {
    UserUnlock[] storage _lists = unlocks[account];

    uint256 length = _lists.length;
    uint256 balance;
    for (uint256 i = nextUnlockIndex[account]; i < length; i++) {
      UserUnlock memory _item = _lists[i];
      if (_item.unlockAt <= block.timestamp) {
        balance += _getCompoundedStakeFromSnapshots(_item.initialAmount, _item.epoch);
      }
    }

    return balance;
  }

  /// @inheritdoc IStabilityPool
  function unlockingBalanceOf(address account) external view override returns (uint256) {
    UserUnlock[] storage _lists = unlocks[account];

    uint256 length = _lists.length;
    uint256 balance;
    for (uint256 i = nextUnlockIndex[account]; i < length; i++) {
      UserUnlock memory _item = _lists[i];
      if (_item.unlockAt > block.timestamp) {
        balance += _getCompoundedStakeFromSnapshots(_item.initialAmount, _item.epoch);
      }
    }

    return balance;
  }

  /// @notice Return the list of unlocking items.
  /// @param account The address of account to query.
  function unlockingList(address account) external view returns (UserUnlockItem[] memory _items) {
    UserUnlock[] storage _lists = unlocks[account];
    uint256 _startIndex = nextUnlockIndex[account];
    uint256 _length = _lists.length;

    _items = new UserUnlockItem[](_length - _startIndex);
    for (uint256 i = _startIndex; i < _length; i++) {
      UserUnlock memory _item = _lists[i];
      uint256 _balance = _getCompoundedStakeFromSnapshots(_item.initialAmount, _item.epoch);
      _items[i] = UserUnlockItem(_balance, _item.unlockAt);
    }
  }

  /// @inheritdoc IStabilityPool
  function claimable(address _account, address _token) public view override returns (uint256) {
    uint256 initialDeposit = snapshots[_account].initialDeposit;
    if (initialDeposit == 0) return 0;

    return
      snapshots[_account].pending[_token].add(
        _getGainFromSnapshots(
          initialDeposit,
          snapshots[_account].sum[_token],
          snapshots[_account].epoch,
          epochToScaleToSum[_token]
        )
      );
  }

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @inheritdoc IStabilityPool
  function deposit(uint256 _amount, address _recipient) external override {
    // transfer asset token to this contract
    address _asset = asset;
    if (_amount == uint256(-1)) {
      _amount = IERC20Upgradeable(_asset).balanceOf(msg.sender);
    }
    require(_amount > 0, "deposit zero amount");
    IERC20Upgradeable(_asset).safeTransferFrom(msg.sender, address(this), _amount);

    // distribute pending rewards
    _distributeRewards(_recipient);

    // update deposit snapshot
    // @note the snapshot is updated in _distributeRewards once, the value of initialDeposit is correct.
    uint256 _compoundedDeposit = snapshots[_recipient].initialDeposit;
    uint256 _newDeposit = _compoundedDeposit.add(_amount);
    emit UserDepositChange(_recipient, _newDeposit, 0);

    _updateAccountSnapshot(_recipient, _newDeposit);

    totalSupply = totalSupply.add(_amount);

    emit UserDepositChange(_recipient, _newDeposit, 0);

    emit Deposit(msg.sender, _recipient, _amount);
  }

  /// @inheritdoc IStabilityPool
  function unlock(uint256 _amount) external override {
    require(_amount > 0, "unlock zero amount");
    require(snapshots[msg.sender].initialDeposit > 0, "user has no deposit");

    // distribute pending rewards
    _distributeRewards(msg.sender);

    // update deposit snapshot
    // @note the snapshot is updated in _distributeRewards once, the value of initialDeposit is correct.
    uint256 _compoundedDeposit = snapshots[msg.sender].initialDeposit;
    if (_amount > _compoundedDeposit) {
      _amount = _compoundedDeposit;
    }
    uint256 _newDeposit = _compoundedDeposit.sub(_amount);
    emit UserDepositChange(msg.sender, _newDeposit, 0);

    _updateAccountSnapshot(msg.sender, _newDeposit);

    // add to unlock list
    UserUnlock[] storage _lists = unlocks[msg.sender];
    uint256 length = _lists.length;
    // roundup to nearest day
    uint256 unlockAt = ((block.timestamp + unlockDuration + DAY - 1) / DAY) * DAY;
    if (length == nextUnlockIndex[msg.sender] || _lists[length - 1].unlockAt != unlockAt) {
      // list is empty or unlock time mismatch
      _lists.push(UserUnlock({ initialAmount: uint128(_amount), unlockAt: uint128(unlockAt), epoch: epochState }));
    } else {
      // merge items with same unlock time
      UserUnlock memory item = _lists[length - 1];
      uint256 compoundedUnlock = _getCompoundedStakeFromSnapshots(item.initialAmount, item.epoch);
      item.initialAmount = uint128(compoundedUnlock.add(_amount));
      item.epoch = epochState;
      _lists[length - 1] = item;
    }

    totalSupply = totalSupply.sub(_amount);
    totalUnlocking = totalUnlocking.add(_amount);

    emit Unlock(msg.sender, _amount, unlockAt);
  }

  /// @inheritdoc IStabilityPool
  function withdrawUnlocked(bool _doClaim, bool _unwrap) external override {
    // distribute pending rewards
    _distributeRewards(msg.sender);

    // withdraw unlocked
    _withdrawUnlocked(msg.sender);

    if (_doClaim) {
      // claim all rewards
      uint256 length = rewards.length;
      for (uint256 i = 0; i < length; i++) {
        _claim(msg.sender, rewards[i], _unwrap);
      }
    }
  }

  /// @inheritdoc IStabilityPool
  function claim(address _token, bool _unwrap) external override {
    // distribute pending rewards
    _distributeRewards(msg.sender);

    // claim single token
    _claim(msg.sender, _token, _unwrap);
  }

  /// @inheritdoc IStabilityPool
  function claim(address[] memory _tokens, bool _unwrap) external override {
    // distribute pending rewards
    _distributeRewards(msg.sender);

    // claim multiple tokens
    for (uint256 i = 0; i < _tokens.length; i++) {
      _claim(msg.sender, _tokens[i], _unwrap);
    }
  }

  /// @inheritdoc IStabilityPool
  function liquidate(uint256 _maxAmount, uint256 _minBaseOut)
    external
    override
    returns (uint256 _liquidated, uint256 _baseOut)
  {
    require(liquidator == msg.sender, "only liquidator");

    // distribute pending rewards
    _distributeRewards(address(this));

    ITreasury _treasury = ITreasury(treasury);

    require(_treasury.collateralRatio() < liquidatableCollateralRatio, "cannot liquidate");
    (, uint256 _maxLiquidatable) = _treasury.maxRedeemableFToken(liquidatableCollateralRatio);

    uint256 _amount = _maxLiquidatable;
    if (_amount > _maxAmount) {
      _amount = _maxAmount;
    }

    address _asset = asset;
    address _market = market;
    address _wrapper = wrapper;

    _liquidated = IERC20Upgradeable(_asset).balanceOf(address(this));
    if (_amount > _liquidated) {
      _amount = _liquidated;
    }
    IERC20Upgradeable(_asset).safeApprove(_market, 0);
    IERC20Upgradeable(_asset).safeApprove(_market, _amount);

    _baseOut = IMarket(_market).redeem(_amount, 0, _wrapper, _minBaseOut);
    _liquidated = _liquidated.sub(IERC20Upgradeable(_asset).balanceOf(address(this)));

    emit Liquidate(_liquidated, _baseOut);

    // @note If we accumulate rewards after loss notification, the reward accumulation would be incorrect.
    // If we distribute rewards linearly, the the reward accumulation would also be incorrect.
    // Thus, we distribute pending base token intermediately and then notify possible loss.
    if (_wrapper != address(this)) {
      _amount = ITokenWrapper(_wrapper).wrap(_baseOut);
      _accumulateRewards(ITokenWrapper(_wrapper).dst(), _amount);
    } else {
      _accumulateRewards(baseToken, _baseOut);
    }

    // notify liquidation loss
    _notifyLoss(_liquidated);
  }

  /// @inheritdoc IStabilityPool
  function updateAccountSnapshot(address _account) external override {
    // distribute pending rewards
    _distributeRewards(_account);
  }

  /// @inheritdoc IStabilityPool
  function depositReward(address _token, uint256 _amount) external override onlyRewardManager(_token) {
    uint256 _balance = IERC20Upgradeable(_token).balanceOf(address(this));
    IERC20Upgradeable(_token).safeTransferFrom(msg.sender, address(this), _amount);
    _amount = IERC20Upgradeable(_token).balanceOf(address(this)).sub(_balance);
    require(_amount > 0, "reward amount zero");

    _distributeReward(_token);

    _notifyReward(_token, _amount);
  }

  /************************
   * Restricted Functions *
   ************************/

  /// @notice Update the address of liquidator.
  /// @param _liquidator The new address of liquidator.
  function updateLiquidator(address _liquidator) external onlyOwner {
    liquidator = _liquidator;

    emit UpdateLiquidator(_liquidator);
  }

  /// @notice Update the address of reward wrapper.
  /// @param _wrapper The new address of reward wrapper.
  function updateWrapper(address _wrapper) external onlyOwner {
    wrapper = _wrapper;

    emit UpdateWrapper(_wrapper);
  }

  /// @notice Update the collateral ratio line for liquidation.
  /// @param _liquidatableCollateralRatio The new liquidatable collateral ratio.
  function updateLiquidatableCollateralRatio(uint256 _liquidatableCollateralRatio) external onlyOwner {
    liquidatableCollateralRatio = _liquidatableCollateralRatio;

    emit UpdateLiquidatableCollateralRatio(_liquidatableCollateralRatio);
  }

  /// @notice Update the unlock duration after unlocking.
  /// @param _unlockDuration The new unlock duration in second.
  function updateUnlockDuration(uint256 _unlockDuration) external onlyOwner {
    require(_unlockDuration >= DAY, "unlock duration too small");

    unlockDuration = _unlockDuration;

    emit UpdateUnlockDuration(_unlockDuration);
  }

  /// @notice Add a new reward token to this contract.
  /// @param _token The address of the reward token.
  /// @param _manager The address of reward token manager.
  /// @param _periodLength The length of distribution period.
  function addReward(
    address _token,
    address _manager,
    uint32 _periodLength
  ) external onlyOwner {
    require(rewardManager[_token] == address(0), "duplicated reward token");
    require(_manager != address(0), "zero manager address");
    require(_periodLength > 0, "zero period length");

    rewardManager[_token] = _manager;
    rewardState[_token].periodLength = _periodLength;
    rewards.push(_token);

    emit AddRewardToken(_token, _manager, _periodLength);
  }

  /// @notice Update the reward distribution for some reward token.
  /// @param _token The address of the reward token.
  /// @param _manager The address of reward token manager.
  /// @param _periodLength The length of distribution period.
  function updateReward(
    address _token,
    address _manager,
    uint32 _periodLength
  ) external onlyOwner {
    require(_manager != address(0), "zero manager address");
    require(_periodLength > 0, "zero period length");
    require(rewardManager[_token] != address(0), "no such reward token");

    _distributeReward(_token);

    rewardManager[_token] = _manager;
    rewardState[_token].periodLength = _periodLength;

    emit UpdateRewardToken(_token, _manager, _periodLength);
  }

  /**********************
   * Internal Functions *
   **********************/

  /// @dev Internal function to distribute pending rewards.
  function _distributeRewards(address _account) internal {
    uint256 length = rewards.length;
    for (uint256 i = 0; i < length; i++) {
      _distributeReward(rewards[i]);
    }

    if (_account != address(0)) {
      _updateAccountRewards(_account);
    }
  }

  /// @dev Internal function to distribute pending rewards for a specific token.
  /// @param _token The address of the token.
  function _distributeReward(address _token) internal {
    RewardState memory _state = rewardState[_token];

    uint256 _currentTime = _state.finishAt;
    if (_currentTime > block.timestamp) {
      _currentTime = block.timestamp;
    }
    uint256 _duration = _currentTime >= _state.lastUpdate ? _currentTime - _state.lastUpdate : 0;
    if (_duration > 0) {
      _state.lastUpdate = uint48(block.timestamp);

      uint256 _pending = _duration.mul(_state.rate);

      if (totalSupply > 0) {
        _accumulateRewards(_token, _pending);
      } else {
        // queue rewards if no assets deposited or all assets are liquidated.
        _state.queued = _state.queued.add(_pending);
      }

      rewardState[_token] = _state;
    }
  }

  /// @dev Internal function to update account reward accumulation.
  /// @param _account The address of user to update.
  function _updateAccountRewards(address _account) internal {
    uint256 _initialDeposit = snapshots[_account].initialDeposit;
    if (_initialDeposit == 0) return;

    EpochState memory _currentEpoch = epochState;

    uint256 length = rewards.length;
    for (uint256 i = 0; i < length; i++) {
      address _token = rewards[i];
      snapshots[_account].pending[_token] = claimable(_account, _token);
      snapshots[_account].sum[_token] = epochToScaleToSum[_token][_currentEpoch.epoch][_currentEpoch.scale];
    }

    uint256 _compoundedAsset = _getCompoundedStakeFromSnapshots(_initialDeposit, snapshots[_account].epoch);
    if (_compoundedAsset != _initialDeposit) {
      emit UserDepositChange(_account, _compoundedAsset, _initialDeposit.sub(_compoundedAsset));
      snapshots[_account].initialDeposit = _compoundedAsset;
    }

    snapshots[_account].epoch = _currentEpoch;
  }

  /// @dev Internal function to update account snapshot, including epoch state and reward accumulation.
  /// @param _account The address of user to update.
  function _updateAccountSnapshot(address _account, uint256 _newDeposit) internal {
    snapshots[_account].initialDeposit = _newDeposit;

    if (_newDeposit == 0) {
      delete snapshots[_account].epoch;
      return;
    }

    EpochState memory _currentEpoch = epochState;

    uint256 length = rewards.length;
    for (uint256 i = 0; i < length; i++) {
      address _token = rewards[i];
      snapshots[_account].sum[_token] = epochToScaleToSum[_token][_currentEpoch.epoch][_currentEpoch.scale];
    }

    snapshots[_account].epoch = _currentEpoch;
  }

  /// @dev Internal function to deposit pending rewards
  /// @param _token The address of token to update.
  /// @param _amount The amount of pending rewards.
  function _notifyReward(address _token, uint256 _amount) internal {
    RewardState memory _state = rewardState[_token];

    emit DepositReward(_token, _amount);

    if (totalSupply == 0) {
      // no asset deposited, queue pending rewards
      _state.queued = _state.queued.add(_amount);
    } else {
      _amount = _amount.add(_state.queued);
      _state.queued = 0;

      // distribute linearly
      if (block.timestamp >= _state.finishAt) {
        _state.rate = uint128(_amount / _state.periodLength);
      } else {
        uint256 _remaining = _state.finishAt - block.timestamp;
        uint256 _leftover = _remaining * _state.rate;
        _state.rate = uint128((_amount + _leftover) / _state.periodLength);
      }

      _state.lastUpdate = uint48(block.timestamp);
      _state.finishAt = uint48(block.timestamp + _state.periodLength);
    }

    rewardState[_token] = _state;
  }

  /// @dev Internal function to accumulate pending rewards.
  /// @param _token The address of token.
  /// @param _pending The amount of pending rewards.
  function _accumulateRewards(address _token, uint256 _pending) internal {
    uint256 _rewardsPerUnitStaked = _pending.mul(PRECISION).div(totalSupply);

    EpochState memory _currentEpoch = epochState;

    uint256 _currentSum = epochToScaleToSum[_token][_currentEpoch.epoch][_currentEpoch.scale];
    _currentSum = _currentSum.add(_rewardsPerUnitStaked.mul(epochState.prod));
    epochToScaleToSum[_token][_currentEpoch.epoch][_currentEpoch.scale] = _currentSum;
  }

  /// @dev Internal function to reduce asset loss due to liquidation.
  /// @param _loss The amount of asset used by liquidation.
  function _notifyLoss(uint256 _loss) internal {
    uint256 _totalSupply = totalSupply;
    uint256 _totalUnlocking = totalUnlocking;
    uint256 _assetLossPerUnitStaked;

    if (_loss == _totalSupply + _totalUnlocking) {
      _assetLossPerUnitStaked = PRECISION;
      lastAssetLossError = 0;
      totalSupply = 0;
      totalUnlocking = 0;
    } else {
      uint256 _lossFromDeposit = _loss.mul(_totalSupply).div(_totalUnlocking + _totalSupply);

      uint256 _lossNumerator = _lossFromDeposit.mul(PRECISION).sub(lastAssetLossError);
      // Add 1 to make error in quotient positive. We want "slightly too much" LUSD loss,
      // which ensures the error in any given compoundedAssetDeposit favors the Stability Pool.
      _assetLossPerUnitStaked = (_lossNumerator.div(_totalSupply)).add(1);
      lastAssetLossError = (_assetLossPerUnitStaked.mul(_totalSupply)).sub(_lossNumerator);

      totalSupply = _totalSupply.sub(_lossFromDeposit);
      totalUnlocking = _totalUnlocking.sub(_loss.sub(_lossFromDeposit));
    }

    // The newProductFactor is the factor by which to change all deposits, due to the depletion of Stability Pool LUSD in the liquidation.
    // We make the product factor 0 if there was a pool-emptying. Otherwise, it is (1 - LUSDLossPerUnitStaked)
    uint256 _newProductFactor = PRECISION.sub(_assetLossPerUnitStaked);

    EpochState memory _currentEpoch = epochState;

    // If the Stability Pool was emptied, increment the epoch, and reset the scale and product P
    if (_newProductFactor == 0) {
      _currentEpoch.epoch += 1;
      _currentEpoch.scale = 0;
      _currentEpoch.prod = uint128(PRECISION);

      // If multiplying P by a non-zero product factor would reduce P below the scale boundary, increment the scale
    } else if (_newProductFactor.mul(_currentEpoch.prod).div(PRECISION) < SCALE_FACTOR) {
      _currentEpoch.prod = uint128(_newProductFactor.mul(_currentEpoch.prod).mul(SCALE_FACTOR).div(PRECISION));
      _currentEpoch.scale += 1;
    } else {
      _currentEpoch.prod = uint128(_newProductFactor.mul(_currentEpoch.prod).div(PRECISION));
    }

    epochState = _currentEpoch;
  }

  /// @dev Internal function claim pending rewards.
  /// @param _account The address of account to claim.
  /// @param _token The address of token to claim.
  /// @param _unwrap Whether the user want to unwrap autocompounding rewards.
  function _claim(
    address _account,
    address _token,
    bool _unwrap
  ) internal {
    uint256 _rewards = snapshots[_account].pending[_token];
    snapshots[_account].pending[_token] = 0;

    address _wrapper = wrapper;
    if (_wrapper != address(this) && _unwrap && _token == ITokenWrapper(_wrapper).dst()) {
      IERC20Upgradeable(_token).safeTransfer(_wrapper, _rewards);
      _rewards = ITokenWrapper(_wrapper).unwrap(_rewards);
      _token = ITokenWrapper(_wrapper).src();
    }

    IERC20Upgradeable(_token).safeTransfer(_account, _rewards);

    emit Claim(_account, _token, _rewards);
  }

  /// @dev Internal function to withdraw unlocked asset.
  /// @param _account The address of user to withdraw.
  function _withdrawUnlocked(address _account) internal {
    UserUnlock[] storage _list = unlocks[_account];
    uint256 length = _list.length;
    uint256 startIndex = nextUnlockIndex[_account];

    uint256 amount;
    uint256 initialAmount;
    // All unlocks are grouped by unlockAt, which aligned to days.
    // So it is ok to use a while loop.
    while (startIndex < length) {
      UserUnlock memory item = _list[startIndex];
      if (item.unlockAt > block.timestamp) break;

      initialAmount = initialAmount.add(item.initialAmount);
      amount = amount.add(_getCompoundedStakeFromSnapshots(item.initialAmount, item.epoch));
      delete _list[startIndex];
      startIndex += 1;
    }

    nextUnlockIndex[_account] = startIndex;

    if (amount > 0) {
      IERC20Upgradeable(asset).safeTransfer(_account, amount);
      totalUnlocking = totalUnlocking.sub(amount);
    }

    emit WithdrawUnlocked(_account, amount, initialAmount.sub(amount));
  }

  /// @dev Internal function to compute the amount of asset deposited after several liquidation.
  /// @param _initialStake The amount of asset deposited initially.
  /// @param _epochSnapshot The epoch state snapshot at initial depositing.
  /// @return _compoundedStake The amount asset deposited after several liquidation.
  function _getCompoundedStakeFromSnapshots(uint256 _initialStake, EpochState memory _epochSnapshot)
    internal
    view
    returns (uint256 _compoundedStake)
  {
    EpochState memory _currentEpoch = epochState;

    // If stake was made before a pool-emptying event, then it has been fully cancelled with debt -- so, return 0
    if (_epochSnapshot.epoch < _currentEpoch.epoch) {
      return 0;
    }

    require(_currentEpoch.scale >= _epochSnapshot.scale, "scale overflow");
    uint256 _scaleDiff = _currentEpoch.scale - _epochSnapshot.scale;

    // Compute the compounded stake. If a scale change in P was made during the stake's lifetime,
    // account for it. If more than one scale change was made, then the stake has decreased by a factor of
    // at least 1e-9 -- so return 0.
    if (_scaleDiff == 0) {
      _compoundedStake = _initialStake.mul(_currentEpoch.prod).div(_epochSnapshot.prod);
    } else if (_scaleDiff == 1) {
      _compoundedStake = _initialStake.mul(_currentEpoch.prod).div(_epochSnapshot.prod).div(SCALE_FACTOR);
    } else {
      _compoundedStake = 0;
    }

    // If compounded deposit is less than a billionth of the initial deposit, return 0.
    //
    // NOTE: originally, this line was in place to stop rounding errors making the deposit too large. However, the error
    // corrections should ensure the error in P "favors the Pool", i.e. any given compounded deposit should slightly less
    // than it's theoretical value.
    //
    // Thus it's unclear whether this line is still really needed.
    if (_compoundedStake < _initialStake.div(1e9)) {
      return 0;
    }

    return _compoundedStake;
  }

  /// @dev Internal function to compute pending rewards after several liquidation or reward distribution.
  /// @param _initialStake The amount of asset deposited initially.
  /// @param _rewardSnapshot The reward sum snapshot at initial depositing.
  /// @param _epochSnapshot The epoch state snapshot at initial depositing.
  /// @param _epochToScaleToSum The storage reference of current reward sum state.
  /// @return _gained The amount of reward gained after several liquidation or reward distribution.
  function _getGainFromSnapshots(
    uint256 _initialStake,
    uint256 _rewardSnapshot,
    EpochState memory _epochSnapshot,
    mapping(uint256 => mapping(uint256 => uint256)) storage _epochToScaleToSum
  ) internal view returns (uint256 _gained) {
    // Grab the sum 'S' from the epoch at which the stake was made. The gain may span up to one scale change.
    // If it does, the second portion of the ETH gain is scaled by 1e9.
    // If the gain spans no scale change, the second portion will be 0.
    uint256 firstPortion = _epochToScaleToSum[_epochSnapshot.epoch][_epochSnapshot.scale].sub(_rewardSnapshot);
    uint256 secondPortion = _epochToScaleToSum[_epochSnapshot.epoch][_epochSnapshot.scale + 1].div(SCALE_FACTOR);

    _gained = _initialStake.mul(firstPortion.add(secondPortion)).div(_epochSnapshot.prod).div(PRECISION);
  }
}
