// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;
pragma abicoder v2;

import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

import "./interfaces/ICLeverCVXLocker.sol";
import "./interfaces/ICLeverToken.sol";
import { ICommitUserSurrogate } from "./interfaces/ICommitUserSurrogate.sol";
import "./interfaces/IFurnace.sol";
import "../interfaces/IConvexCVXLocker.sol";
import "../interfaces/IConvexCVXRewardPool.sol";
import "../interfaces/ISnapshotDelegateRegistry.sol";
import "../interfaces/IZap.sol";
import "../voting/ISignatureVerifier.sol";

// solhint-disable not-rely-on-time, max-states-count, reason-string

contract CLeverCVXLocker is OwnableUpgradeable, ICLeverCVXLocker {
  using SafeMathUpgradeable for uint256;
  using SafeERC20Upgradeable for IERC20Upgradeable;

  event UpdateWhitelist(address indexed _whitelist, bool _status);
  event UpdateStakePercentage(uint256 _percentage);
  event UpdateStakeThreshold(uint256 _threshold);
  event UpdateRepayFeePercentage(uint256 _feePercentage);
  event UpdatePlatformFeePercentage(uint256 _feePercentage);
  event UpdateHarvestBountyPercentage(uint256 _percentage);
  event UpdatePlatform(address indexed _platform);
  event UpdateZap(address indexed _zap);
  event UpdateGovernor(address indexed _governor);
  event UpdatePauseTimestamp(uint256 _startTimestamp, uint256 _finishTimestamp);

  // The precision used to calculate accumulated rewards.
  uint256 private constant PRECISION = 1e18;
  // The denominator used for fee calculation.
  uint256 private constant FEE_PRECISION = 1e9;
  // The maximum value of repay fee percentage.
  uint256 private constant MAX_REPAY_FEE = 1e8; // 10%
  // The maximum value of platform fee percentage.
  uint256 private constant MAX_PLATFORM_FEE = 2e8; // 20%
  // The maximum value of harvest bounty percentage.
  uint256 private constant MAX_HARVEST_BOUNTY = 1e8; // 10%
  // The length of epoch in CVX Locker.
  uint256 private constant REWARDS_DURATION = 86400 * 7; // 1 week

  // The address of CVX token.
  address private constant CVX = 0x4e3FBD56CD56c3e72c1403e103b45Db9da5B9D2B;
  // The address of cvxCRV token.
  address private constant CVXCRV = 0x62B9c7356A2Dc64a1969e19C23e4f579F9810Aa7;
  // The address of CVXRewardPool Contract.
  address private constant CVX_REWARD_POOL = 0xCF50b810E57Ac33B91dCF525C6ddd9881B139332;
  // The address of CVXLockerV2 Contract.
  address private constant CVX_LOCKER = 0x72a19342e8F1838460eBFCCEf09F6585e32db86E;
  // The address of votium distributor
  address private constant VOTIUM_DISTRIBUTOR = 0x378Ba9B73309bE80BF4C2c027aAD799766a7ED5A;
  // The address of cvxFXS token.
  address private constant CVXFXS = 0xFEEf77d3f69374f66429C91d732A244f074bdf74;
  /// @dev The address of WETH token.
  address internal constant WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;

  struct EpochUnlockInfo {
    // The number of CVX should unlocked at the start of epoch `unlockEpoch`.
    uint192 pendingUnlock;
    // The epoch number to unlock `pendingUnlock` CVX
    uint64 unlockEpoch;
  }

  struct UserInfo {
    // The total number of clevCVX minted.
    uint128 totalDebt;
    // The amount of distributed reward.
    uint128 rewards;
    // The paid accumulated reward per share, multipled by 1e18.
    uint192 rewardPerSharePaid;
    // The block number of the last interacted block (deposit, unlock, withdraw, repay, borrow).
    uint64 lastInteractedBlock;
    // The total amount of CVX locked.
    uint112 totalLocked;
    // The total amount of CVX unlocked.
    uint112 totalUnlocked;
    // The next unlock index to speedup unlock process.
    uint32 nextUnlockIndex;
    // In Convex, if you lock at epoch `e` (block.timestamp in `[e * rewardsDuration, (e + 1) * rewardsDuration)`),
    // you lock will start at epoch `e + 1` and will unlock at the beginning of epoch `(e + 17)`. If we relock right
    //  after the unlock, all unlocked CVX will start lock at epoch `e + 18`, and will locked again at epoch `e + 18 + 16`.
    // If we continue the process, all CVX locked in epoch `e` will be unlocked at epoch `e + 17 * k` (k >= 1).
    //
    // Here, we maintain an array for easy calculation when users lock or unlock.
    //
    // `epochLocked[r]` maintains all locked CVX whose unlocking epoch is `17 * k + r`. It means at the beginning of
    //  epoch `17 * k + r`, the CVX will unlock, if we continue to relock right after unlock.
    uint256[17] epochLocked;
    // The list of pending unlocked CVX.
    EpochUnlockInfo[] pendingUnlockList;
  }

  /// @dev The address of governor
  address public governor;
  /// @dev The address of clevCVX contract.
  address public clevCVX;

  /// @dev Assumptons:
  ///  1. totalLockedGlobal + totalPendingUnlockGlobal is the total amount of CVX locked in CVXLockerV2.
  ///  2. totalUnlockedGlobal is the total amount of CVX unlocked from CVXLockerV2 but still in contract.
  ///  3. totalDebtGlobal is the total amount of clevCVX borrowed, will decrease when debt is repayed.
  /// @dev The total amount of CVX locked in contract.
  uint256 public totalLockedGlobal;
  /// @dev The total amount of CVX going to unlocked.
  uint256 public totalPendingUnlockGlobal;
  /// @dev The total amount of CVX unlocked in CVXLockerV2 and will never be locked again.
  uint256 public totalUnlockedGlobal;
  /// @dev The total amount of clevCVX borrowed from this contract.
  uint256 public totalDebtGlobal;

  /// @dev The reward per share of CVX accumulated, will be updated in each harvest, multipled by 1e18.
  uint256 public accRewardPerShare;
  /// @dev Mapping from user address to user info.
  mapping(address => UserInfo) public userInfo;
  /// @dev Mapping from epoch number to the amount of CVX to be unlocked.
  mapping(uint256 => uint256) public pendingUnlocked;
  /// @dev The address of Furnace Contract.
  address public furnace;
  /// @dev The percentage of free CVX will be staked in CVXRewardPool.
  uint256 public stakePercentage;
  /// @dev The minimum of amount of CVX to be staked.
  uint256 public stakeThreshold;
  /// @dev The debt reserve rate to borrow clevCVX for each user.
  uint256 public reserveRate;
  /// @dev The list of tokens which will swap manually.
  mapping(address => bool) public manualSwapRewardToken;

  /// @dev The address of zap contract.
  address public zap;
  /// @dev The percentage of repay fee.
  uint256 public repayFeePercentage;
  /// @dev The percentage of rewards to take for caller on harvest
  uint256 public harvestBountyPercentage;
  /// @dev The percentage of rewards to take for platform on harvest
  uint256 public platformFeePercentage;
  /// @dev The address of recipient of platform fee
  address public platform;

  /// @dev The list of whitelist keeper.
  mapping(address => bool) public isKeeper;

  /// @notice The list of rewards token.
  address[] public rewardTokens;

  /// @notice The address of SignatureVerifier contract.
  ISignatureVerifier public verifier;

  modifier onlyGovernorOrOwner() {
    require(msg.sender == governor || msg.sender == owner(), "CLeverCVXLocker: only governor or owner");
    _;
  }

  modifier onlyKeeper() {
    require(isKeeper[msg.sender], "CLeverCVXLocker: only keeper");
    _;
  }

  function initialize(
    address _governor,
    address _clevCVX,
    address _zap,
    address _furnace,
    address _platform,
    uint256 _platformFeePercentage,
    uint256 _harvestBountyPercentage
  ) external initializer {
    OwnableUpgradeable.__Ownable_init();

    require(_governor != address(0), "CLeverCVXLocker: zero governor address");
    require(_clevCVX != address(0), "CLeverCVXLocker: zero clevCVX address");
    require(_zap != address(0), "CLeverCVXLocker: zero zap address");
    require(_furnace != address(0), "CLeverCVXLocker: zero furnace address");
    require(_platform != address(0), "CLeverCVXLocker: zero platform address");
    require(_platformFeePercentage <= MAX_PLATFORM_FEE, "CLeverCVXLocker: fee too large");
    require(_harvestBountyPercentage <= MAX_HARVEST_BOUNTY, "CLeverCVXLocker: fee too large");

    governor = _governor;
    clevCVX = _clevCVX;
    zap = _zap;
    furnace = _furnace;
    platform = _platform;
    platformFeePercentage = _platformFeePercentage;
    harvestBountyPercentage = _harvestBountyPercentage;
    reserveRate = 500_000_000;
  }

  receive() external payable {
    require(msg.sender == zap, "only zap can send ETH");
  }

  /********************************** View Functions **********************************/

  /// @dev Return user info in this contract.
  /// @param _account The address of user.
  /// @return totalDeposited The amount of CVX deposited in this contract of the user.
  /// @return totalPendingUnlocked The amount of CVX pending to be unlocked.
  /// @return totalUnlocked The amount of CVX unlokced of the user and can be withdrawed.
  /// @return totalBorrowed The amount of clevCVX borrowed by the user.
  /// @return totalReward The amount of CVX reward accrued for the user.
  function getUserInfo(address _account)
    external
    view
    override
    returns (
      uint256 totalDeposited,
      uint256 totalPendingUnlocked,
      uint256 totalUnlocked,
      uint256 totalBorrowed,
      uint256 totalReward
    )
  {
    UserInfo storage _info = userInfo[_account];

    totalDeposited = _info.totalLocked;

    // update total reward and total Borrowed
    totalBorrowed = _info.totalDebt;
    totalReward = uint256(_info.rewards).add(
      accRewardPerShare.sub(_info.rewardPerSharePaid).mul(totalDeposited) / PRECISION
    );
    if (totalBorrowed > 0) {
      if (totalReward >= totalBorrowed) {
        totalReward -= totalBorrowed;
        totalBorrowed = 0;
      } else {
        totalBorrowed -= totalReward;
        totalReward = 0;
      }
    }

    // update total unlocked and total pending unlocked.
    totalUnlocked = _info.totalUnlocked;
    EpochUnlockInfo[] storage _pendingUnlockList = _info.pendingUnlockList;
    uint256 _nextUnlockIndex = _info.nextUnlockIndex;
    uint256 _currentEpoch = block.timestamp / REWARDS_DURATION;
    while (_nextUnlockIndex < _pendingUnlockList.length) {
      if (_pendingUnlockList[_nextUnlockIndex].unlockEpoch <= _currentEpoch) {
        totalUnlocked += _pendingUnlockList[_nextUnlockIndex].pendingUnlock;
      } else {
        totalPendingUnlocked += _pendingUnlockList[_nextUnlockIndex].pendingUnlock;
      }
      _nextUnlockIndex += 1;
    }
  }

  /// @dev Return the lock and pending unlocked list of user.
  /// @param _account The address of user.
  /// @return locks The list of CVX locked by the user, including amount and nearest unlock epoch.
  /// @return pendingUnlocks The list of CVX pending unlocked of the user, including amount and the unlock epoch.
  function getUserLocks(address _account)
    external
    view
    returns (EpochUnlockInfo[] memory locks, EpochUnlockInfo[] memory pendingUnlocks)
  {
    UserInfo storage _info = userInfo[_account];

    uint256 _currentEpoch = block.timestamp / REWARDS_DURATION;
    uint256 lengthLocks;
    for (uint256 i = 0; i < 17; i++) {
      if (_info.epochLocked[i] > 0) {
        lengthLocks++;
      }
    }
    locks = new EpochUnlockInfo[](lengthLocks);
    lengthLocks = 0;
    for (uint256 i = 0; i < 17; i++) {
      uint256 _index = (_currentEpoch + i + 1) % 17;
      if (_info.epochLocked[_index] > 0) {
        locks[lengthLocks].pendingUnlock = uint192(_info.epochLocked[_index]);
        locks[lengthLocks].unlockEpoch = uint64(_currentEpoch + i + 1);
        lengthLocks += 1;
      }
    }

    uint256 _nextUnlockIndex = _info.nextUnlockIndex;
    EpochUnlockInfo[] storage _pendingUnlockList = _info.pendingUnlockList;
    uint256 lengthPendingUnlocks;
    for (uint256 i = _nextUnlockIndex; i < _pendingUnlockList.length; i++) {
      if (_pendingUnlockList[i].unlockEpoch > _currentEpoch) {
        lengthPendingUnlocks += 1;
      }
    }
    pendingUnlocks = new EpochUnlockInfo[](lengthPendingUnlocks);
    lengthPendingUnlocks = 0;
    for (uint256 i = _nextUnlockIndex; i < _pendingUnlockList.length; i++) {
      if (_pendingUnlockList[i].unlockEpoch > _currentEpoch) {
        pendingUnlocks[lengthPendingUnlocks] = _pendingUnlockList[i];
        lengthPendingUnlocks += 1;
      }
    }
  }

  /// @dev Return the total amount of free CVX in this contract, including staked in CVXRewardPool.
  /// @return The amount of CVX in this contract now.
  function totalCVXInPool() public view returns (uint256) {
    return
      IERC20Upgradeable(CVX).balanceOf(address(this)).add(
        IConvexCVXRewardPool(CVX_REWARD_POOL).balanceOf(address(this))
      );
  }

  /// @notice Should return whether the signature provided is valid for the provided hash
  /// @dev See https://eips.ethereum.org/EIPS/eip-1271 for more details.
  /// @param _hash      Hash of the data to be signed
  /// @param _signature Signature byte array associated with _hash
  ///
  /// MUST return the bytes4 magic value 0x1626ba7e when function passes.
  /// MUST NOT modify state (using STATICCALL for solc < 0.5, view modifier for solc > 0.5)
  /// MUST allow external calls
  function isValidSignature(bytes32 _hash, bytes calldata _signature) external view returns (bytes4) {
    // Validate signatures
    if (verifier.verifySignature(_hash, _signature) == true) {
      return 0x1626ba7e;
    } else {
      return 0xffffffff;
    }
  }

  /********************************** Mutated Functions **********************************/

  /// @dev Deposit CVX and lock into CVXLockerV2
  /// @param _amount The amount of CVX to lock.
  function deposit(uint256 _amount) external override {
    require(_amount > 0, "CLeverCVXLocker: deposit zero CVX");
    IERC20Upgradeable(CVX).safeTransferFrom(msg.sender, address(this), _amount);

    // 1. update reward info
    _updateReward(msg.sender);

    // 2. lock to CVXLockerV2
    IERC20Upgradeable(CVX).safeApprove(CVX_LOCKER, 0);
    IERC20Upgradeable(CVX).safeApprove(CVX_LOCKER, _amount);
    IConvexCVXLocker(CVX_LOCKER).lock(address(this), _amount, 0);

    // 3. update user lock info
    uint256 _currentEpoch = block.timestamp / REWARDS_DURATION;
    uint256 _reminder = _currentEpoch % 17;

    UserInfo storage _info = userInfo[msg.sender];
    _info.totalLocked = uint112(_amount + uint256(_info.totalLocked)); // should never overflow
    _info.epochLocked[_reminder] = _amount + _info.epochLocked[_reminder]; // should never overflow

    // 4. update global info
    totalLockedGlobal = _amount.add(totalLockedGlobal); // direct cast shoule be safe

    emit Deposit(msg.sender, _amount);
  }

  /// @dev Unlock CVX from the CVXLockerV2
  ///      Notice that all pending unlocked CVX will not share future rewards.
  /// @param _amount The amount of CVX to unlock.
  function unlock(uint256 _amount) external override {
    require(_amount > 0, "CLeverCVXLocker: unlock zero CVX");
    // 1. update reward info
    _updateReward(msg.sender);

    // 2. update unlocked info
    _updateUnlocked(msg.sender);

    // 3. check unlock limit and update
    UserInfo storage _info = userInfo[msg.sender];
    {
      uint256 _totalLocked = _info.totalLocked;
      uint256 _totalDebt = _info.totalDebt;
      require(_amount <= _totalLocked, "CLeverCVXLocker: insufficient CVX to unlock");

      _checkAccountHealth(_totalLocked, _totalDebt, _amount, 0);
      // if you choose unlock, all pending unlocked CVX will not share the reward.
      _info.totalLocked = uint112(_totalLocked - _amount); // should never overflow
      // global unlock info will be updated in `processUnlockableCVX`
      totalLockedGlobal -= _amount;
      totalPendingUnlockGlobal += _amount;
    }

    emit Unlock(msg.sender, _amount);

    // 4. enumerate lockInfo array to unlock
    uint256 _nextEpoch = block.timestamp / REWARDS_DURATION + 1;
    EpochUnlockInfo[] storage _pendingUnlockList = _info.pendingUnlockList;
    uint256 _index;
    uint256 _locked;
    uint256 _unlocked;
    for (uint256 i = 0; i < 17; i++) {
      _index = _nextEpoch % 17;
      _locked = _info.epochLocked[_index];
      if (_amount >= _locked) _unlocked = _locked;
      else _unlocked = _amount;

      if (_unlocked > 0) {
        _info.epochLocked[_index] = _locked - _unlocked; // should never overflow
        _amount = _amount - _unlocked; // should never overflow
        pendingUnlocked[_nextEpoch] = pendingUnlocked[_nextEpoch] + _unlocked; // should never overflow

        if (
          _pendingUnlockList.length == 0 || _pendingUnlockList[_pendingUnlockList.length - 1].unlockEpoch != _nextEpoch
        ) {
          _pendingUnlockList.push(
            EpochUnlockInfo({ pendingUnlock: uint192(_unlocked), unlockEpoch: uint64(_nextEpoch) })
          );
        } else {
          _pendingUnlockList[_pendingUnlockList.length - 1].pendingUnlock = uint192(
            _unlocked + _pendingUnlockList[_pendingUnlockList.length - 1].pendingUnlock
          );
        }
      }

      if (_amount == 0) break;
      _nextEpoch = _nextEpoch + 1;
    }
  }

  /// @dev Withdraw all unlocked CVX from this contract.
  function withdrawUnlocked() external override {
    // 1. update reward info
    _updateReward(msg.sender);

    // 2. update unlocked info
    _updateUnlocked(msg.sender);

    // 3. claim unlocked CVX
    UserInfo storage _info = userInfo[msg.sender];
    uint256 _unlocked = _info.totalUnlocked;
    _info.totalUnlocked = 0;

    // update global info
    totalUnlockedGlobal = totalUnlockedGlobal.sub(_unlocked);

    uint256 _balanceInContract = IERC20Upgradeable(CVX).balanceOf(address(this));
    // balance is not enough, with from reward pool
    if (_balanceInContract < _unlocked) {
      IConvexCVXRewardPool(CVX_REWARD_POOL).withdraw(_unlocked - _balanceInContract, false);
    }

    IERC20Upgradeable(CVX).safeTransfer(msg.sender, _unlocked);

    emit Withdraw(msg.sender, _unlocked);
  }

  /// @dev Repay clevCVX debt with CVX or clevCVX.
  /// @param _cvxAmount The amount of CVX used to pay debt.
  /// @param _clevCVXAmount The amount of clevCVX used to pay debt.
  function repay(uint256 _cvxAmount, uint256 _clevCVXAmount) external override {
    require(_cvxAmount > 0 || _clevCVXAmount > 0, "CLeverCVXLocker: repay zero amount");

    // 1. update reward info
    _updateReward(msg.sender);

    UserInfo storage _info = userInfo[msg.sender];
    uint256 _totalDebt = _info.totalDebt;
    uint256 _totalDebtGlobal = totalDebtGlobal;

    // 3. check repay with cvx and take fee
    if (_cvxAmount > 0 && _totalDebt > 0) {
      if (_cvxAmount > _totalDebt) _cvxAmount = _totalDebt;

      uint256 _fee = _cvxAmount.mul(repayFeePercentage) / FEE_PRECISION;
      _totalDebt = _totalDebt - _cvxAmount; // never overflow
      _totalDebtGlobal = _totalDebtGlobal - _cvxAmount; // never overflow

      // distribute to furnace and transfer fee to platform
      IERC20Upgradeable(CVX).safeTransferFrom(msg.sender, address(this), _cvxAmount + _fee);
      if (_fee > 0) {
        IERC20Upgradeable(CVX).safeTransfer(platform, _fee);
      }
      address _furnace = furnace;
      IERC20Upgradeable(CVX).safeApprove(_furnace, 0);
      IERC20Upgradeable(CVX).safeApprove(_furnace, _cvxAmount);
      IFurnace(_furnace).distribute(address(this), _cvxAmount);
    }

    // 4. check repay with clevCVX
    if (_clevCVXAmount > 0 && _totalDebt > 0) {
      if (_clevCVXAmount > _totalDebt) _clevCVXAmount = _totalDebt;
      uint256 _fee = _clevCVXAmount.mul(repayFeePercentage) / FEE_PRECISION;
      _totalDebt = _totalDebt - _clevCVXAmount; // never overflow
      _totalDebtGlobal = _totalDebtGlobal - _clevCVXAmount;

      // burn debt token and tranfer fee to platform
      if (_fee > 0) {
        IERC20Upgradeable(clevCVX).safeTransferFrom(msg.sender, platform, _fee);
      }
      ICLeverToken(clevCVX).burnFrom(msg.sender, _clevCVXAmount);
    }

    _info.totalDebt = uint128(_totalDebt);
    totalDebtGlobal = _totalDebtGlobal;

    emit Repay(msg.sender, _cvxAmount, _clevCVXAmount);
  }

  /// @dev Borrow clevCVX from this contract.
  ///      Notice the reward will be used first and it will not be treated as debt.
  /// @param _amount The amount of clevCVX to borrow.
  /// @param _depositToFurnace Whether to deposit borrowed clevCVX to furnace.
  function borrow(uint256 _amount, bool _depositToFurnace) external override {
    require(_amount > 0, "CLeverCVXLocker: borrow zero amount");

    // 1. update reward info
    _updateReward(msg.sender);

    UserInfo storage _info = userInfo[msg.sender];
    uint256 _rewards = _info.rewards;
    uint256 _borrowWithLocked;

    // 2. borrow with rewards, this will not be treated as debt.
    if (_rewards >= _amount) {
      _info.rewards = uint128(_rewards - _amount);
    } else {
      _info.rewards = 0;
      _borrowWithLocked = _amount - _rewards;
    }

    // 3. borrow with locked CVX
    if (_borrowWithLocked > 0) {
      uint256 _totalLocked = _info.totalLocked;
      uint256 _totalDebt = _info.totalDebt;
      _checkAccountHealth(_totalLocked, _totalDebt, 0, _borrowWithLocked);
      // update user info
      _info.totalDebt = uint128(_totalDebt + _borrowWithLocked); // should not overflow.
      // update global info
      totalDebtGlobal = totalDebtGlobal + _borrowWithLocked; // should not overflow.
    }

    _mintOrDeposit(_amount, _depositToFurnace);

    emit Borrow(msg.sender, _amount);
  }

  /// @dev Someone donate CVX to all CVX locker in this contract.
  /// @param _amount The amount of CVX to donate.
  function donate(uint256 _amount) external override {
    require(_amount > 0, "CLeverCVXLocker: donate zero amount");
    IERC20Upgradeable(CVX).safeTransferFrom(msg.sender, address(this), _amount);

    _distribute(_amount);
  }

  /// @dev Harvest pending reward from CVXLockerV2 and CVXRewardPool, then swap it to CVX.
  /// @param _recipient - The address of account to receive harvest bounty.
  /// @param _minimumOut - The minimum amount of CVX should get.
  /// @return The amount of CVX harvested.
  function harvest(address _recipient, uint256 _minimumOut) external override returns (uint256) {
    // 1. harvest from CVXLockerV2 and CVXRewardPool
    address[] memory _rewardTokens = rewardTokens;
    uint256[] memory _balances = new uint256[](_rewardTokens.length);
    for (uint256 i = 0; i < _rewardTokens.length; i++) {
      _balances[i] = IERC20Upgradeable(_rewardTokens[i]).balanceOf(address(this));
    }
    IConvexCVXRewardPool(CVX_REWARD_POOL).getReward(false);
    IConvexCVXLocker(CVX_LOCKER).getReward(address(this));

    // 2. convert all reward tokens to ETH, then to CVX
    uint256 _amount; // store the amount of ETH
    address _zap = zap;
    for (uint256 i = 0; i < _rewardTokens.length; i++) {
      address _token = _rewardTokens[i];
      uint256 _balance = IERC20Upgradeable(_token).balanceOf(address(this)) - _balances[i];
      if (_balance > 0) {
        IERC20Upgradeable(_token).safeTransfer(_zap, _balance);
        _amount += IZap(_zap).zap(_token, _balance, address(0), 0);
      }
    }
    if (_amount > 0) {
      _amount = IZap(_zap).zap{ value: _amount }(address(0), _amount, CVX, 0);
    }
    // @note now `_amount` store the amount of CVX
    require(_amount >= _minimumOut, "CLeverCVXLocker: insufficient output");

    // 3. distribute incentive to platform and _recipient
    uint256 _platformFee = platformFeePercentage;
    uint256 _distributeAmount = _amount;
    if (_platformFee > 0) {
      _platformFee = (_distributeAmount * _platformFee) / FEE_PRECISION;
      _distributeAmount = _distributeAmount - _platformFee;
      IERC20Upgradeable(CVX).safeTransfer(platform, _platformFee);
    }
    uint256 _harvestBounty = harvestBountyPercentage;
    if (_harvestBounty > 0) {
      _harvestBounty = (_distributeAmount * _harvestBounty) / FEE_PRECISION;
      _distributeAmount = _distributeAmount - _harvestBounty;
      IERC20Upgradeable(CVX).safeTransfer(_recipient, _harvestBounty);
    }

    // 4. distribute to users
    _distribute(_distributeAmount);

    emit Harvest(msg.sender, _distributeAmount, _platformFee, _harvestBounty);

    return _amount;
  }

  /// @dev Harvest pending reward from Votium, then swap it to CVX.
  /// @param claims The parameters used by VotiumMultiMerkleStash contract.
  /// @param _routes The routes used to swap token to ETH.
  /// @param _minimumOut - The minimum amount of CVX should get.
  /// @return The amount of CVX harvested.
  function harvestVotium(
    IVotiumMultiMerkleStash.claimParam[] calldata claims,
    uint256[][] calldata _routes,
    uint256 _minimumOut
  ) external onlyKeeper returns (uint256) {
    // the last routes is ETH to CVX
    require(claims.length + 1 == _routes.length, "length mismatch");
    // 1. claim reward from votium
    for (uint256 i = 0; i < claims.length; i++) {
      // in case someone has claimed the reward for this contract, we can still call this function to process reward.
      if (!IVotiumMultiMerkleStash(VOTIUM_DISTRIBUTOR).isClaimed(claims[i].token, claims[i].index)) {
        IVotiumMultiMerkleStash(VOTIUM_DISTRIBUTOR).claim(
          claims[i].token,
          claims[i].index,
          address(this),
          claims[i].amount,
          claims[i].merkleProof
        );
      }
    }
    address[] memory _rewardTokens = new address[](claims.length);
    uint256[] memory _amounts = new uint256[](claims.length);
    for (uint256 i = 0; i < claims.length; i++) {
      _rewardTokens[i] = claims[i].token;
      // TODO: consider fee on transfer token (currently, such token doesn't exsist)
      _amounts[i] = claims[i].amount;
    }

    // 2. swap all tokens to CVX
    uint256 _amount = _swapToCVX(_rewardTokens, _amounts, _routes, _minimumOut);

    // 3. distribute to platform
    uint256 _distributeAmount = _amount;
    uint256 _platformFee = platformFeePercentage;
    if (_platformFee > 0) {
      _platformFee = (_distributeAmount * _platformFee) / FEE_PRECISION;
      _distributeAmount = _distributeAmount - _platformFee;
      IERC20Upgradeable(CVX).safeTransfer(platform, _platformFee);
    }

    // 4. distribute to users
    _distribute(_distributeAmount);

    emit Harvest(msg.sender, _distributeAmount, _platformFee, 0);

    return _amount;
  }

  /// @dev Process unlocked CVX in CVXLockerV2.
  ///
  /// This function should be called every week if
  ///   1. `pendingUnlocked[currentEpoch]` is nonzero.
  ///   2. some CVX is unlocked in current epoch.
  function processUnlockableCVX() external onlyKeeper {
    // Be careful that someone may kick us out from CVXLockerV2
    // `totalUnlockedGlobal` keep track the amount of CVX unlocked from CVXLockerV2
    // all other CVX in this contract can be considered unlocked from CVXLockerV2 by someone else.

    // 1. find extra CVX from donation or kicked out from CVXLockerV2
    uint256 _extraCVX = totalCVXInPool().sub(totalUnlockedGlobal);

    // 2. unlock CVX
    uint256 _unlocked = IERC20Upgradeable(CVX).balanceOf(address(this));
    IConvexCVXLocker(CVX_LOCKER).processExpiredLocks(false);
    _unlocked = IERC20Upgradeable(CVX).balanceOf(address(this)).sub(_unlocked).add(_extraCVX);

    // 3. remove user unlocked CVX
    uint256 currentEpoch = block.timestamp / REWARDS_DURATION;
    uint256 _pending = pendingUnlocked[currentEpoch];
    if (_pending > 0) {
      // check if the unlocked CVX is enough, normally this should always be true.
      require(_unlocked >= _pending, "CLeverCVXLocker: insufficient unlocked CVX");
      _unlocked -= _pending;
      // update global info
      totalUnlockedGlobal = totalUnlockedGlobal.add(_pending);
      totalPendingUnlockGlobal -= _pending; // should never overflow
      pendingUnlocked[currentEpoch] = 0;
    }

    // 4. relock
    if (_unlocked > 0) {
      IERC20Upgradeable(CVX).safeApprove(CVX_LOCKER, 0);
      IERC20Upgradeable(CVX).safeApprove(CVX_LOCKER, _unlocked);
      IConvexCVXLocker(CVX_LOCKER).lock(address(this), _unlocked, 0);
    }
  }

  /********************************** Restricted Functions **********************************/

  /// @dev delegate vlCVX voting power.
  /// @param _registry The address of Snapshot Delegate Registry.
  /// @param _id The id for which the delegate should be set.
  /// @param _delegate The address of the delegate.
  function delegate(
    address _registry,
    bytes32 _id,
    address _delegate
  ) external onlyGovernorOrOwner {
    ISnapshotDelegateRegistry(_registry).setDelegate(_id, _delegate);
  }

  /// @notice delegate vlCVX voting power to L2. The current address of `_commiter`
  /// is `0x861cBbFCFDbd42AD69b3f626F23C3E36388FF01E`.
  function commitUserSurrogate(
    address _commiter,
    address _surrogate,
    address _contractAddr
  ) external onlyGovernorOrOwner {
    ICommitUserSurrogate(_commiter).commit(_surrogate, _contractAddr);
  }

  /// @dev Update the address of governor.
  /// @param _governor The address to be updated
  function updateGovernor(address _governor) external onlyGovernorOrOwner {
    require(_governor != address(0), "CLeverCVXLocker: zero governor address");
    governor = _governor;

    emit UpdateGovernor(_governor);
  }

  /// @dev Update stake percentage for CVX in this contract.
  /// @param _percentage The stake percentage to be updated, multipled by 1e9.
  function updateStakePercentage(uint256 _percentage) external onlyGovernorOrOwner {
    require(_percentage <= FEE_PRECISION, "CLeverCVXLocker: percentage too large");
    stakePercentage = _percentage;

    emit UpdateStakePercentage(_percentage);
  }

  /// @dev Update stake threshold for CVX.
  /// @param _threshold The stake threshold to be updated.
  function updateStakeThreshold(uint256 _threshold) external onlyGovernorOrOwner {
    stakeThreshold = _threshold;

    emit UpdateStakeThreshold(_threshold);
  }

  /// @dev Update manual swap reward token lists.
  /// @param _tokens The addresses of token list.
  /// @param _status The status to be updated.
  function updateManualSwapRewardToken(address[] memory _tokens, bool _status) external onlyGovernorOrOwner {
    for (uint256 i = 0; i < _tokens.length; i++) {
      require(_tokens[i] != CVX, "CLeverCVXLocker: invalid token");
      manualSwapRewardToken[_tokens[i]] = _status;
    }
  }

  /// @dev Update the repay fee percentage.
  /// @param _feePercentage - The fee percentage to update.
  function updateRepayFeePercentage(uint256 _feePercentage) external onlyOwner {
    require(_feePercentage <= MAX_REPAY_FEE, "AladdinCRV: fee too large");
    repayFeePercentage = _feePercentage;

    emit UpdateRepayFeePercentage(_feePercentage);
  }

  /// @dev Update the platform fee percentage.
  /// @param _feePercentage - The fee percentage to update.
  function updatePlatformFeePercentage(uint256 _feePercentage) external onlyOwner {
    require(_feePercentage <= MAX_PLATFORM_FEE, "AladdinCRV: fee too large");
    platformFeePercentage = _feePercentage;

    emit UpdatePlatformFeePercentage(_feePercentage);
  }

  /// @dev Update the harvest bounty percentage.
  /// @param _percentage - The fee percentage to update.
  function updateHarvestBountyPercentage(uint256 _percentage) external onlyOwner {
    require(_percentage <= MAX_HARVEST_BOUNTY, "AladdinCRV: fee too large");
    harvestBountyPercentage = _percentage;

    emit UpdateHarvestBountyPercentage(_percentage);
  }

  /// @dev Update the recipient
  function updatePlatform(address _platform) external onlyOwner {
    require(_platform != address(0), "AladdinCRV: zero platform address");
    platform = _platform;

    emit UpdatePlatform(_platform);
  }

  /// @dev Update the zap contract
  function updateZap(address _zap) external onlyGovernorOrOwner {
    require(_zap != address(0), "CLeverCVXLocker: zero zap address");
    zap = _zap;

    emit UpdateZap(_zap);
  }

  function updateReserveRate(uint256 _reserveRate) external onlyOwner {
    require(_reserveRate <= FEE_PRECISION, "CLeverCVXLocker: invalid reserve rate");
    reserveRate = _reserveRate;
  }

  /// @dev Withdraw all manual swap reward tokens from the contract.
  /// @param _tokens The address list of tokens to withdraw.
  /// @param _recipient The address of user who will recieve the tokens.
  function withdrawManualSwapRewardTokens(address[] memory _tokens, address _recipient) external onlyOwner {
    for (uint256 i = 0; i < _tokens.length; i++) {
      if (!manualSwapRewardToken[_tokens[i]]) continue;
      uint256 _balance = IERC20Upgradeable(_tokens[i]).balanceOf(address(this));
      IERC20Upgradeable(_tokens[i]).safeTransfer(_recipient, _balance);
    }
  }

  /// @dev Update keepers.
  /// @param _accounts The address list of keepers to update.
  /// @param _status The status of updated keepers.
  function updateKeepers(address[] memory _accounts, bool _status) external onlyGovernorOrOwner {
    for (uint256 i = 0; i < _accounts.length; i++) {
      isKeeper[_accounts[i]] = _status;
    }
  }

  /// @notice Update the address of SignatureVerifier contract.
  /// @param _verifier The address of new SignatureVerifier contract.
  function updateVerifier(address _verifier) external onlyOwner {
    verifier = ISignatureVerifier(_verifier);
  }

  /// @notice Update the list of reward tokens.
  /// @param _tokens The list of reward tokens to update.
  function updateRewardTokens(address[] memory _tokens) external onlyOwner {
    delete rewardTokens;
    rewardTokens = _tokens;
  }

  /********************************** Internal Functions **********************************/

  /// @dev Internal function called by `deposit`, `unlock`, `withdrawUnlocked`, `repay`, `borrow` and `claim`.
  /// @param _account The address of account to update reward info.
  function _updateReward(address _account) internal {
    UserInfo storage _info = userInfo[_account];
    require(_info.lastInteractedBlock != block.number, "CLeverCVXLocker: enter the same block");

    uint256 _totalDebtGlobal = totalDebtGlobal;
    uint256 _totalDebt = _info.totalDebt;
    uint256 _rewards = uint256(_info.rewards).add(
      accRewardPerShare.sub(_info.rewardPerSharePaid).mul(_info.totalLocked) / PRECISION
    );

    _info.rewardPerSharePaid = uint192(accRewardPerShare); // direct cast should be safe
    _info.lastInteractedBlock = uint64(block.number);

    // pay debt with reward if possible
    if (_totalDebt > 0) {
      if (_rewards >= _totalDebt) {
        _rewards -= _totalDebt;
        _totalDebtGlobal -= _totalDebt;
        _totalDebt = 0;
      } else {
        _totalDebtGlobal -= _rewards;
        _totalDebt -= _rewards;
        _rewards = 0;
      }
    }

    _info.totalDebt = uint128(_totalDebt); // direct cast should be safe
    _info.rewards = uint128(_rewards); // direct cast should be safe
    totalDebtGlobal = _totalDebtGlobal;
  }

  /// @dev Internal function called by `unlock`, `withdrawUnlocked`.
  /// @param _account The address of account to update pending unlock list.
  function _updateUnlocked(address _account) internal {
    UserInfo storage _info = userInfo[_account];
    uint256 _currentEpoch = block.timestamp / REWARDS_DURATION;
    uint256 _nextUnlockIndex = _info.nextUnlockIndex;
    uint256 _totalUnlocked = _info.totalUnlocked;
    EpochUnlockInfo[] storage _pendingUnlockList = _info.pendingUnlockList;

    uint256 _unlockEpoch;
    uint256 _unlockAmount;
    while (_nextUnlockIndex < _pendingUnlockList.length) {
      _unlockEpoch = _pendingUnlockList[_nextUnlockIndex].unlockEpoch;
      _unlockAmount = _pendingUnlockList[_nextUnlockIndex].pendingUnlock;
      if (_unlockEpoch <= _currentEpoch) {
        _totalUnlocked = _totalUnlocked + _unlockAmount;
        delete _pendingUnlockList[_nextUnlockIndex]; // clear entry to refund gas
      } else {
        break;
      }
      _nextUnlockIndex += 1;
    }
    _info.totalUnlocked = uint112(_totalUnlocked);
    _info.nextUnlockIndex = uint32(_nextUnlockIndex);
  }

  /// @dev Internal function used to swap tokens to CVX.
  /// @param _rewardTokens The address list of reward tokens.
  /// @param _amounts The amount list of reward tokens.
  /// @param _routes The routes used to swap token to WETH.
  /// @param _minimumOut The minimum amount of CVX should get.
  /// @return The amount of CVX swapped.
  function _swapToCVX(
    address[] memory _rewardTokens,
    uint256[] memory _amounts,
    uint256[][] calldata _routes,
    uint256 _minimumOut
  ) internal returns (uint256) {
    uint256 _amountCVX;
    uint256 _amountWETH;
    address _zap = zap;
    uint256 index;
    // 1. swap all token to WETH
    for (index = 0; index < _rewardTokens.length; index++) {
      address _token = _rewardTokens[index];
      // skip manual swap token
      if (manualSwapRewardToken[_token]) continue;
      if (_token != CVX) {
        if (_amounts[index] > 0) {
          IERC20Upgradeable(_token).safeTransfer(_zap, _amounts[index]);
          _amountWETH = _amountWETH.add(IZap(_zap).zapWithRoutes(_token, _amounts[index], WETH, _routes[index], 0));
        }
      } else {
        _amountCVX = _amountCVX.add(_amounts[index]);
      }
    }
    // 2. swap WETH to CVX
    if (_amountWETH > 0) {
      IERC20Upgradeable(WETH).safeTransfer(_zap, _amountWETH);
      _amountCVX = _amountCVX.add(IZap(_zap).zapWithRoutes(WETH, _amountWETH, CVX, _routes[index], 0));
    }
    require(_amountCVX >= _minimumOut, "CLeverCVXLocker: insufficient output");
    return _amountCVX;
  }

  /// @dev Internal function called by `harvest` and `harvestVotium`.
  function _distribute(uint256 _amount) internal {
    // 1. update reward info
    uint256 _totalLockedGlobal = totalLockedGlobal; // gas saving
    // It's ok to donate when on one is locking in this contract.
    if (_totalLockedGlobal > 0) {
      accRewardPerShare = accRewardPerShare.add(_amount.mul(PRECISION) / uint256(_totalLockedGlobal));
    }

    // 2. distribute reward CVX to Furnace
    address _furnace = furnace;
    IERC20Upgradeable(CVX).safeApprove(_furnace, 0);
    IERC20Upgradeable(CVX).safeApprove(_furnace, _amount);
    IFurnace(_furnace).distribute(address(this), _amount);

    // 3. stake extra CVX to cvxRewardPool
    uint256 _balanceStaked = IConvexCVXRewardPool(CVX_REWARD_POOL).balanceOf(address(this));
    uint256 _toStake = _balanceStaked.add(IERC20Upgradeable(CVX).balanceOf(address(this))).mul(stakePercentage).div(
      FEE_PRECISION
    );
    if (_balanceStaked < _toStake) {
      _toStake = _toStake - _balanceStaked;
      if (_toStake >= stakeThreshold) {
        IERC20Upgradeable(CVX).safeApprove(CVX_REWARD_POOL, 0);
        IERC20Upgradeable(CVX).safeApprove(CVX_REWARD_POOL, _toStake);
        IConvexCVXRewardPool(CVX_REWARD_POOL).stake(_toStake);
      }
    }
  }

  /// @dev Internal function used to help to mint clevCVX.
  /// @param _amount The amount of clevCVX to mint.
  /// @param _depositToFurnace Whether to deposit the minted clevCVX to furnace.
  function _mintOrDeposit(uint256 _amount, bool _depositToFurnace) internal {
    if (_depositToFurnace) {
      address _clevCVX = clevCVX;
      address _furnace = furnace;
      // stake clevCVX to furnace.
      ICLeverToken(_clevCVX).mint(address(this), _amount);
      IERC20Upgradeable(_clevCVX).safeApprove(_furnace, 0);
      IERC20Upgradeable(_clevCVX).safeApprove(_furnace, _amount);
      IFurnace(_furnace).depositFor(msg.sender, _amount);
    } else {
      // transfer clevCVX to sender.
      ICLeverToken(clevCVX).mint(msg.sender, _amount);
    }
  }

  /// @dev Internal function to check the health of account.
  ///      And account is health if and only if
  ///                                       cvxBorrowed
  ///                      cvxDeposited >= --------------
  ///                                      cvxReserveRate
  /// @param _totalDeposited The amount of CVX currently deposited.
  /// @param _totalDebt The amount of clevCVX currently borrowed.
  /// @param _newUnlock The amount of CVX to unlock.
  /// @param _newBorrow The amount of clevCVX to borrow.
  function _checkAccountHealth(
    uint256 _totalDeposited,
    uint256 _totalDebt,
    uint256 _newUnlock,
    uint256 _newBorrow
  ) internal view {
    require(
      _totalDeposited.sub(_newUnlock).mul(reserveRate) >= _totalDebt.add(_newBorrow).mul(FEE_PRECISION),
      "CLeverCVXLocker: unlock or borrow exceeds limit"
    );
  }
}
