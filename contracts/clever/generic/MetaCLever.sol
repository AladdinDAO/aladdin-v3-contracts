// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/SafeCastUpgradeable.sol";

import "../../interfaces/IERC20Metadata.sol";
import "../interfaces/IMetaCLever.sol";
import "../interfaces/IMetaFurnace.sol";
import "../interfaces/ICLeverToken.sol";
import "../interfaces/IYieldStrategy.sol";

// solhint-disable not-rely-on-time, max-states-count, reason-string

contract MetaCLever is OwnableUpgradeable, ReentrancyGuardUpgradeable, IMetaCLever {
  using SafeMathUpgradeable for uint256;
  using SafeERC20Upgradeable for IERC20Upgradeable;

  event UpdateFeeInfo(
    address indexed _platform,
    uint32 _platformPercentage,
    uint32 _bountyPercentage,
    uint32 _repayPercentage
  );
  event MigrateYieldStrategy(uint256 _index, address _oldStrategy, address _newStrategy);
  event AddYieldStrategy(uint256 _index, address _strategy);
  event SetStrategyActive(uint256 _index, bool _isActive);
  event UpdateReserveRate(uint256 _reserveRate);
  event UpdateFurnace(address _furnace);

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

  struct YieldStrategyInfo {
    // Whether the strategy is active.
    bool isActive;
    // The address of yield strategy contract.
    address strategy;
    // The address of underlying token.
    address underlyingToken;
    // The address of yield token.
    address yieldToken;
    // The total share of yield token of this strategy.
    uint256 totalShare;
    // The total amount of active yield tokens in CLever.
    uint256 activeYieldTokenAmount;
    // The total amount of yield token could be harvested.
    uint256 harvestableYieldTokenAmount;
    // The expected amount of underlying token should be deposited to this strategy.
    uint256 expectedUnderlyingTokenAmount;
    // The list of extra reward tokens.
    address[] extraRewardTokens;
    // The accRewardPerShare for each reward token.
    mapping(address => uint256) accRewardPerShare;
  }

  /// @dev Compiler will pack this into single `uint256`.
  struct FeeInfo {
    // The address of recipient of platform fee
    address platform;
    // The percentage of rewards to take for platform on harvest, multipled by 1e9.
    uint32 platformPercentage;
    // The percentage of rewards to take for caller on harvest, multipled by 1e9.
    uint32 bountyPercentage;
    // The percentage of repayed underlying/debt token to take on repay, multipled by 1e9.
    uint32 repayPercentage;
  }

  /// @dev Compiler will pack this into single `uint256`.
  struct UserInfo {
    // A signed value which represents the current amount of debt or credit that the account has accrued.
    // Positive values indicate debt, negative values indicate credit.
    int128 totalDebt;
    // The bitmask indicates the strategy that the user has deposited into the system.
    // If the i-th bit is 1, it means the user has deposited.
    // The corresponding bit will be cleared if the user takes all token from the strategy.
    uint128 depositMask;
    // The share balances for each yield strategy.
    mapping(uint256 => uint256) share;
    // The pending rewards for each extra reward token in each yield strategy.
    mapping(uint256 => mapping(address => uint256)) pendingRewards;
    // The last accRewardPerShare for each extra reward token in each yield strategy.
    mapping(uint256 => mapping(address => uint256)) accRewardPerSharePaid;
  }

  /// @notice The address of debtToken contract.
  address public debtToken;

  /// @dev Mapping from user address to user info.
  mapping(address => UserInfo) private userInfo;

  /// @notice Mapping from strategy index to YieldStrategyInfo.
  mapping(uint256 => YieldStrategyInfo) public yieldStrategies;

  /// @notice The total number of available yield strategies.
  uint256 public yieldStrategyIndex;

  /// @notice The address of Furnace Contract.
  address public furnace;

  /// @notice The debt reserve rate to borrow debtToken for each user.
  uint256 public reserveRate;

  /// @notice The fee information, including platform fee, bounty fee and repay fee.
  FeeInfo public feeInfo;

  modifier onlyExistingStrategy(uint256 _strategyIndex) {
    require(_strategyIndex < yieldStrategyIndex, "CLever: strategy not exist");
    _;
  }

  modifier onlyActiveStrategy(uint256 _strategyIndex) {
    require(yieldStrategies[_strategyIndex].isActive, "CLever: strategy not active");
    _;
  }

  function initialize(address _debtToken, address _furnace) external initializer {
    OwnableUpgradeable.__Ownable_init();
    ReentrancyGuardUpgradeable.__ReentrancyGuard_init();

    require(_debtToken != address(0), "CLever: zero address");
    require(_furnace != address(0), "CLever: zero address");
    require(IERC20Metadata(_debtToken).decimals() == 18, "CLever: decimal mismatch");

    // The Furnace is maintained by our team, it's safe to approve uint256.max.
    IERC20Upgradeable(_debtToken).safeApprove(_furnace, uint256(-1));

    debtToken = _debtToken;
    furnace = _furnace;
    reserveRate = 500_000_000; // 50%
  }

  /********************************** View Functions **********************************/

  /// @notice Return all active yield strategies.
  ///
  /// @return _indices The indices of all active yield strategies.
  /// @return _strategies The list of strategy addresses for corresponding yield strategy.
  /// @return _underlyingTokens The list of underlying token addresses for corresponding yield strategy.
  /// @return _yieldTokens The list of yield token addresses for corresponding yield strategy.
  function getActiveYieldStrategies()
    external
    view
    returns (
      uint256[] memory _indices,
      address[] memory _strategies,
      address[] memory _underlyingTokens,
      address[] memory _yieldTokens
    )
  {
    uint256 _yieldStrategyIndex = yieldStrategyIndex;
    uint256 _totalActiveStrategies;
    for (uint256 i = 0; i < _yieldStrategyIndex; i++) {
      if (yieldStrategies[i].isActive) _totalActiveStrategies += 1;
    }

    _indices = new uint256[](_totalActiveStrategies);
    _strategies = new address[](_totalActiveStrategies);
    _underlyingTokens = new address[](_totalActiveStrategies);
    _yieldTokens = new address[](_totalActiveStrategies);

    _totalActiveStrategies = 0;
    for (uint256 i = 0; i < _yieldStrategyIndex; i++) {
      if (yieldStrategies[i].isActive) {
        _indices[_totalActiveStrategies] = i;
        _strategies[_totalActiveStrategies] = yieldStrategies[i].strategy;
        _underlyingTokens[_totalActiveStrategies] = yieldStrategies[i].underlyingToken;
        _yieldTokens[_totalActiveStrategies] = yieldStrategies[i].yieldToken;
        _totalActiveStrategies += 1;
      }
    }
  }

  /// @notice Return the amount of yield token per share.
  /// @param _strategyIndex The index of yield strategy to query.
  function getYieldTokenPerShare(uint256 _strategyIndex)
    external
    view
    onlyExistingStrategy(_strategyIndex)
    returns (uint256)
  {
    return _getYieldTokenPerShare(_strategyIndex);
  }

  /// @notice Return the amount of underlying token per share.
  /// @param _strategyIndex The index of yield strategy to query.
  function getUnderlyingTokenPerShare(uint256 _strategyIndex)
    external
    view
    onlyExistingStrategy(_strategyIndex)
    returns (uint256)
  {
    return _getUnderlyingTokenPerShare(_strategyIndex);
  }

  /// @notice Return user info in this contract.
  ///
  /// @param _account The address of user.
  ///
  /// @return _totalDebt A signed value which represents the current amount of debt or credit that the account has accrued.
  /// @return _totalValue The total amount of collateral deposited, multipled by 1e18.
  /// @return _indices The indices of each yield strategy deposited.
  /// @return _shares The user shares of each yield strategy deposited.
  function getUserInfo(address _account)
    external
    view
    returns (
      int256 _totalDebt,
      uint256 _totalValue,
      uint256[] memory _indices,
      uint256[] memory _shares
    )
  {
    _totalDebt = userInfo[_account].totalDebt;
    _totalValue = _getTotalValue(_account);

    uint256 _totalDepositedStrategies;
    uint256 _yieldStrategyIndex = yieldStrategyIndex;
    uint256 _depositMask = userInfo[_account].depositMask;
    for (uint256 i = 0; i < _yieldStrategyIndex; i++) {
      _totalDepositedStrategies += (_depositMask >> i) & 1;
    }

    _indices = new uint256[](_totalDepositedStrategies);
    _shares = new uint256[](_totalDepositedStrategies);
    _totalDepositedStrategies = 0;

    for (uint256 i = 0; i < _yieldStrategyIndex; i++) {
      if (_depositMask & 1 == 1) {
        uint256 _share = userInfo[_account].share[i];
        address _underlyingToken = yieldStrategies[i].underlyingToken;
        uint256 _accRewardPerShare = yieldStrategies[i].accRewardPerShare[_underlyingToken];
        uint256 _accRewardPerSharePaid = userInfo[_account].accRewardPerSharePaid[i][_underlyingToken];
        if (_accRewardPerShare > _accRewardPerSharePaid) {
          uint256 _scale = 10**(18 - IERC20Metadata(_underlyingToken).decimals());
          _totalDebt -= SafeCastUpgradeable.toInt256(
            (_share.mul(_accRewardPerShare - _accRewardPerSharePaid)).div(PRECISION).mul(_scale)
          );
        }

        _indices[_totalDepositedStrategies] = i;
        _shares[_totalDepositedStrategies] = _share;
        _totalDepositedStrategies += 1;
      }
      _depositMask >>= 1;
    }
  }

  /// @notice Return user info by strategy index.
  ///
  /// @param _account The address of user.
  /// @param _strategyIndex The index of yield strategy to query.
  ///
  /// @return _share The amount of yield token share of the user.
  /// @return _underlyingTokenAmount The amount of underlying token of the user.
  /// @return _yieldTokenAmount The amount of yield token of the user.
  function getUserStrategyInfo(address _account, uint256 _strategyIndex)
    external
    view
    onlyExistingStrategy(_strategyIndex)
    returns (
      uint256 _share,
      uint256 _underlyingTokenAmount,
      uint256 _yieldTokenAmount
    )
  {
    UserInfo storage _userInfo = userInfo[_account];

    _share = _userInfo.share[_strategyIndex];
    _underlyingTokenAmount = _share.mul(_getUnderlyingTokenPerShare(_strategyIndex)) / PRECISION;
    _yieldTokenAmount = _share.mul(_getYieldTokenPerShare(_strategyIndex)) / PRECISION;
  }

  /// @notice Return the pending extra rewards for user.
  ///
  /// @param _strategyIndex The index of yield strategy to query.
  /// @param _account The address of user.
  /// @param _token The address of extra reward token.
  ///
  /// @return _rewards The amount of pending extra rewards.
  function getUserPendingExtraReward(
    uint256 _strategyIndex,
    address _account,
    address _token
  ) external view onlyExistingStrategy(_strategyIndex) returns (uint256 _rewards) {
    _rewards = userInfo[_account].pendingRewards[_strategyIndex][_token];

    uint256 _accRewardPerShare = yieldStrategies[_strategyIndex].accRewardPerShare[_token];
    uint256 _accRewardPerSharePaid = userInfo[_account].accRewardPerSharePaid[_strategyIndex][_token];

    if (_accRewardPerSharePaid < _accRewardPerShare) {
      uint256 _share = userInfo[_account].share[_strategyIndex];
      _rewards += _share.mul(_accRewardPerShare - _accRewardPerSharePaid) / PRECISION;
    }
  }

  /********************************** Mutated Functions **********************************/

  /// @inheritdoc IMetaCLever
  function deposit(
    uint256 _strategyIndex,
    address _recipient,
    uint256 _amount,
    uint256 _minShareOut,
    bool _isUnderlying
  ) external override nonReentrant onlyActiveStrategy(_strategyIndex) returns (uint256 _shares) {
    require(_amount > 0, "CLever: deposit zero amount");

    YieldStrategyInfo storage _yieldStrategy = yieldStrategies[_strategyIndex];
    UserInfo storage _userInfo = userInfo[_recipient];

    // 1. transfer token to yield strategy
    address _strategy = _yieldStrategy.strategy;
    address _token = _isUnderlying ? _yieldStrategy.underlyingToken : _yieldStrategy.yieldToken;
    {
      // common practice to handle all kinds of ERC20 token
      uint256 _beforeBalance = IERC20Upgradeable(_token).balanceOf(_strategy);
      IERC20Upgradeable(_token).safeTransferFrom(msg.sender, _strategy, _amount);
      _amount = IERC20Upgradeable(_token).balanceOf(_strategy).sub(_beforeBalance);
    }
    // @note reuse `_amount` to store the actual yield token deposited.
    _amount = IYieldStrategy(_strategy).deposit(_recipient, _amount, _isUnderlying);

    // 2. update harvestable yield token
    _updateHarvestable(_strategyIndex);

    // 3. update account rewards
    _updateReward(_strategyIndex, _recipient);

    // 4. compute new deposited shares
    // @note The value is already updated in step 2, it's safe to use storage value directly.
    uint256 _activeYieldTokenAmount = _yieldStrategy.activeYieldTokenAmount;
    uint256 _totalShare = _yieldStrategy.totalShare;
    if (_activeYieldTokenAmount == 0) {
      _shares = _amount;
    } else {
      _shares = _amount.mul(_totalShare) / _activeYieldTokenAmount;
    }
    require(_shares >= _minShareOut, "CLever: insufficient shares");

    // 5. update yield strategy info
    _yieldStrategy.totalShare = _totalShare.add(_shares);
    _updateActiveBalance(_strategyIndex, int256(_amount));

    // 6. update account info
    // @note reuse `_totalShare` to store total user shares.
    _totalShare = _userInfo.share[_strategyIndex];
    _userInfo.share[_strategyIndex] = _totalShare + _shares; // safe to do addition
    if (_totalShare == 0) {
      _userInfo.depositMask |= uint64(1 << _strategyIndex);
    }

    emit Deposit(_strategyIndex, _recipient, _shares, _amount);
  }

  /// @inheritdoc IMetaCLever
  function withdraw(
    uint256 _strategyIndex,
    address _recipient,
    uint256 _share,
    uint256 _minAmountOut,
    bool _asUnderlying
  ) external override nonReentrant onlyActiveStrategy(_strategyIndex) returns (uint256) {
    require(_share > 0, "CLever: withdraw zero share");

    UserInfo storage _userInfo = userInfo[msg.sender];
    require(_share <= _userInfo.share[_strategyIndex], "CLever: withdraw exceed balance");

    YieldStrategyInfo storage _yieldStrategy = yieldStrategies[_strategyIndex];

    // 1. update harvestable yield token
    _updateHarvestableByMask(_userInfo.depositMask);

    // 2. update account rewards
    _updateReward(msg.sender);

    // 3. compute actual amount of yield token to withdraw
    // @note The value is already updated in step 1, it's safe to use storage value directly.
    uint256 _totalShare = _yieldStrategy.totalShare;
    uint256 _activeYieldTokenAmount = _yieldStrategy.activeYieldTokenAmount;
    uint256 _amount = _share.mul(_activeYieldTokenAmount) / _totalShare;

    // 4. update yield yield strategy info
    _yieldStrategy.totalShare = _totalShare - _share; // safe to do subtract
    _updateActiveBalance(_strategyIndex, -int256(_amount));

    // 5. update account info
    // @note `_totalShare` is resued to store user share.
    _totalShare = _userInfo.share[_strategyIndex];
    _userInfo.share[_strategyIndex] = _totalShare - _share; // safe to do subtract
    if (_totalShare == _share) {
      _userInfo.depositMask ^= uint64(1 << _strategyIndex);
    }

    // 6. validate account health
    _checkAccountHealth(msg.sender);

    // 7. withdraw token from yield strategy
    // @note The variable `_amount` is reused as the amount of token received after withdraw.
    _amount = IYieldStrategy(_yieldStrategy.strategy).withdraw(_recipient, _amount, _asUnderlying);
    require(_amount >= _minAmountOut, "CLever: insufficient output");

    emit Withdraw(_strategyIndex, msg.sender, _share, _amount);

    return _amount;
  }

  /// @inheritdoc IMetaCLever
  function repay(
    address _underlyingToken,
    address _recipient,
    uint256 _amount
  ) external override nonReentrant {
    require(_amount > 0, "CLever: repay zero amount");

    // check token is valid
    {
      uint256 _yieldStrategyIndex = yieldStrategyIndex;
      bool _found;
      for (uint256 i = 0; i < _yieldStrategyIndex; i++) {
        if (yieldStrategies[i].isActive && yieldStrategies[i].underlyingToken == _underlyingToken) {
          _found = true;
          break;
        }
      }
      require(_found, "CLever: invalid underlying token");
    }

    UserInfo storage _userInfo = userInfo[_recipient];

    // 1. update reward info
    _updateReward(_recipient);

    // 2. check debt and update debt
    {
      int256 _debt = _userInfo.totalDebt;
      require(_debt > 0, "CLever: no debt to repay");
      uint256 _scale = 10**(18 - IERC20Metadata(_underlyingToken).decimals());
      uint256 _maximumAmount = uint256(_debt) / _scale;
      if (_amount > _maximumAmount) _amount = _maximumAmount;
      uint256 _debtPaid = _amount * _scale;
      _userInfo.totalDebt = int128(_debt - int256(_debtPaid)); // safe to do cast
    }

    // 3. take fee and transfer token to Furnace
    FeeInfo memory _feeInfo = feeInfo;
    if (_feeInfo.repayPercentage > 0) {
      uint256 _fee = (_amount * _feeInfo.repayPercentage) / FEE_PRECISION;
      IERC20Upgradeable(_underlyingToken).safeTransferFrom(msg.sender, _feeInfo.platform, _fee);
    }
    address _furnace = furnace;
    IERC20Upgradeable(_underlyingToken).safeTransferFrom(msg.sender, _furnace, _amount);
    IMetaFurnace(_furnace).distribute(address(this), _underlyingToken, _amount);

    emit Repay(_recipient, _underlyingToken, _amount);
  }

  /// @inheritdoc IMetaCLever
  function mint(
    address _recipient,
    uint256 _amount,
    bool _depositToFurnace
  ) external override nonReentrant {
    require(_amount > 0, "CLever: mint zero amount");

    UserInfo storage _userInfo = userInfo[msg.sender];

    // 1. update harvestable for each yield strategy deposited
    _updateHarvestableByMask(_userInfo.depositMask);

    // 2. update reward info
    _updateReward(msg.sender);

    // 3. update user debt
    int256 _debt = _userInfo.totalDebt;
    _debt += SafeCastUpgradeable.toInt128(SafeCastUpgradeable.toInt256(_amount));
    _userInfo.totalDebt = SafeCastUpgradeable.toInt128(_debt);

    // 4. validate account health
    _checkAccountHealth(msg.sender);

    // 5. mint token to user or deposit to Furnace
    if (_depositToFurnace) {
      ICLeverToken(debtToken).mint(address(this), _amount);
      IMetaFurnace(furnace).deposit(_recipient, _amount);
    } else {
      ICLeverToken(debtToken).mint(_recipient, _amount);
    }

    emit Mint(msg.sender, _recipient, _amount);
  }

  /// @inheritdoc IMetaCLever
  function burn(address _recipient, uint256 _amount) external override nonReentrant {
    require(_amount > 0, "CLever: burn zero amount");

    UserInfo storage _userInfo = userInfo[_recipient];

    // 1. update reward info
    _updateReward(_recipient);

    // 2. check debt and update debt
    int256 _debt = _userInfo.totalDebt;
    require(_debt > 0, "CLever: no debt to burn");
    if (_amount > uint256(_debt)) _amount = uint256(_debt);
    _userInfo.totalDebt = int128(_debt - int256(_amount)); // safe to cast

    // 3. take fee and burn token
    FeeInfo memory _feeInfo = feeInfo;
    if (_feeInfo.repayPercentage > 0) {
      uint256 _fee = (_amount * _feeInfo.repayPercentage) / FEE_PRECISION;
      IERC20Upgradeable(debtToken).safeTransferFrom(msg.sender, _feeInfo.platform, _fee);
    }
    ICLeverToken(debtToken).burnFrom(msg.sender, _amount);

    emit Burn(msg.sender, _recipient, _amount);
  }

  /// @inheritdoc IMetaCLever
  function claim(uint256 _strategyIndex, address _recipient) public override nonReentrant {
    _claim(_strategyIndex, msg.sender, _recipient);
  }

  /// @inheritdoc IMetaCLever
  function claimAll(address _recipient) external override nonReentrant {
    uint256 _yieldStrategyIndex = yieldStrategyIndex;
    for (uint256 i = 0; i < _yieldStrategyIndex; i++) {
      _claim(i, msg.sender, _recipient);
    }
  }

  /// @inheritdoc IMetaCLever
  function harvest(
    uint256 _strategyIndex,
    address _recipient,
    uint256 _minimumOut
  ) external override nonReentrant onlyActiveStrategy(_strategyIndex) returns (uint256) {
    YieldStrategyInfo storage _yieldStrategy = yieldStrategies[_strategyIndex];

    // 1. update harvestable yield token
    _updateHarvestable(_strategyIndex);

    uint256 _harvestedUnderlyingTokenAmount;
    // 2. withdraw some yield token as rewards
    {
      uint256 _harvestable = _yieldStrategy.harvestableYieldTokenAmount;
      if (_harvestable > 0) {
        _harvestedUnderlyingTokenAmount = IYieldStrategy(_yieldStrategy.strategy).withdraw(
          address(this),
          _harvestable,
          true
        );
        _yieldStrategy.harvestableYieldTokenAmount = 0;
      }
    }

    // 3. harvest rewards from yield strategy and distribute extra rewards to users.
    {
      (
        uint256 _extraHarvestedUnderlyingTokenAmount,
        address[] memory _rewardTokens,
        uint256[] memory _amounts
      ) = IYieldStrategy(_yieldStrategy.strategy).harvest();

      _harvestedUnderlyingTokenAmount += _extraHarvestedUnderlyingTokenAmount;
      _distributeExtraRewards(_strategyIndex, _rewardTokens, _amounts);
    }

    require(_harvestedUnderlyingTokenAmount >= _minimumOut, "CLever: insufficient harvested amount");

    // 4. take fee
    address _underlyingToken = IYieldStrategy(_yieldStrategy.strategy).underlyingToken();
    FeeInfo memory _feeInfo = feeInfo;
    uint256 _platformFee;
    uint256 _harvestBounty;
    uint256 _toDistribute = _harvestedUnderlyingTokenAmount;
    if (_feeInfo.platformPercentage > 0) {
      _platformFee = (_feeInfo.platformPercentage * _toDistribute) / FEE_PRECISION;
      IERC20Upgradeable(_underlyingToken).safeTransfer(_feeInfo.platform, _platformFee);
      _toDistribute -= _platformFee;
    }
    if (_feeInfo.bountyPercentage > 0) {
      _harvestBounty = (_feeInfo.bountyPercentage * _toDistribute) / FEE_PRECISION;
      IERC20Upgradeable(_underlyingToken).safeTransfer(_recipient, _harvestBounty);
      _toDistribute -= _harvestBounty;
    }

    // 5. distribute underlying token to users
    if (_toDistribute > 0) {
      _distribute(_strategyIndex, _toDistribute);
    }

    emit Harvest(_strategyIndex, _toDistribute, _platformFee, _harvestBounty);

    return _harvestedUnderlyingTokenAmount;
  }

  /// @notice Update the reward info for specific account.
  ///
  /// @param _account The address of account to update.
  function updateReward(address _account) external nonReentrant {
    UserInfo storage _userInfo = userInfo[_account];

    _updateHarvestableByMask(_userInfo.depositMask);
    _updateReward(_account);
  }

  /********************************** Restricted Functions **********************************/

  /// @notice Update the fee information.
  /// @param _platform The platform address to be updated.
  /// @param _platformPercentage The platform fee percentage to be updated, multipled by 1e9.
  /// @param _bountyPercentage The harvest bounty percentage to be updated, multipled by 1e9.
  /// @param _repayPercentage The repay fee percentage to be updated, multipled by 1e9.
  function updateFeeInfo(
    address _platform,
    uint32 _platformPercentage,
    uint32 _bountyPercentage,
    uint32 _repayPercentage
  ) external onlyOwner {
    require(_platform != address(0), "CLever: zero address");
    require(_platformPercentage <= MAX_PLATFORM_FEE, "CLever: platform fee too large");
    require(_bountyPercentage <= MAX_HARVEST_BOUNTY, "CLever: bounty fee too large");
    require(_repayPercentage <= MAX_REPAY_FEE, "CLever: repay fee too large");

    feeInfo = FeeInfo(_platform, _platformPercentage, _bountyPercentage, _repayPercentage);

    emit UpdateFeeInfo(_platform, _platformPercentage, _bountyPercentage, _repayPercentage);
  }

  /// @notice Add new yield strategy
  ///
  /// @param _strategy The address of the new strategy.
  function addYieldStrategy(address _strategy, address[] memory _extraRewardTokens) external onlyOwner {
    require(_strategy != address(0), "CLever: add empty strategy");

    uint256 _yieldStrategyIndex = yieldStrategyIndex;
    for (uint256 i = 0; i < _yieldStrategyIndex; i++) {
      require(yieldStrategies[i].strategy != _strategy, "CLever: add duplicated strategy");
    }

    require(IERC20Metadata(IYieldStrategy(_strategy).underlyingToken()).decimals() <= 18, "CLever: decimals too large");

    yieldStrategies[_yieldStrategyIndex].strategy = _strategy;
    yieldStrategies[_yieldStrategyIndex].underlyingToken = IYieldStrategy(_strategy).underlyingToken();
    yieldStrategies[_yieldStrategyIndex].yieldToken = IYieldStrategy(_strategy).yieldToken();
    yieldStrategies[_yieldStrategyIndex].isActive = true;
    yieldStrategies[_yieldStrategyIndex].extraRewardTokens = _extraRewardTokens;
    yieldStrategyIndex = _yieldStrategyIndex + 1;

    emit AddYieldStrategy(_yieldStrategyIndex, _strategy);
  }

  /// @notice Active or deactive an existing yield strategy.
  ///
  /// @param _strategyIndex The index of yield strategy to update.
  /// @param _isActive The status to update.
  function setIsActive(uint256 _strategyIndex, bool _isActive) external onlyExistingStrategy(_strategyIndex) onlyOwner {
    yieldStrategies[_strategyIndex].isActive = _isActive;

    emit SetStrategyActive(_strategyIndex, _isActive);
  }

  /// @notice Migrate an existing yield stategy to a new address.
  ///
  /// @param _strategyIndex The index of yield strategy to migrate.
  /// @param _newStrategy The address of the new strategy.
  function migrateYieldStrategy(uint256 _strategyIndex, address _newStrategy)
    external
    onlyExistingStrategy(_strategyIndex)
    onlyOwner
  {
    address _oldStrategy = yieldStrategies[_strategyIndex].strategy;
    require(_oldStrategy != _newStrategy, "CLever: migrate to same strategy");
    require(
      IYieldStrategy(_oldStrategy).yieldToken() == IYieldStrategy(_newStrategy).yieldToken(),
      "CLever: yield token mismatch"
    );
    require(
      IYieldStrategy(_oldStrategy).underlyingToken() == IYieldStrategy(_newStrategy).underlyingToken(),
      "CLever: underlying token mismatch"
    );

    // 1. update harvestable
    _updateHarvestable(_strategyIndex);

    // 2. do migration
    uint256 _oldYieldAmount = IYieldStrategy(_oldStrategy).totalYieldToken();
    uint256 _newYieldAmount = IYieldStrategy(_oldStrategy).migrate(_newStrategy);
    IYieldStrategy(_newStrategy).onMigrateFinished(_newYieldAmount);

    // 3. update yield strategy
    yieldStrategies[_strategyIndex].strategy = _newStrategy;
    if (_oldYieldAmount > 0) {
      yieldStrategies[_strategyIndex].activeYieldTokenAmount =
        (yieldStrategies[_strategyIndex].activeYieldTokenAmount * _newYieldAmount) /
        _oldYieldAmount;
      yieldStrategies[_strategyIndex].harvestableYieldTokenAmount =
        (yieldStrategies[_strategyIndex].harvestableYieldTokenAmount * _newYieldAmount) /
        _oldYieldAmount;
    }

    emit MigrateYieldStrategy(_strategyIndex, _oldStrategy, _newStrategy);
  }

  /// @notice Update the reserve rate for the system.
  ///
  /// @param _reserveRate The reserve rate to update.
  function updateReserveRate(uint256 _reserveRate) external onlyOwner {
    require(_reserveRate <= FEE_PRECISION, "CLever: invalid reserve rate");
    reserveRate = _reserveRate;

    emit UpdateReserveRate(_reserveRate);
  }

  /// @notice Update the furnace contract.
  ///
  /// @param _furnace The new furnace address to update.
  function updateFurnace(address _furnace) external onlyOwner {
    require(_furnace != address(0), "CLever: zero furnace address");

    address _debtToken = debtToken;
    // revoke approve from old furnace
    IERC20Upgradeable(_debtToken).safeApprove(furnace, uint256(0));
    // approve max to new furnace
    IERC20Upgradeable(_debtToken).safeApprove(_furnace, uint256(-1));

    furnace = _furnace;

    emit UpdateFurnace(_furnace);
  }

  /********************************** Internal Functions **********************************/

  /// @dev Internal function to claim pending extra rewards.
  ///
  /// @param _strategyIndex The index of yield strategy to claim.
  /// @param _account The address of account to claim reward.
  /// @param _recipient The address of recipient to receive the reward.
  function _claim(
    uint256 _strategyIndex,
    address _account,
    address _recipient
  ) internal {
    UserInfo storage _userInfo = userInfo[_account];
    YieldStrategyInfo storage _yieldStrategy = yieldStrategies[_strategyIndex];

    // 1. update reward info
    _updateReward(_strategyIndex, _account);

    // 2. claim rewards
    uint256 _length = _yieldStrategy.extraRewardTokens.length;
    address _rewardToken;
    uint256 _rewardAmount;
    for (uint256 i = 0; i < _length; i++) {
      _rewardToken = _yieldStrategy.extraRewardTokens[i];
      _rewardAmount = _userInfo.pendingRewards[_strategyIndex][_rewardToken];
      if (_rewardAmount > 0) {
        IERC20Upgradeable(_rewardToken).safeTransfer(_recipient, _rewardAmount);
        _userInfo.pendingRewards[_strategyIndex][_rewardToken] = 0;
        emit Claim(_strategyIndex, _rewardToken, _rewardAmount);
      }
    }
  }

  /// @dev Internal function to update `harvestableYieldTokenAmount` according to bitmask.
  /// If the correspond bit is set to `1`, we should update the corresponding yield strategy.
  ///
  /// @param _mask The bitmask used to update `harvestableYieldTokenAmount` for each yield strategy.
  function _updateHarvestableByMask(uint256 _mask) internal {
    uint256 _yieldStrategyIndex = yieldStrategyIndex;
    for (uint256 i = 0; i < _yieldStrategyIndex; i++) {
      if (_mask & 1 == 1) {
        _updateHarvestable(i);
      }
      _mask >>= 1;
    }
  }

  /// @dev Internal function to update `harvestableYieldTokenAmount` for corresponding yield strategy.
  ///
  /// @param _strategyIndex The index of yield strategy to update.
  function _updateHarvestable(uint256 _strategyIndex) internal {
    uint256 _activeYieldTokenAmount = yieldStrategies[_strategyIndex].activeYieldTokenAmount;
    if (_activeYieldTokenAmount == 0) return;

    uint256 _rate = IYieldStrategy(yieldStrategies[_strategyIndex].strategy).underlyingPrice();

    uint256 _currentUnderlyingTokenAmount = _activeYieldTokenAmount.mul(_rate) / PRECISION;
    uint256 _expectedUnderlyingTokenAmount = yieldStrategies[_strategyIndex].expectedUnderlyingTokenAmount;
    if (_currentUnderlyingTokenAmount <= _expectedUnderlyingTokenAmount) return;

    uint256 _harvestable = (_currentUnderlyingTokenAmount - _expectedUnderlyingTokenAmount).mul(PRECISION) / _rate;

    if (_harvestable > 0) {
      yieldStrategies[_strategyIndex].activeYieldTokenAmount = _activeYieldTokenAmount.sub(_harvestable);
      yieldStrategies[_strategyIndex].harvestableYieldTokenAmount += _harvestable;
    }
  }

  /// @dev Internal function to update `activeYieldTokenAmount` and `expectedUnderlyingTokenAmount` for
  /// corresponding yield strategy.
  ///
  /// @param _strategyIndex The index of yield strategy to update.
  /// @param _delta The delta amount of yield token.
  function _updateActiveBalance(uint256 _strategyIndex, int256 _delta) internal {
    uint256 _activeYieldTokenAmount = yieldStrategies[_strategyIndex].activeYieldTokenAmount;
    uint256 _expectedUnderlyingTokenAmount = yieldStrategies[_strategyIndex].expectedUnderlyingTokenAmount;

    uint256 _rate = IYieldStrategy(yieldStrategies[_strategyIndex].strategy).underlyingPrice();

    if (_delta > 0) {
      _activeYieldTokenAmount = _activeYieldTokenAmount.add(uint256(_delta));
      _expectedUnderlyingTokenAmount = _expectedUnderlyingTokenAmount.add(uint256(_delta).mul(_rate) / PRECISION);
    } else {
      _activeYieldTokenAmount = _activeYieldTokenAmount.sub(uint256(-_delta));
      _expectedUnderlyingTokenAmount = _expectedUnderlyingTokenAmount.sub(uint256(-_delta).mul(_rate) / PRECISION);
    }

    yieldStrategies[_strategyIndex].activeYieldTokenAmount = _activeYieldTokenAmount;
    yieldStrategies[_strategyIndex].expectedUnderlyingTokenAmount = _expectedUnderlyingTokenAmount;
  }

  /// @dev Internal function to update rewards for user in all yield strategies.
  ///
  /// @param _account The address of account to update reward info.
  function _updateReward(address _account) internal {
    uint256 _depositMask = userInfo[_account].depositMask;
    uint256 _yieldStrategyIndex = yieldStrategyIndex;
    for (uint256 i = 0; i < _yieldStrategyIndex; i++) {
      if (_depositMask & 1 == 1) {
        _updateReward(i, _account);
      }
      _depositMask >>= 1;
    }
  }

  /// @dev Internal function to update rewards for user in specific yield strategy.
  ///
  /// @param _strategyIndex The index of yield strategy to update.
  /// @param _account The address of account to update reward info.
  function _updateReward(uint256 _strategyIndex, address _account) internal {
    UserInfo storage _userInfo = userInfo[_account];
    YieldStrategyInfo storage _yieldStrategyInfo = yieldStrategies[_strategyIndex];

    uint256 _share = _userInfo.share[_strategyIndex];

    // 1. update user debt
    address _token = _yieldStrategyInfo.underlyingToken;
    uint256 _accRewardPerShare = _yieldStrategyInfo.accRewardPerShare[_token];
    uint256 _accRewardPerSharePaid = _userInfo.accRewardPerSharePaid[_strategyIndex][_token];
    if (_accRewardPerSharePaid < _accRewardPerShare) {
      uint256 _scale = 10**(18 - IERC20Metadata(_token).decimals());
      uint256 _rewards = (_share.mul(_accRewardPerShare - _accRewardPerSharePaid) / PRECISION).mul(_scale);
      _userInfo.totalDebt -= SafeCastUpgradeable.toInt128(SafeCastUpgradeable.toInt256(_rewards));
      _userInfo.accRewardPerSharePaid[_strategyIndex][_token] = _accRewardPerShare;
    }

    // 2. update extra rewards
    uint256 _length = _yieldStrategyInfo.extraRewardTokens.length;
    for (uint256 i = 0; i < _length; i++) {
      _token = _yieldStrategyInfo.extraRewardTokens[i];
      _accRewardPerShare = _yieldStrategyInfo.accRewardPerShare[_token];
      _accRewardPerSharePaid = _userInfo.accRewardPerSharePaid[_strategyIndex][_token];
      if (_accRewardPerSharePaid < _accRewardPerShare) {
        uint256 _rewards = _share.mul(_accRewardPerShare - _accRewardPerSharePaid) / PRECISION;
        _userInfo.pendingRewards[_strategyIndex][_token] += _rewards;
        _userInfo.accRewardPerSharePaid[_strategyIndex][_token] = _accRewardPerShare;
      }
    }
  }

  /// @dev Internal function to underlying token rewards to all depositors.
  ///
  /// @param _strategyIndex The index of yield strategy to update.
  /// @param _amount The amount of underlying token to distribute.
  function _distribute(uint256 _strategyIndex, uint256 _amount) internal {
    address _furnace = furnace;
    address _underlyingToken = yieldStrategies[_strategyIndex].underlyingToken;
    IERC20Upgradeable(_underlyingToken).safeTransfer(_furnace, _amount);
    IMetaFurnace(_furnace).distribute(address(this), _underlyingToken, _amount);

    uint256 _totalShare = yieldStrategies[_strategyIndex].totalShare;
    if (_totalShare == 0) return;

    uint256 _accRewardPerShare = yieldStrategies[_strategyIndex].accRewardPerShare[_underlyingToken];
    yieldStrategies[_strategyIndex].accRewardPerShare[_underlyingToken] = _accRewardPerShare.add(
      _amount.mul(PRECISION) / _totalShare
    );
  }

  /// @dev Internal function to distribute extra reward tokens to all depositors.
  ///
  /// @param _strategyIndex The index of yield strategy to update.
  /// @param _rewardTokens The list of addresses of extra reward tokens to distribute.
  /// @param _amounts The list of amount of extra reward tokens to distribute.
  function _distributeExtraRewards(
    uint256 _strategyIndex,
    address[] memory _rewardTokens,
    uint256[] memory _amounts
  ) internal {
    uint256 _totalShare = yieldStrategies[_strategyIndex].totalShare;
    if (_totalShare == 0) return;
    for (uint256 i = 0; i < _rewardTokens.length; i++) {
      address _token = _rewardTokens[i];
      uint256 _accRewardPerShare = yieldStrategies[_strategyIndex].accRewardPerShare[_token];
      yieldStrategies[_strategyIndex].accRewardPerShare[_token] = _accRewardPerShare.add(
        _amounts[i].mul(PRECISION) / _totalShare
      );
    }
  }

  /// @dev Internal function to return the amount of yield token per share.
  /// @param _strategyIndex The index of yield strategy to query.
  function _getYieldTokenPerShare(uint256 _strategyIndex) internal view returns (uint256) {
    uint256 _totalShare = yieldStrategies[_strategyIndex].totalShare;
    if (_totalShare == 0) return 0;

    uint256 _activeYieldTokenAmount = _calculateActiveYieldTokenAmount(_strategyIndex);

    return (_activeYieldTokenAmount * PRECISION) / _totalShare;
  }

  /// @dev Internal function to return the amount of underlying token per share.
  /// @param _strategyIndex The index of yield strategy to query.
  function _getUnderlyingTokenPerShare(uint256 _strategyIndex) internal view returns (uint256) {
    uint256 _totalShare = yieldStrategies[_strategyIndex].totalShare;
    if (_totalShare == 0) return 0;

    uint256 _activeYieldTokenAmount = _calculateActiveYieldTokenAmount(_strategyIndex);
    uint256 _rate = IYieldStrategy(yieldStrategies[_strategyIndex].strategy).underlyingPrice();
    uint256 _activeUnderlyingTokenAmount = (_activeYieldTokenAmount * _rate) / PRECISION;

    return (_activeUnderlyingTokenAmount * PRECISION) / _totalShare;
  }

  /// @dev Internal function to calculate the real `activeYieldTokenAmount` for corresponding yield strategy.
  ///
  /// @param _strategyIndex The index of yield strategy to calculate.
  function _calculateActiveYieldTokenAmount(uint256 _strategyIndex) internal view returns (uint256) {
    uint256 _activeYieldTokenAmount = yieldStrategies[_strategyIndex].activeYieldTokenAmount;
    if (_activeYieldTokenAmount == 0) return 0;

    uint256 _rate = IYieldStrategy(yieldStrategies[_strategyIndex].strategy).underlyingPrice();

    uint256 _currentUnderlyingTokenAmount = _activeYieldTokenAmount.mul(_rate) / PRECISION;
    uint256 _expectedUnderlyingTokenAmount = yieldStrategies[_strategyIndex].expectedUnderlyingTokenAmount;
    if (_currentUnderlyingTokenAmount <= _expectedUnderlyingTokenAmount) return _activeYieldTokenAmount;

    uint256 _harvestable = (_currentUnderlyingTokenAmount - _expectedUnderlyingTokenAmount).mul(PRECISION) / _rate;

    return _activeYieldTokenAmount.sub(_harvestable);
  }

  /// @dev Gets the total value of the deposit collateral measured in debt tokens of the account owned by `owner`.
  ///
  /// @param _account The address of the account.
  ///
  /// @return The total value.
  function _getTotalValue(address _account) internal view returns (uint256) {
    UserInfo storage _userInfo = userInfo[_account];

    uint256 totalValue = 0;

    uint256 _yieldStrategyIndex = yieldStrategyIndex;
    uint256 _depositMask = _userInfo.depositMask;
    for (uint256 i = 0; i < _yieldStrategyIndex; i++) {
      if (_depositMask & 1 == 1) {
        uint256 _share = _userInfo.share[i];
        uint256 _underlyingTokenPerShare = _getUnderlyingTokenPerShare(i);
        uint256 _underlyingTokenAmount = _share.mul(_underlyingTokenPerShare) / PRECISION;
        uint256 _scale = 10**(18 - IERC20Metadata(yieldStrategies[i].underlyingToken).decimals());
        totalValue = totalValue.add(_underlyingTokenAmount.mul(_scale));
      }
      _depositMask >>= 1;
    }

    return totalValue;
  }

  /// @dev Internal function to check the health of account.
  ///      And account is health if and only if
  ///                                         borrowed
  ///                      sum deposited >= ------------
  ///                                       reserve_rate
  function _checkAccountHealth(address _account) internal view {
    uint256 _totalValue = _getTotalValue(_account);
    int256 _totalDebt = userInfo[_account].totalDebt;
    if (_totalDebt > 0) {
      require(
        _totalValue.mul(reserveRate) >= uint256(_totalDebt).mul(FEE_PRECISION),
        "CLever: account undercollateralized"
      );
    }
  }
}
