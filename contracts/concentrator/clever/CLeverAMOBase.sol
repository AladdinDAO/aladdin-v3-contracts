// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;
pragma abicoder v2;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/SafeERC20Upgradeable.sol";

import "../../interfaces/concentrator/ICLeverAMO.sol";

import "../ConcentratorBase.sol";
import "./RewardClaimable.sol";

// solhint-disable contract-name-camelcase
// solhint-disable not-rely-on-time
// solhint-disable reason-string

abstract contract CLeverAMOBase is OwnableUpgradeable, RewardClaimable, ConcentratorBase, ERC20Upgradeable, ICLeverAMO {
  using SafeERC20Upgradeable for IERC20Upgradeable;

  /// @notice Emitted when harvest bounty percentage is updated.
  /// @param _bountyPercentage The new harvest bounty percentage updated.
  event UpdateBountyPercentage(uint32 _bountyPercentage);

  /// @notice Emitted when platform fee percentage is updated.
  /// @param _platform The address of platform fee recipient.
  /// @param _platformPercentage The new platform fee percentage updated.
  event UpdatePlatformPercentage(address _platform, uint32 _platformPercentage);

  /// @notice Emitted when owner update AMO configuration.
  /// @param _minAMO The minimum ratio of debt/base in curve pool updated.
  /// @param _maxAMO The maximum ratio of debt/base in curve pool updated.
  /// @param _minLPRatio The minimum ratio of lp/debt in contract updated.
  /// @param _maxLPRatio The maximum ratio of lp/debt in contract updated.
  event UpdateAMOConfig(uint64 _minAMO, uint64 _maxAMO, uint64 _minLPRatio, uint64 _maxLPRatio);

  /// @notice Emitted when owner update lock period.
  /// @param _lockPeriod The lock period updated.
  event UpdateLockPeriod(uint256 _lockPeriod);

  /// @notice Emitted when owner update minimum deposit amount.
  /// @param _minimumDeposit The minimum deposit amount updated.
  event UpdateMinimumDeposit(uint256 _minimumDeposit);

  /// @dev The precision used to compute various ratio.
  uint256 internal constant RATIO_PRECISION = 1e10;

  /// @dev The precision used to compute various fees.
  uint256 private constant FEE_PRECISION = 1e9;

  /// @dev The maximum value of harvest bounty percentage.
  uint256 private constant MAX_HARVEST_BOUNTY = 1e8; // 10%

  /// @dev The maximum value of platform fee percentage.
  uint256 private constant MAX_PLATFORM_FEE = 2e8; // 20%

  /// @dev The number of seconds in 1 day.
  uint256 private constant DAY = 1 days;

  /// @inheritdoc ICLeverAMO
  address public immutable override baseToken;

  /// @inheritdoc ICLeverAMO
  address public immutable override debtToken;

  /// @inheritdoc ICLeverAMO
  address public immutable override curvePool;

  /// @inheritdoc ICLeverAMO
  address public immutable override curveLpToken;

  /// @inheritdoc ICLeverAMO
  address public immutable override furnace;

  /// @dev Compiler will pack this into single `uint256`.
  struct AMOConfig {
    // The minimum ratio of debt/base in curve pool.
    uint64 minAMO;
    // The maximum ratio of debt/base in curve pool.
    uint64 maxAMO;
    // The minimum ratio of lp/debt in contract.
    uint64 minLPRatio;
    // The maximum ratio of lp/debt in contract.
    uint64 maxLPRatio;
  }

  /// @dev Compiler will pack this into single `uint256`.
  struct LockBalance {
    // The amount of base token locked.
    uint128 balance;
    // The timestamp when the base token is unlocked.
    uint64 unlockAt;
    // Reserved field for future use.
    // solhint-disable-next-line var-name-mixedcase
    uint64 _;
  }

  /// @notice The initial ratio of lp/debt in contract, with precision 1e18.
  uint256 public initialRatio;

  /// @notice The config for AMO.
  AMOConfig public config;

  /// @notice The length of lock period in seconds.
  uint256 public lockPeriod;

  /// @notice The harvest bounty percentage, with precision 1e9.
  uint256 public bountyPercentage;

  /// @notice The amount of pending base token to convert.
  /// @dev This may come from donation.
  uint256 public pendingBaseToken;

  /// @notice The minimum amount of base token to deposit.
  uint256 public minimumDeposit;

  /// @dev Mapping from user address to a list of locked base tokens.
  mapping(address => LockBalance[]) private locks;

  /// @dev Mapping from user address to next lock index to process.
  mapping(address => uint256) private nextIndex;

  /// @notice The address of platform fee recipient.
  address public platform;

  /// @notice The platform fee percentage, with precision 1e9.
  uint256 public platformPercentage;

  /// @dev reserved slots.
  uint256[18] private __gap;

  modifier NonZeroAmount(uint256 _amount) {
    require(_amount > 0, "CLeverAMO: amount is zero");
    _;
  }

  /********************************** Constructor **********************************/

  constructor(
    address _baseToken,
    address _debtToken,
    address _curvePool,
    address _curveLpToken,
    address _furnace
  ) {
    baseToken = _baseToken;
    debtToken = _debtToken;
    curvePool = _curvePool;
    curveLpToken = _curveLpToken;
    furnace = _furnace;
  }

  function _initialize(
    string memory _name,
    string memory _symbol,
    uint256 _initialRatio
  ) internal {
    OwnableUpgradeable.__Ownable_init();
    ERC20Upgradeable.__ERC20_init(_name, _symbol);

    initialRatio = _initialRatio;
    /*
    // remove this to reduce bytecode size
    config = AMOConfig({
      minAMO: uint64(RATIO_PRECISION),
      maxAMO: uint64(RATIO_PRECISION * 3),
      minLPRatio: uint64(RATIO_PRECISION / 2),
      maxLPRatio: uint64(RATIO_PRECISION)
    });
    */

    lockPeriod = 1 days; // default lock 1 day
    minimumDeposit = 10**18; // default 1 base token.
  }

  /********************************** View Functions **********************************/

  /// @inheritdoc ICLeverAMO
  function totalDebtToken() external view override returns (uint256) {
    return _debtBalanceInContract();
  }

  /// @inheritdoc ICLeverAMO
  function totalCurveLpToken() external view override returns (uint256) {
    return _lpBalanceInContract();
  }

  /// @inheritdoc ICLeverAMO
  function ratio() public view override returns (uint256) {
    uint256 _debtBalance = _debtBalanceInContract();
    uint256 _lpBalance = _lpBalanceInContract();

    if (_debtBalance == 0) return initialRatio;
    else return (_lpBalance * RATIO_PRECISION) / _debtBalance;
  }

  /// @notice Query the list of locked balance of the user.
  /// @param _user The address of user to query.
  /// @return _locks The list of locked balance.
  function getUserLocks(address _user) external view returns (LockBalance[] memory _locks) {
    uint256 _length = locks[_user].length;
    uint256 _startIndex = nextIndex[_user];

    _locks = new LockBalance[](_length - _startIndex);
    for (uint256 i = _startIndex; i < _length; i++) {
      _locks[i - _startIndex] = locks[_user][i];
    }
  }

  /********************************** Mutated Functions **********************************/

  /// @inheritdoc ICLeverAMO
  function deposit(uint256 _amount, address _recipient) external override {
    if (_amount == uint256(-1)) {
      _amount = IERC20Upgradeable(baseToken).balanceOf(msg.sender);
    }

    require(_amount >= minimumDeposit, "CLeverAMO: deposit amount too small");

    IERC20Upgradeable(baseToken).safeTransferFrom(msg.sender, address(this), _amount);

    uint256 _unlockAt = ((block.timestamp + lockPeriod + DAY - 1) / DAY) * DAY;
    uint256 _length = locks[_recipient].length;
    if (_length == 0 || locks[_recipient][_length - 1].unlockAt != _unlockAt) {
      locks[_recipient].push(LockBalance(uint128(_amount), uint64(_unlockAt), 0));
    } else {
      locks[_recipient][_length - 1].balance += uint128(_amount);
    }

    emit Deposit(msg.sender, _recipient, _amount, _unlockAt);
  }

  /// @inheritdoc ICLeverAMO
  function unlock(uint256 _minShareOut) external override returns (uint256 _shares) {
    // unlock base token
    uint256 _length = locks[msg.sender].length;
    uint256 _nextIndex = nextIndex[msg.sender];
    uint256 _unlocked;
    for (uint256 i = _nextIndex; i < _length; i++) {
      LockBalance memory _b = locks[msg.sender][i];
      if (_b.unlockAt <= block.timestamp) {
        _unlocked += _b.balance;
        delete locks[msg.sender][i];
      }
    }
    require(_unlocked > 0, "CLeverAMO: no unlocks");
    // update next index
    while (_nextIndex < _length) {
      LockBalance memory _b = locks[msg.sender][_nextIndex];
      if (_b.balance == 0) _nextIndex += 1;
      else break;
    }
    nextIndex[msg.sender] = _nextIndex;

    // convert to debt token and lp token
    (uint256 _total, uint256 _debtOut, uint256 _lpOut) = _checkpoint(_unlocked);
    _debtOut = (_debtOut * _unlocked) / _total;
    _lpOut = (_lpOut * _unlocked) / _total;

    uint256 _totalSupply = totalSupply();
    if (_totalSupply == 0) {
      // choose max(_debtOut, _lpOut) as initial supply
      _shares = _debtOut > _lpOut ? _debtOut : _lpOut;
    } else {
      // This already contains the user converted amount, we need to subtract it when computing shares.
      uint256 _debtBalance = _debtBalanceInContract();
      uint256 _lpBalance = _lpBalanceInContract();

      _debtOut = (_debtOut * _totalSupply) / (_debtBalance - _debtOut);
      _lpOut = (_lpOut * _totalSupply) / (_lpBalance - _lpOut);

      // use min(debt share, lp share) as new minted sharey
      _shares = _debtOut < _lpOut ? _debtOut : _lpOut;
    }

    require(_shares >= _minShareOut, "CLeverAMO: insufficient shares");

    _mint(msg.sender, _shares);

    emit Unlock(msg.sender, _unlocked, _shares, ratio());
  }

  /// @inheritdoc ICLeverAMO
  function withdraw(
    uint256 _shares,
    address _recipient,
    uint256 _minLpOut,
    uint256 _minDebtOut
  ) external override NonZeroAmount(_shares) returns (uint256 _lpTokenOut, uint256 _debtTokenOut) {
    _checkpoint(0);
    _checkpointUser(msg.sender);

    if (_shares == uint256(-1)) {
      _shares = balanceOf(msg.sender);
    }

    uint256 _totalSupply = totalSupply();
    _burn(msg.sender, _shares);

    _lpTokenOut = (_lpBalanceInContract() * _shares) / _totalSupply;
    _debtTokenOut = (_debtBalanceInContract() * _shares) / _totalSupply;

    require(_lpTokenOut >= _minLpOut, "CLeverAMO: insufficient lp token output");
    require(_debtTokenOut >= _minDebtOut, "CLeverAMO: insufficient debt token output");

    _withdrawDebtToken(_debtTokenOut, _recipient);
    _withdrawLpToken(_lpTokenOut, _recipient);

    emit Withdraw(msg.sender, _recipient, _shares, _debtTokenOut, _lpTokenOut, ratio());
  }

  /// @inheritdoc ICLeverAMO
  function withdrawToBase(
    uint256 _shares,
    address _recipient,
    uint256 _minBaseOut
  ) external override NonZeroAmount(_shares) returns (uint256 _baseTokenOut) {
    _checkpoint(0);
    _checkpointUser(msg.sender);

    if (_shares == uint256(-1)) {
      _shares = balanceOf(msg.sender);
    }

    uint256 _totalSupply = totalSupply();
    _burn(msg.sender, _shares);

    uint256 _lpTokenOut = (_lpBalanceInContract() * _shares) / _totalSupply;
    uint256 _debtTokenOut = (_debtBalanceInContract() * _shares) / _totalSupply;

    _withdrawDebtToken(_debtTokenOut, address(this));
    _withdrawLpToken(_lpTokenOut, address(this));

    emit Withdraw(msg.sender, _recipient, _shares, _debtTokenOut, _lpTokenOut, ratio());

    _baseTokenOut = _convertToBaseToken(_debtTokenOut, _lpTokenOut);
    require(_baseTokenOut >= _minBaseOut, "CLeverAMO: insufficient base token output");

    IERC20Upgradeable(baseToken).safeTransfer(_recipient, _baseTokenOut);
  }

  /// @inheritdoc ICLeverAMO
  function harvest(address _recipient, uint256 _minBaseOut) external override returns (uint256 _baseTokenOut) {
    ensureCallerIsHarvester();

    // claim from furnace
    _baseTokenOut = _claimBaseFromFurnace();
    // harvest external rewards
    _baseTokenOut += _harvest();
    require(_baseTokenOut >= _minBaseOut, "CLeverAMO: insufficient harvested");

    uint256 _bounty = (_baseTokenOut * bountyPercentage) / FEE_PRECISION;

    uint256 _platformFee = (_baseTokenOut * platformPercentage) / FEE_PRECISION;

    (uint256 _debtAmount, uint256 _lpAmount, uint256 _ratio) = _convertFromBaseToken(
      _baseTokenOut - _bounty - _platformFee
    );
    _depositDebtToken(_debtAmount);
    _depositLpToken(_lpAmount);

    emit Harvest(_recipient, _baseTokenOut, _platformFee, _bounty, _debtAmount, _lpAmount, _ratio);

    if (_bounty > 0) {
      IERC20Upgradeable(baseToken).safeTransfer(_recipient, _bounty);
    }
    if (_platformFee > 0) {
      IERC20Upgradeable(baseToken).safeTransfer(platform, _platformFee);
    }
  }

  /// @inheritdoc ICLeverAMO
  function checkpoint() external override {
    _checkpoint(0);
  }

  /// @inheritdoc ICLeverAMO
  function donate(uint256 _amount) external override {
    IERC20Upgradeable(baseToken).safeTransferFrom(msg.sender, address(this), _amount);

    pendingBaseToken += _amount;
  }

  /********************************** Restricted Functions **********************************/

  /// @notice Update the harvest bounty percentage.
  /// @param _bountyPercentage The harvest bounty percentage to be updated, multipled by 1e9.
  function updateBountyPercentage(uint32 _bountyPercentage) external onlyOwner {
    require(_bountyPercentage <= MAX_HARVEST_BOUNTY, "CLeverAMO: fee too large");

    bountyPercentage = _bountyPercentage;

    emit UpdateBountyPercentage(_bountyPercentage);
  }

  /// @notice Update the platform fee percentage.
  /// @param _platform The address of platform fee recipient.
  /// @param _platformPercentage The platform fee percentage to be updated, multipled by 1e9.
  function updatePlatformPercentage(address _platform, uint32 _platformPercentage) external onlyOwner {
    require(_platformPercentage <= MAX_PLATFORM_FEE, "CLeverAMO: fee too large");

    platform = _platform;
    platformPercentage = _platformPercentage;

    emit UpdatePlatformPercentage(_platform, _platformPercentage);
  }

  /// @notice Update the AMO configuration.
  /// @param _minAMO The minimum ratio of debt/base in curve pool.
  /// @param _maxAMO The maximum ratio of debt/base in curve pool.
  /// @param _minLPRatio The minimum ratio of lp/debt in contract.
  /// @param _maxLPRatio The maximum ratio of lp/debt in contract.
  function updateAMOConfig(
    uint64 _minAMO,
    uint64 _maxAMO,
    uint64 _minLPRatio,
    uint64 _maxLPRatio
  ) external onlyOwner {
    require(_minAMO <= _maxAMO, "CLeverAMO: invalid amo ratio");
    require(_minLPRatio <= _maxLPRatio, "CLeverAMO: invalid lp ratio");

    config = AMOConfig(_minAMO, _maxAMO, _minLPRatio, _maxLPRatio);

    emit UpdateAMOConfig(_minAMO, _maxAMO, _minLPRatio, _maxLPRatio);
  }

  /// @notice Update the minimum deposit amount.
  /// @param _minimumDeposit The lock period in seconds to update.
  function updateMinimumDeposit(uint256 _minimumDeposit) external onlyOwner {
    require(_minimumDeposit >= 10**18, "CLeverAMO: invalid minimum deposit amount");
    minimumDeposit = _minimumDeposit;

    emit UpdateMinimumDeposit(_minimumDeposit);
  }

  /// @notice Update lock period for base token.
  /// @param _lockPeriod The lock period in seconds to update.
  function updateLockPeriod(uint256 _lockPeriod) external onlyOwner {
    require(_lockPeriod > 0 && _lockPeriod % DAY == 0, "CLeverAMO: invalid lock period");
    lockPeriod = _lockPeriod;

    emit UpdateLockPeriod(_lockPeriod);
  }

  /// @notice Update the harvester contract
  /// @param _harvester The address of the harvester contract.
  function updateHarvester(address _harvester) external onlyOwner {
    _updateHarvester(_harvester);
  }

  /********************************** Internal Functions **********************************/

  /// @dev Internal function to checkpoint AMO state before actions.
  /// @param _userSupply The delta amount of user supply.
  /// @return _baseAmount The total amount of base token used to convert.alias
  /// @return _debtTokenOut The total amount of debt token converted.
  /// @return _lpTokenOut The total amount of lp token converted.
  function _checkpoint(uint256 _userSupply)
    internal
    returns (
      uint256 _baseAmount,
      uint256 _debtTokenOut,
      uint256 _lpTokenOut
    )
  {
    _baseAmount = _claimBaseFromFurnace() + _userSupply;

    if (pendingBaseToken > 0) {
      _baseAmount += pendingBaseToken;
      pendingBaseToken = 0;
    }

    if (_baseAmount > 0) {
      uint256 _ratio;
      (_debtTokenOut, _lpTokenOut, _ratio) = _convertFromBaseToken(_baseAmount);

      _depositDebtToken(_debtTokenOut);
      _depositLpToken(_lpTokenOut);

      emit Checkpoint(_baseAmount, _debtTokenOut, _lpTokenOut, _ratio);
    }
  }

  /// @dev Internal function to return the current amount of debt token in contract.
  function _debtBalanceInContract() internal view virtual returns (uint256);

  /// @dev Internal function to return the current amount of lp token in contract.
  function _lpBalanceInContract() internal view virtual returns (uint256);

  /// @dev Internal function to convert base token to debt token and curve lp token.
  /// @param _amount The amount of base token to convert.
  /// @return _debtTokenOut The amount of debt token received.
  /// @return _lpTokenOut The amount of lp token received.
  /// @return _ratio The ratio between lp token and debt token after the convertion.
  function _convertFromBaseToken(uint256 _amount)
    internal
    virtual
    returns (
      uint256 _debtTokenOut,
      uint256 _lpTokenOut,
      uint256 _ratio
    );

  /// @dev Internal function to convert debt token and lp token to base token.
  /// @param _debtTokenAmount The amount of debt token to convert.
  /// @param _lpTokenAmount The amount of lp token to convert.
  /// @return _baseTokenOut The amount of base token received.
  function _convertToBaseToken(uint256 _debtTokenAmount, uint256 _lpTokenAmount)
    internal
    virtual
    returns (uint256 _baseTokenOut);

  /// @dev Internal function to deposit debt token into furnace.
  /// @param _amount The amount of debt token to deposit.
  function _depositDebtToken(uint256 _amount) internal virtual;

  /// @dev Internal function to withdraw debt token from furnace.
  /// @param _amount The amount of debt token to withdraw.
  /// @param _recipient The address recipient who will receive the debt token.
  function _withdrawDebtToken(uint256 _amount, address _recipient) internal virtual;

  /// @dev Internal function to claim converted base token from furnace.
  /// @return _baseTokenOut The amount of base token received.
  function _claimBaseFromFurnace() internal virtual returns (uint256 _baseTokenOut);

  /// @dev Internal function to deposit lp token to external protocol to earn rewards.
  /// @param _amount The amount of lp token to deposit.
  function _depositLpToken(uint256 _amount) internal virtual;

  /// @dev Internal function to withdraw lp token from external protocol.
  /// @param _amount The amount of lp token to withdraw.
  /// @param _recipient The address recipient who will receive the lp token.
  function _withdrawLpToken(uint256 _amount, address _recipient) internal virtual;

  /// @dev Internal function to harvest rewards from external protocol and convert to base token.
  /// @return _baseTokenOut The amount of base token harvested.
  function _harvest() internal virtual returns (uint256 _baseTokenOut);
}
