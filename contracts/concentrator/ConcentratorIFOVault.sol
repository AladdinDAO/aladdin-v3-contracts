// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;
pragma abicoder v2;

import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/SafeERC20Upgradeable.sol";

import "./AladdinConvexVault.sol";

interface ICONT {
  function mint(address _to, uint256 _value) external returns (bool);
}

contract ConcentratorIFOVault is AladdinConvexVault {
  using SafeMathUpgradeable for uint256;
  using SafeERC20Upgradeable for IERC20Upgradeable;

  event ClaimCONT(uint256 indexed _pid, address indexed _caller, address _recipient, uint256 _amount);
  event IFOMineCONT(uint256 _amount);
  event UpdateIFOConfig(address _rewarder, address _cont, uint256 _startTime, uint256 _endTime);

  uint256 private constant MAX_MINED_CONT = 1_500_000 ether;

  /// @notice Mapping from pool id to accumulated cont reward per share, with 1e18 precision.
  mapping(uint256 => uint256) public accCONTPerShare;

  /// @dev Mapping from pool id to account address to pending cont rewards.
  mapping(uint256 => mapping(address => uint256)) private userCONTRewards;

  /// @dev Mapping from pool id to account address to reward per share
  /// already paid for the user, with 1e18 precision.
  mapping(uint256 => mapping(address => uint256)) private userCONTPerSharePaid;

  /// @notice The address of $CONT token.
  address public cont;

  /// @notice The address of $CONT rewarder for Liquidity Mining
  address public rewarder;

  /// @notice The start timestamp in seconds.
  uint64 public startTime;

  /// @notice The end timestamp in seconds.
  uint64 public endTime;

  /// @notice The amount of $CONT token mined so far.
  uint128 public contMined;

  /********************************** View Functions **********************************/

  /// @notice Return the amount of pending $CONT rewards for specific pool.
  /// @param _pid - The pool id.
  /// @param _account - The address of user.
  function pendingCONT(uint256 _pid, address _account) public view returns (uint256) {
    UserInfo storage _userInfo = userInfo[_pid][_account];
    return
      userCONTRewards[_pid][_account].add(
        accCONTPerShare[_pid].sub(userCONTPerSharePaid[_pid][_account]).mul(_userInfo.shares) / PRECISION
      );
  }

  /********************************** Mutated Functions **********************************/

  /// @notice Claim pending $CONT from specific pool.
  /// @param _pid - The pool id.
  /// @param _recipient The address of recipient who will recieve the token.
  /// @return claimed - The amount of $CONT sent to caller.
  function claimCONT(uint256 _pid, address _recipient) external onlyExistPool(_pid) returns (uint256) {
    _updateRewards(_pid, msg.sender);

    uint256 _rewards = userCONTRewards[_pid][msg.sender];
    userCONTRewards[_pid][msg.sender] = 0;

    IERC20Upgradeable(cont).safeTransfer(_recipient, _rewards);
    emit ClaimCONT(_pid, msg.sender, _recipient, _rewards);

    return _rewards;
  }

  /// @notice Claim pending $CONT from all pools.
  /// @param _recipient The address of recipient who will recieve the token.
  /// @return claimed - The amount of $CONT sent to caller.
  function claimAllCONT(address _recipient) external returns (uint256) {
    uint256 _rewards = 0;
    for (uint256 _pid = 0; _pid < poolInfo.length; _pid++) {
      UserInfo storage _userInfo = userInfo[_pid][msg.sender];

      // update if user has share
      if (_userInfo.shares > 0) {
        _updateRewards(_pid, msg.sender);
      }

      // claim if user has reward
      uint256 _currentPoolRewards = userCONTRewards[_pid][msg.sender];
      if (_currentPoolRewards > 0) {
        _rewards = _rewards.add(_currentPoolRewards);
        userCONTRewards[_pid][msg.sender] = 0;

        emit ClaimCONT(_pid, msg.sender, _recipient, _currentPoolRewards);
      }
    }

    IERC20Upgradeable(cont).safeTransfer(_recipient, _rewards);

    return _rewards;
  }

  /// @notice See {AladdinConvexVault-harvest}
  function harvest(
    uint256 _pid,
    address _recipient,
    uint256 _minimumOut
  ) external override onlyExistPool(_pid) nonReentrant returns (uint256 harvested) {
    PoolInfo storage _pool = poolInfo[_pid];

    // 1. harvest and convert to aCRV
    uint256 _rewards;
    (harvested, _rewards) = _harvestAsACRV(_pid, _minimumOut);

    // 2. do IFO if possible
    // solhint-disable-next-line not-rely-on-time
    if (startTime <= block.timestamp && block.timestamp <= endTime) {
      uint256 _pendingCONT = MAX_MINED_CONT - contMined;
      if (_pendingCONT > _rewards) {
        _pendingCONT = _rewards;
      }
      if (_pendingCONT > 0) {
        accCONTPerShare[_pid] = accCONTPerShare[_pid].add(_pendingCONT.mul(PRECISION) / _pool.totalShare);

        contMined += uint128(_pendingCONT);

        // Vault Mining $CONT
        ICONT(cont).mint(address(this), _pendingCONT);

        // Liquidity Mining $CONT
        ICONT(cont).mint(rewarder, (_pendingCONT * 6) / 100);

        // transfer aCRV to platform
        IERC20Upgradeable(aladdinCRV).safeTransfer(platform, _pendingCONT);

        emit IFOMineCONT(_pendingCONT);
      }
      _rewards -= _pendingCONT;
    }

    if (_rewards > 0) {
      // 3. distribute rewards to platform and _recipient
      address _token = aladdinCRV; // gas saving
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

      emit Harvest(msg.sender, _rewards, _platformFee, _harvestBounty);
    }
  }

  /********************************** Restricted Functions **********************************/

  /// @notice Update IFO configuration
  /// @param _rewarder The address of rewarder for Liquidity Mining
  /// @param _cont The address of $CONT token.
  /// @param _startTime The start time of IFO.
  /// @param _endTime The finish time of IFO.
  function updateIFOConfig(
    address _rewarder,
    address _cont,
    uint64 _startTime,
    uint64 _endTime
  ) external onlyOwner {
    rewarder = _rewarder;
    cont = _cont;
    startTime = _startTime;
    endTime = _endTime;

    emit UpdateIFOConfig(_rewarder, _cont, _startTime, _endTime);
  }

  /********************************** Internal Functions **********************************/

  function _updateRewards(uint256 _pid, address _account) internal override {
    // 1. update aCRV rewards
    AladdinConvexVault._updateRewards(_pid, _account);

    // 2. update CONT rewards
    uint256 _contRewards = pendingCONT(_pid, _account);
    userCONTRewards[_pid][_account] = _contRewards;
    userCONTPerSharePaid[_pid][_account] = accCONTPerShare[_pid];
  }

  function _harvestAsACRV(uint256 _pid, uint256 _minimumOut) internal returns (uint256, uint256) {
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

    // 3. deposit cvxCRV as aCRV
    _token = aladdinCRV; // gas saving
    _approve(CVXCRV, _token, _amount);
    uint256 _rewards = IAladdinCRV(_token).deposit(address(this), _amount);

    return (_amount, _rewards);
  }
}
