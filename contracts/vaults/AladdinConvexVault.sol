// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;
pragma abicoder v2;

import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";

import "../interfaces/IAladdinConvexVault.sol";
import "../interfaces/IAladdinCRV.sol";
import "../interfaces/IConvexBooster.sol";
import "../interfaces/IConvexBasicRewards.sol";
import "../interfaces/IConvexCRVDepositor.sol";
import "../interfaces/ICurveFactoryPlainPool.sol";
import "../interfaces/IZap.sol";

// solhint-disable no-empty-blocks, reason-string
contract AladdinConvexVault is OwnableUpgradeable, ReentrancyGuardUpgradeable, IAladdinConvexVault {
  using SafeMathUpgradeable for uint256;
  using SafeERC20Upgradeable for IERC20Upgradeable;

  struct PoolInfo {
    // The amount of total deposited token.
    uint128 totalUnderlying;
    // The amount of total deposited shares.
    uint128 totalShare;
    // The accumulated acrv reward per share, with 1e18 precision.
    uint256 accRewardPerShare;
    // The pool id in Convex Booster.
    uint256 convexPoolId;
    // The address of deposited token.
    address lpToken;
    // The address of Convex reward contract.
    address crvRewards;
    // The withdraw fee percentage, with 1e9 precision.
    uint256 withdrawFeePercentage;
    // The platform fee percentage, with 1e9 precision.
    uint256 platformFeePercentage;
    // The harvest bounty percentage, with 1e9 precision.
    uint256 harvestBountyPercentage;
    // Whether deposit for the pool is paused.
    bool pauseDeposit;
    // Whether withdraw for the pool is paused.
    bool pauseWithdraw;
    // The list of addresses of convex reward tokens.
    address[] convexRewardTokens;
  }

  struct UserInfo {
    // The amount of shares the user deposited.
    uint128 shares;
    // The amount of current accrued rewards.
    uint128 rewards;
    // The reward per share already paid for the user, with 1e18 precision.
    uint256 rewardPerSharePaid;
  }

  uint256 private constant PRECISION = 1e18;
  uint256 private constant FEE_DENOMINATOR = 1e9;
  uint256 private constant MAX_WITHDRAW_FEE = 1e8; // 10%
  uint256 private constant MAX_PLATFORM_FEE = 2e8; // 20%
  uint256 private constant MAX_HARVEST_BOUNTY = 1e8; // 10%

  // The address of cvxCRV token.
  address private constant CVXCRV = 0x62B9c7356A2Dc64a1969e19C23e4f579F9810Aa7;
  // The address of CRV token.
  address private constant CRV = 0xD533a949740bb3306d119CC777fa900bA034cd52;
  // The address of WETH token.
  address private constant WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
  // The address of Convex Booster Contract
  address private constant BOOSTER = 0xF403C135812408BFbE8713b5A23a04b3D48AAE31;
  // The address of Curve cvxCRV/CRV Pool
  address private constant CURVE_CVXCRV_CRV_POOL = 0x9D0464996170c6B9e75eED71c68B99dDEDf279e8;
  // The address of Convex CRV => cvxCRV Contract.
  address private constant CRV_DEPOSITOR = 0x8014595F2AB54cD7c604B00E9fb932176fDc86Ae;

  /// @dev The list of all supported pool.
  PoolInfo[] public poolInfo;
  /// @dev Mapping from pool id to account address to user share info.
  mapping(uint256 => mapping(address => UserInfo)) public userInfo;

  /// @dev The address of AladdinCRV token.
  address public aladdinCRV;
  /// @dev The address of ZAP contract, will be used to swap tokens.
  address public zap;

  /// @dev The address of recipient of platform fee
  address public platform;

  function initialize(
    address _aladdinCRV,
    address _zap,
    address _platform
  ) external initializer {
    OwnableUpgradeable.__Ownable_init();
    ReentrancyGuardUpgradeable.__ReentrancyGuard_init();

    require(_aladdinCRV != address(0), "AladdinConvexVault: zero acrv address");
    require(_zap != address(0), "AladdinConvexVault: zero zap address");
    require(_platform != address(0), "AladdinConvexVault: zero platform address");

    aladdinCRV = _aladdinCRV;
    zap = _zap;
    platform = _platform;
  }

  /********************************** View Functions **********************************/

  /// @notice Returns the number of pools.
  function poolLength() public view returns (uint256 pools) {
    pools = poolInfo.length;
  }

  /// @dev Return the amount of pending AladdinCRV rewards for specific pool.
  /// @param _pid - The pool id.
  /// @param _account - The address of user.
  function pendingReward(uint256 _pid, address _account) public view override returns (uint256) {
    PoolInfo storage _pool = poolInfo[_pid];
    UserInfo storage _userInfo = userInfo[_pid][_account];
    return
      uint256(_userInfo.rewards).add(
        _pool.accRewardPerShare.sub(_userInfo.rewardPerSharePaid).mul(_userInfo.shares) / PRECISION
      );
  }

  /// @dev Return the amount of pending AladdinCRV rewards for all pool.
  /// @param _account - The address of user.
  function pendingRewardAll(address _account) external view override returns (uint256) {
    uint256 _pending;
    for (uint256 i = 0; i < poolInfo.length; i++) {
      _pending += pendingReward(i, _account);
    }
    return _pending;
  }

  /********************************** Mutated Functions **********************************/

  /// @dev Deposit some token to specific pool.
  /// @param _pid - The pool id.
  /// @param _amount - The amount of token to deposit.
  /// @return share - The amount of share after deposit.
  function deposit(uint256 _pid, uint256 _amount) public override returns (uint256 share) {
    require(_amount > 0, "AladdinConvexVault: zero amount deposit");
    require(_pid < poolInfo.length, "AladdinConvexVault: invalid pool");

    // 1. update rewards
    PoolInfo storage _pool = poolInfo[_pid];
    require(!_pool.pauseDeposit, "AladdinConvexVault: pool paused");
    _updateRewards(_pid, msg.sender);

    // 2. transfer user token
    address _lpToken = _pool.lpToken;
    {
      uint256 _before = IERC20Upgradeable(_lpToken).balanceOf(address(this));
      IERC20Upgradeable(_lpToken).safeTransferFrom(msg.sender, address(this), _amount);
      _amount = IERC20Upgradeable(_lpToken).balanceOf(address(this)) - _before;
    }

    // 3. deposit
    return _deposit(_pid, _amount);
  }

  /// @dev Deposit all token of the caller to specific pool.
  /// @param _pid - The pool id.
  /// @return share - The amount of share after deposit.
  function depositAll(uint256 _pid) external override returns (uint256 share) {
    PoolInfo storage _pool = poolInfo[_pid];
    uint256 _balance = IERC20Upgradeable(_pool.lpToken).balanceOf(msg.sender);
    return deposit(_pid, _balance);
  }

  /// @dev Deposit some token to specific pool with zap.
  /// @param _pid - The pool id.
  /// @param _token - The address of token to deposit.
  /// @param _amount - The amount of token to deposit.
  /// @param _minAmount - The minimum amount of share to deposit.
  /// @return share - The amount of share after deposit.
  function zapAndDeposit(
    uint256 _pid,
    address _token,
    uint256 _amount,
    uint256 _minAmount
  ) public payable override returns (uint256 share) {
    require(_amount > 0, "AladdinConvexVault: zero amount deposit");
    require(_pid < poolInfo.length, "AladdinConvexVault: invalid pool");

    PoolInfo storage _pool = poolInfo[_pid];
    require(!_pool.pauseDeposit, "AladdinConvexVault: pool paused");

    address _lpToken = _pool.lpToken;
    if (_lpToken == _token) {
      return deposit(_pid, _amount);
    }

    // 1. update rewards
    _updateRewards(_pid, msg.sender);

    // transfer token to zap contract.
    address _zap = zap;
    uint256 _before;
    if (_token != address(0)) {
      require(msg.value == 0, "AladdinConvexVault: nonzero msg.value");
      _before = IERC20Upgradeable(_token).balanceOf(_zap);
      IERC20Upgradeable(_token).safeTransferFrom(msg.sender, _zap, _amount);
      _amount = IERC20Upgradeable(_token).balanceOf(_zap) - _before;
    } else {
      require(msg.value == _amount, "AladdinConvexVault: invalid amount");
    }

    // zap token to lp token using zap contract.
    _before = IERC20Upgradeable(_lpToken).balanceOf(address(this));
    IZap(_zap).zap{ value: msg.value }(_token, _amount, _lpToken, _minAmount);
    _amount = IERC20Upgradeable(_lpToken).balanceOf(address(this)) - _before;

    share = _deposit(_pid, _amount);

    require(share >= _minAmount, "AladdinConvexVault: insufficient share");
    return share;
  }

  /// @dev Deposit all token to specific pool with zap.
  /// @param _pid - The pool id.
  /// @param _token - The address of token to deposit.
  /// @param _minAmount - The minimum amount of share to deposit.
  /// @return share - The amount of share after deposit.
  function zapAllAndDeposit(
    uint256 _pid,
    address _token,
    uint256 _minAmount
  ) external payable override returns (uint256) {
    uint256 _balance = IERC20Upgradeable(_token).balanceOf(msg.sender);
    return zapAndDeposit(_pid, _token, _balance, _minAmount);
  }

  /// @dev Withdraw some token from specific pool and claim pending rewards.
  /// @param _pid - The pool id.
  /// @param _shares - The share of token want to withdraw.
  /// @param _minOut - The minimum amount of pending reward to receive.
  /// @param _option - The claim option (don't claim, as aCRV, cvxCRV, CRV, CVX, or ETH)
  /// @return withdrawn - The amount of token sent to caller.
  /// @return claimed - The amount of reward sent to caller.
  function withdrawAndClaim(
    uint256 _pid,
    uint256 _shares,
    uint256 _minOut,
    ClaimOption _option
  ) public override nonReentrant returns (uint256 withdrawn, uint256 claimed) {
    require(_shares > 0, "AladdinConvexVault: zero share withdraw");
    require(_pid < poolInfo.length, "AladdinConvexVault: invalid pool");

    // 1. update rewards
    PoolInfo storage _pool = poolInfo[_pid];
    require(!_pool.pauseWithdraw, "AladdinConvexVault: pool paused");
    _updateRewards(_pid, msg.sender);

    // 2. withdraw lp token
    UserInfo storage _userInfo = userInfo[_pid][msg.sender];
    require(_shares <= _userInfo.shares, "AladdinConvexVault: shares not enough");

    uint256 _totalShare = _pool.totalShare;
    uint256 _totalUnderlying = _pool.totalUnderlying;
    uint256 _withdrawable;
    if (_shares == _totalShare) {
      // If user is last to withdraw, don't take withdraw fee.
      // And there may still have some pending rewards, we just simple ignore it now.
      // If we want the reward later, we can upgrade the contract.
      _withdrawable = _totalUnderlying;
    } else {
      // take withdraw fee here
      _withdrawable = _shares.mul(_totalUnderlying) / _totalShare;
      uint256 _fee = _withdrawable.mul(_pool.withdrawFeePercentage) / FEE_DENOMINATOR;
      _withdrawable = _withdrawable - _fee; // never overflow
    }

    _pool.totalShare = _toU128(_totalShare - _shares);
    _pool.totalUnderlying = _toU128(_totalUnderlying - _withdrawable);
    _userInfo.shares = _toU128(uint256(_userInfo.shares) - _shares);

    IConvexBasicRewards(_pool.crvRewards).withdrawAndUnwrap(_withdrawable, false);
    IERC20Upgradeable(_pool.lpToken).safeTransfer(msg.sender, _withdrawable);
    emit Withdraw(_pid, msg.sender, _shares);

    // 3. claim rewards
    if (_option == ClaimOption.None) {
      return (_withdrawable, 0);
    } else {
      uint256 _rewards = _userInfo.rewards;
      _userInfo.rewards = 0;

      emit Claim(msg.sender, _rewards, _option);
      _rewards = _claim(_rewards, _minOut, _option);

      return (_withdrawable, _rewards);
    }
  }

  /// @dev Withdraw all share of token from specific pool and claim pending rewards.
  /// @param _pid - The pool id.
  /// @param _minOut - The minimum amount of pending reward to receive.
  /// @param _option - The claim option (as aCRV, cvxCRV, CRV, CVX, or ETH)
  /// @return withdrawn - The amount of token sent to caller.
  /// @return claimed - The amount of reward sent to caller.
  function withdrawAllAndClaim(
    uint256 _pid,
    uint256 _minOut,
    ClaimOption _option
  ) external override returns (uint256 withdrawn, uint256 claimed) {
    UserInfo storage _userInfo = userInfo[_pid][msg.sender];
    return withdrawAndClaim(_pid, _userInfo.shares, _minOut, _option);
  }

  /// @dev Withdraw some token from specific pool and zap to token.
  /// @param _pid - The pool id.
  /// @param _shares - The share of token want to withdraw.
  /// @param _token - The address of token zapping to.
  /// @param _minOut - The minimum amount of token to receive.
  /// @return withdrawn - The amount of token sent to caller.
  function withdrawAndZap(
    uint256 _pid,
    uint256 _shares,
    address _token,
    uint256 _minOut
  ) public override nonReentrant returns (uint256 withdrawn) {
    require(_shares > 0, "AladdinConvexVault: zero share withdraw");
    require(_pid < poolInfo.length, "AladdinConvexVault: invalid pool");

    // 1. update rewards
    PoolInfo storage _pool = poolInfo[_pid];
    require(!_pool.pauseWithdraw, "AladdinConvexVault: pool paused");
    _updateRewards(_pid, msg.sender);

    // 2. withdraw and zap
    address _lpToken = _pool.lpToken;
    if (_token == _lpToken) {
      return _withdraw(_pid, _shares, msg.sender);
    } else {
      address _zap = zap;
      // withdraw to zap contract
      uint256 _before = IERC20Upgradeable(_lpToken).balanceOf(_zap);
      _withdraw(_pid, _shares, _zap);
      uint256 _amount = IERC20Upgradeable(_lpToken).balanceOf(_zap) - _before;

      // zap to desired token
      if (_token == address(0)) {
        _before = address(this).balance;
        IZap(_zap).zap(_lpToken, _amount, _token, _minOut);
        _amount = address(this).balance - _before;
        msg.sender.transfer(_amount);
      } else {
        _before = IERC20Upgradeable(_token).balanceOf(address(this));
        IZap(_zap).zap(_lpToken, _amount, _token, _minOut);
        _amount = IERC20Upgradeable(_token).balanceOf(address(this)) - _before;
        IERC20Upgradeable(_token).safeTransfer(msg.sender, _amount);
      }
      return _amount;
    }
  }

  /// @dev Withdraw all token from specific pool and zap to token.
  /// @param _pid - The pool id.
  /// @param _token - The address of token zapping to.
  /// @param _minOut - The minimum amount of token to receive.
  /// @return withdrawn - The amount of token sent to caller.
  function withdrawAllAndZap(
    uint256 _pid,
    address _token,
    uint256 _minOut
  ) external override returns (uint256 withdrawn) {
    UserInfo storage _userInfo = userInfo[_pid][msg.sender];
    return withdrawAndZap(_pid, _userInfo.shares, _token, _minOut);
  }

  /// @dev claim pending rewards from specific pool.
  /// @param _pid - The pool id.
  /// @param _minOut - The minimum amount of pending reward to receive.
  /// @param _option - The claim option (as aCRV, cvxCRV, CRV, CVX, or ETH)
  /// @return claimed - The amount of reward sent to caller.
  function claim(
    uint256 _pid,
    uint256 _minOut,
    ClaimOption _option
  ) public override nonReentrant returns (uint256 claimed) {
    require(_pid < poolInfo.length, "AladdinConvexVault: invalid pool");

    PoolInfo storage _pool = poolInfo[_pid];
    require(!_pool.pauseWithdraw, "AladdinConvexVault: pool paused");
    _updateRewards(_pid, msg.sender);

    UserInfo storage _userInfo = userInfo[_pid][msg.sender];
    uint256 _rewards = _userInfo.rewards;
    _userInfo.rewards = 0;

    emit Claim(msg.sender, _rewards, _option);
    _rewards = _claim(_rewards, _minOut, _option);
    return _rewards;
  }

  /// @dev claim pending rewards from all pools.
  /// @param _minOut - The minimum amount of pending reward to receive.
  /// @param _option - The claim option (as aCRV, cvxCRV, CRV, CVX, or ETH)
  /// @return claimed - The amount of reward sent to caller.
  function claimAll(uint256 _minOut, ClaimOption _option) external override nonReentrant returns (uint256 claimed) {
    uint256 _rewards;
    for (uint256 _pid = 0; _pid < poolInfo.length; _pid++) {
      if (poolInfo[_pid].pauseWithdraw) continue; // skip paused pool

      UserInfo storage _userInfo = userInfo[_pid][msg.sender];
      // update if user has share
      if (_userInfo.shares > 0) {
        _updateRewards(_pid, msg.sender);
      }
      // withdraw if user has reward
      if (_userInfo.rewards > 0) {
        _rewards = _rewards.add(_userInfo.rewards);
        _userInfo.rewards = 0;
      }
    }

    emit Claim(msg.sender, _rewards, _option);
    _rewards = _claim(_rewards, _minOut, _option);
    return _rewards;
  }

  /// @dev Harvest the pending reward and convert to aCRV.
  /// @param _pid - The pool id.
  /// @param _recipient - The address of account to receive harvest bounty.
  /// @param _minimumOut - The minimum amount of cvxCRV should get.
  /// @return harvested - The amount of cvxCRV harvested after zapping all other tokens to it.
  function harvest(
    uint256 _pid,
    address _recipient,
    uint256 _minimumOut
  ) external override nonReentrant returns (uint256 harvested) {
    require(_pid < poolInfo.length, "AladdinConvexVault: invalid pool");

    PoolInfo storage _pool = poolInfo[_pid];
    // 1. claim rewards
    IConvexBasicRewards(_pool.crvRewards).getReward();

    // 2. swap all rewards token to CRV
    address[] memory _rewardsToken = _pool.convexRewardTokens;
    uint256 _amount = address(this).balance;
    address _token;
    address _zap = zap;
    for (uint256 i = 0; i < _rewardsToken.length; i++) {
      _token = _rewardsToken[i];
      if (_token != CRV) {
        uint256 _balance = IERC20Upgradeable(_token).balanceOf(address(this));
        if (_balance > 0) {
          // saving gas
          IERC20Upgradeable(_token).safeTransfer(_zap, _balance);
          _amount = _amount.add(IZap(_zap).zap(_token, _balance, address(0), 0));
        }
      }
    }
    if (_amount > 0) {
      IZap(_zap).zap{ value: _amount }(address(0), _amount, CRV, 0);
    }
    _amount = IERC20Upgradeable(CRV).balanceOf(address(this));
    _amount = _swapCRVToCvxCRV(_amount, _minimumOut);

    _token = aladdinCRV; // gas saving
    _approve(CVXCRV, _token, _amount);
    uint256 _rewards = IAladdinCRV(_token).deposit(address(this), _amount);

    // 3. distribute rewards to platform and _recipient
    uint256 _platformFee = _pool.platformFeePercentage;
    uint256 _harvestBounty = _pool.harvestBountyPercentage;
    if (_platformFee > 0) {
      _platformFee = (_platformFee * _rewards) / FEE_DENOMINATOR;
      _rewards = _rewards - _platformFee;
      IERC20Upgradeable(_token).safeTransfer(platform, _platformFee);
    }
    if (_harvestBounty > 0) {
      _harvestBounty = (_harvestBounty * _rewards) / FEE_DENOMINATOR;
      _rewards = _rewards - _harvestBounty;
      IERC20Upgradeable(_token).safeTransfer(_recipient, _harvestBounty);
    }

    // 4. update rewards info
    _pool.accRewardPerShare = _pool.accRewardPerShare.add(_rewards.mul(PRECISION) / _pool.totalShare);

    return _amount;
  }

  /********************************** Restricted Functions **********************************/

  /// @dev Update the withdraw fee percentage.
  /// @param _pid - The pool id.
  /// @param _feePercentage - The fee percentage to update.
  function updateWithdrawFeePercentage(uint256 _pid, uint256 _feePercentage) external onlyOwner {
    require(_pid < poolInfo.length, "AladdinConvexVault: invalid pool");
    require(_feePercentage <= MAX_WITHDRAW_FEE, "AladdinConvexVault: fee too large");

    poolInfo[_pid].withdrawFeePercentage = _feePercentage;

    emit UpdateWithdrawalFeePercentage(_pid, _feePercentage);
  }

  /// @dev Update the platform fee percentage.
  /// @param _pid - The pool id.
  /// @param _feePercentage - The fee percentage to update.
  function updatePlatformFeePercentage(uint256 _pid, uint256 _feePercentage) external onlyOwner {
    require(_pid < poolInfo.length, "AladdinConvexVault: invalid pool");
    require(_feePercentage <= MAX_PLATFORM_FEE, "AladdinConvexVault: fee too large");

    poolInfo[_pid].platformFeePercentage = _feePercentage;

    emit UpdatePlatformFeePercentage(_pid, _feePercentage);
  }

  /// @dev Update the harvest bounty percentage.
  /// @param _pid - The pool id.
  /// @param _percentage - The fee percentage to update.
  function updateHarvestBountyPercentage(uint256 _pid, uint256 _percentage) external onlyOwner {
    require(_pid < poolInfo.length, "AladdinConvexVault: invalid pool");
    require(_percentage <= MAX_HARVEST_BOUNTY, "AladdinConvexVault: fee too large");

    poolInfo[_pid].harvestBountyPercentage = _percentage;

    emit UpdateHarvestBountyPercentage(_pid, _percentage);
  }

  /// @dev Update the recipient
  function updatePlatform(address _platform) external onlyOwner {
    require(_platform != address(0), "AladdinConvexVault: zero platform address");
    platform = _platform;

    emit UpdatePlatform(_platform);
  }

  /// @dev Update the zap contract
  function updateZap(address _zap) external onlyOwner {
    require(_zap != address(0), "AladdinConvexVault: zero zap address");
    zap = _zap;

    emit UpdateZap(_zap);
  }

  /// @dev Add new Convex pool.
  /// @param _convexPid - The Convex pool id.
  /// @param _rewardTokens - The list of addresses of reward tokens.
  /// @param _withdrawFeePercentage - The withdraw fee percentage of the pool.
  /// @param _platformFeePercentage - The platform fee percentage of the pool.
  /// @param _harvestBountyPercentage - The harvest bounty percentage of the pool.
  function addPool(
    uint256 _convexPid,
    address[] memory _rewardTokens,
    uint256 _withdrawFeePercentage,
    uint256 _platformFeePercentage,
    uint256 _harvestBountyPercentage
  ) external onlyOwner {
    for (uint256 i = 0; i < poolInfo.length; i++) {
      require(poolInfo[i].convexPoolId != _convexPid, "AladdinConvexVault: duplicate pool");
    }

    require(_withdrawFeePercentage <= MAX_WITHDRAW_FEE, "AladdinConvexVault: fee too large");
    require(_platformFeePercentage <= MAX_PLATFORM_FEE, "AladdinConvexVault: fee too large");
    require(_harvestBountyPercentage <= MAX_HARVEST_BOUNTY, "AladdinConvexVault: fee too large");

    IConvexBooster.PoolInfo memory _info = IConvexBooster(BOOSTER).poolInfo(_convexPid);
    poolInfo.push(
      PoolInfo({
        totalUnderlying: 0,
        totalShare: 0,
        accRewardPerShare: 0,
        convexPoolId: _convexPid,
        lpToken: _info.lptoken,
        crvRewards: _info.crvRewards,
        withdrawFeePercentage: _withdrawFeePercentage,
        platformFeePercentage: _platformFeePercentage,
        harvestBountyPercentage: _harvestBountyPercentage,
        pauseDeposit: false,
        pauseWithdraw: false,
        convexRewardTokens: _rewardTokens
      })
    );

    emit AddPool(poolInfo.length - 1, _convexPid, _rewardTokens);
  }

  /// @dev update reward tokens
  /// @param _pid - The pool id.
  /// @param _rewardTokens - The address list of new reward tokens.
  function updatePoolRewardTokens(uint256 _pid, address[] memory _rewardTokens) external onlyOwner {
    require(_pid < poolInfo.length, "AladdinConvexVault: invalid pool");

    delete poolInfo[_pid].convexRewardTokens;
    poolInfo[_pid].convexRewardTokens = _rewardTokens;

    emit UpdatePoolRewardTokens(_pid, _rewardTokens);
  }

  /// @dev Pause withdraw for specific pool.
  /// @param _pid - The pool id.
  /// @param _status - The status to update.
  function pausePoolWithdraw(uint256 _pid, bool _status) external onlyOwner {
    require(_pid < poolInfo.length, "AladdinConvexVault: invalid pool");

    poolInfo[_pid].pauseWithdraw = _status;

    emit PausePoolWithdraw(_pid, _status);
  }

  /// @dev Pause deposit for specific pool.
  /// @param _pid - The pool id.
  /// @param _status - The status to update.
  function pausePoolDeposit(uint256 _pid, bool _status) external onlyOwner {
    require(_pid < poolInfo.length, "AladdinConvexVault: invalid pool");

    poolInfo[_pid].pauseDeposit = _status;

    emit PausePoolDeposit(_pid, _status);
  }

  /********************************** Internal Functions **********************************/

  function _updateRewards(uint256 _pid, address _account) internal {
    uint256 _rewards = pendingReward(_pid, _account);
    PoolInfo storage _pool = poolInfo[_pid];
    UserInfo storage _userInfo = userInfo[_pid][_account];

    _userInfo.rewards = _toU128(_rewards);
    _userInfo.rewardPerSharePaid = _pool.accRewardPerShare;
  }

  function _deposit(uint256 _pid, uint256 _amount) internal nonReentrant returns (uint256) {
    PoolInfo storage _pool = poolInfo[_pid];

    _approve(_pool.lpToken, BOOSTER, _amount);
    IConvexBooster(BOOSTER).deposit(_pool.convexPoolId, _amount, true);

    uint256 _totalShare = _pool.totalShare;
    uint256 _totalUnderlying = _pool.totalUnderlying;
    uint256 _shares;
    if (_totalShare == 0) {
      _shares = _amount;
    } else {
      _shares = _amount.mul(_totalShare) / _totalUnderlying;
    }
    _pool.totalShare = _toU128(_totalShare.add(_shares));
    _pool.totalUnderlying = _toU128(_totalUnderlying.add(_amount));

    UserInfo storage _userInfo = userInfo[_pid][msg.sender];
    _userInfo.shares = _toU128(_shares + _userInfo.shares);

    emit Deposit(_pid, msg.sender, _amount);
    return _shares;
  }

  function _withdraw(
    uint256 _pid,
    uint256 _shares,
    address _recipient
  ) internal returns (uint256) {
    PoolInfo storage _pool = poolInfo[_pid];

    // 2. withdraw lp token
    UserInfo storage _userInfo = userInfo[_pid][msg.sender];
    require(_shares <= _userInfo.shares, "AladdinConvexVault: shares not enough");

    uint256 _totalShare = _pool.totalShare;
    uint256 _totalUnderlying = _pool.totalUnderlying;
    uint256 _withdrawable;
    if (_shares == _totalShare) {
      // If user is last to withdraw, don't take withdraw fee.
      // And there may still have some pending rewards, we just simple ignore it now.
      // If we want the reward later, we can upgrade the contract.
      _withdrawable = _totalUnderlying;
    } else {
      // take withdraw fee here
      _withdrawable = _shares.mul(_totalUnderlying) / _totalShare;
      uint256 _fee = _withdrawable.mul(_pool.withdrawFeePercentage) / FEE_DENOMINATOR;
      _withdrawable = _withdrawable - _fee; // never overflow
    }

    _pool.totalShare = _toU128(_totalShare - _shares);
    _pool.totalUnderlying = _toU128(_totalUnderlying - _withdrawable);
    _userInfo.shares = _toU128(uint256(_userInfo.shares) - _shares);

    IConvexBasicRewards(_pool.crvRewards).withdrawAndUnwrap(_withdrawable, false);
    IERC20Upgradeable(_pool.lpToken).safeTransfer(_recipient, _withdrawable);
    emit Withdraw(_pid, msg.sender, _shares);

    return _withdrawable;
  }

  function _claim(
    uint256 _amount,
    uint256 _minOut,
    ClaimOption _option
  ) internal returns (uint256) {
    if (_amount == 0) return _amount;

    IAladdinCRV.WithdrawOption _withdrawOption;
    if (_option == ClaimOption.Claim) {
      require(_amount >= _minOut, "AladdinConvexVault: insufficient output");
      IERC20Upgradeable(aladdinCRV).safeTransfer(msg.sender, _amount);
      return _amount;
    } else if (_option == ClaimOption.ClaimAsCvxCRV) {
      _withdrawOption = IAladdinCRV.WithdrawOption.Withdraw;
    } else if (_option == ClaimOption.ClaimAsCRV) {
      _withdrawOption = IAladdinCRV.WithdrawOption.WithdrawAsCRV;
    } else if (_option == ClaimOption.ClaimAsCVX) {
      _withdrawOption = IAladdinCRV.WithdrawOption.WithdrawAsCVX;
    } else if (_option == ClaimOption.ClaimAsETH) {
      _withdrawOption = IAladdinCRV.WithdrawOption.WithdrawAsETH;
    } else {
      revert("AladdinConvexVault: invalid claim option");
    }
    return IAladdinCRV(aladdinCRV).withdraw(msg.sender, _amount, _minOut, _withdrawOption);
  }

  function _toU128(uint256 _value) internal pure returns (uint128) {
    require(_value < 340282366920938463463374607431768211456, "AladdinConvexVault: overflow");
    return uint128(_value);
  }

  function _swapCRVToCvxCRV(uint256 _amountIn, uint256 _minOut) internal returns (uint256) {
    // CRV swap to CVXCRV or stake to CVXCRV
    // CRV swap to CVXCRV or stake to CVXCRV
    uint256 _amountOut = ICurveFactoryPlainPool(CURVE_CVXCRV_CRV_POOL).get_dy(0, 1, _amountIn);
    bool useCurve = _amountOut > _amountIn;
    require(_amountOut >= _minOut || _amountIn >= _minOut, "AladdinCRVZap: insufficient output");

    if (useCurve) {
      _approve(CRV, CURVE_CVXCRV_CRV_POOL, _amountIn);
      _amountOut = ICurveFactoryPlainPool(CURVE_CVXCRV_CRV_POOL).exchange(0, 1, _amountIn, 0, address(this));
    } else {
      _approve(CRV, CRV_DEPOSITOR, _amountIn);
      uint256 _lockIncentive = IConvexCRVDepositor(CRV_DEPOSITOR).lockIncentive();
      // if use `lock = false`, will possible take fee
      // if use `lock = true`, some incentive will be given
      _amountOut = IERC20Upgradeable(CVXCRV).balanceOf(address(this));
      if (_lockIncentive == 0) {
        // no lock incentive, use `lock = false`
        IConvexCRVDepositor(CRV_DEPOSITOR).deposit(_amountIn, false, address(0));
      } else {
        // no lock incentive, use `lock = true`
        IConvexCRVDepositor(CRV_DEPOSITOR).deposit(_amountIn, true, address(0));
      }
      _amountOut = IERC20Upgradeable(CVXCRV).balanceOf(address(this)) - _amountOut; // never overflow here
    }
    return _amountOut;
  }

  function _approve(
    address _token,
    address _spender,
    uint256 _amount
  ) internal {
    IERC20Upgradeable(_token).safeApprove(_spender, 0);
    IERC20Upgradeable(_token).safeApprove(_spender, _amount);
  }

  receive() external payable {}
}
