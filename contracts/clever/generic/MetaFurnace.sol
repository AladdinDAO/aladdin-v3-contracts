// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/SafeCastUpgradeable.sol";

import "../../interfaces/IERC20Metadata.sol";
import "../interfaces/ICLeverToken.sol";
import "../interfaces/IMetaFurnace.sol";
import "../interfaces/IYieldStrategy.sol";

import "../CLeverConfiguration.sol";

// solhint-disable reason-string

contract MetaFurnace is OwnableUpgradeable, IMetaFurnace {
  using SafeMathUpgradeable for uint256;
  using SafeERC20Upgradeable for IERC20Upgradeable;

  event UpdateWhitelist(address indexed _whitelist, bool _status);
  event UpdateFeeInfo(
    address indexed _platform,
    uint32 _platformPercentage,
    uint32 _bountyPercentage,
    uint32 _withdrawPercentage
  );
  event UpdateYieldInfo(uint16 _percentage, uint80 _threshold);
  event MigrateYieldStrategy(address _oldStrategy, address _newStrategy);
  event UpdateCLeverConfiguration(address _config);

  uint256 private constant E128 = 2**128;
  uint256 private constant PRECISION = 1e9;
  uint256 private constant MAX_PLATFORM_FEE = 2e8; // 20%
  uint256 private constant MAX_HARVEST_BOUNTY = 1e8; // 10%
  uint256 private constant MAX_WITHDRAW_FEE = 1e8; // 10%

  /// @notice If the unrealised is not paid off,
  /// the realised token in n sequential distribute is
  ///    user_unrealised * (reward_1 / total_unrealised_1)
  ///  + user_unrealised * (reward_1 / total_unrealised_1) * (reward_2 / total_unrealised_2)
  ///  + ...
  /// the unrealised token in n sequential distribute is
  ///    user_unrealised * (total_unrealised_1 - reward_1) / total_unrealised_1 * (total_unrealised_2 - reward_2) / total_unrealised_2 * ...
  ///
  /// So we can maintain a variable `accUnrealisedFraction` which is a product of `(total_unrealised - reward) / total_unrealised`.
  /// And keep track of this variable on each deposit/withdraw/claim, the unrealised debtToken of the user should be
  ///                                accUnrealisedFractionPaid
  ///                   unrealised * -------------------------
  ///                                  accUnrealisedFraction
  /// Also, the debt will paid off in some case, we record a global variable `lastPaidOffDistributeIndex` and an user
  /// specific variable `lastDistributeIndex` to check if the debt is paid off during `(lastDistributeIndex, distributeIndex]`.
  ///
  /// And to save the gas usage, an `uint128` is used to store `accUnrealisedFraction` and `accUnrealisedFractionPaid`.
  /// More specifically, it is in range [0, 2^128), means the real number `fraction / 2^128`. If the value is 0, it
  /// means the value of the faction is 1.
  ///
  /// @dev Compiler will pack this into two `uint256`.
  struct UserInfo {
    // The total amount of debtToken unrealised.
    uint128 unrealised;
    // The total amount of debtToken realised.
    uint128 realised;
    // The checkpoint for global `accUnrealisedFraction`, multipled by 1e9.
    uint192 accUnrealisedFractionPaid;
    // The distribute index record when use interacted the contract.
    uint64 lastDistributeIndex;
  }

  /// @dev Compiler will pack this into two `uint256`.
  struct FurnaceInfo {
    // The total amount of debtToken unrealised.
    uint128 totalUnrealised;
    // The total amount of debtToken realised.
    uint128 totalRealised;
    // The accumulated unrealised fraction, multipled by 2^128.
    uint128 accUnrealisedFraction;
    // The distriubed index, will be increased each time the function `distribute` is called.
    uint64 distributeIndex;
    // The distriubed index when all debtToken is paied off.
    uint64 lastPaidOffDistributeIndex;
  }

  /// @dev Compiler will pack this into single `uint256`.
  struct FeeInfo {
    // The address of recipient of platform fee
    address platform;
    // The percentage of rewards to take for platform on harvest, multipled by 1e9.
    uint32 platformPercentage;
    // The percentage of rewards to take for caller on harvest, multipled by 1e9.
    uint32 bountyPercentage;
    // The percentage of withdraw fee to take when withdraw debt token, multipled by 1e9.
    uint32 withdrawPercentage;
  }

  /// @dev Compiler will pack this into single `uint256`.
  struct YieldInfo {
    // The address of yield strategy.
    address strategy;
    // The percentage of token to deposit to yield strategy, multipled by 1e5.
    uint16 percentage;
    // The minimum amount to deposit to yield strategy, `uint80` should be enough for most token.
    uint80 threshold;
  }

  /// @inheritdoc IMetaFurnace
  address public override baseToken;

  /// @inheritdoc IMetaFurnace
  address public override debtToken;

  /// @notice The global furnace information.
  FurnaceInfo public furnaceInfo;

  /// @notice Mapping from user address to user info.
  mapping(address => UserInfo) public userInfo;

  /// @notice Mapping from user address to whether it is whitelisted.
  mapping(address => bool) public isWhitelisted;

  /// @notice The fee information, including platform and harvest bounty.
  FeeInfo public feeInfo;

  /// @notice The yield information for free base token in this contract.
  YieldInfo public yieldInfo;

  /// @notice The address of configuration contract.
  CLeverConfiguration public config;

  modifier onlyWhitelisted() {
    require(isWhitelisted[msg.sender], "Furnace: only whitelisted");
    _;
  }

  function initialize(address _baseToken, address _debtToken) external initializer {
    OwnableUpgradeable.__Ownable_init();

    require(_baseToken != address(0), "Furnace: zero address");
    require(_debtToken != address(0), "Furnace: zero address");
    require(IERC20Metadata(_debtToken).decimals() == 18, "Furnace: decimal mismatch");
    require(IERC20Metadata(_baseToken).decimals() <= 18, "Furnace: decimal too large");

    baseToken = _baseToken;
    debtToken = _debtToken;
  }

  /********************************** View Functions **********************************/

  /// @inheritdoc IMetaFurnace
  function getUserInfo(address _account) external view override returns (uint256 unrealised, uint256 realised) {
    UserInfo memory _userInfo = userInfo[_account];
    FurnaceInfo memory _furnaceInfo = furnaceInfo;
    if (_userInfo.lastDistributeIndex < _furnaceInfo.lastPaidOffDistributeIndex) {
      // In this case, all unrealised is paid off since last operate.
      return (0, _userInfo.unrealised + _userInfo.realised);
    } else {
      // extra plus 1, make sure we round up in division
      uint128 _newUnrealised = SafeCastUpgradeable.toUint128(
        _muldiv128(
          _userInfo.unrealised,
          _furnaceInfo.accUnrealisedFraction,
          uint128(_userInfo.accUnrealisedFractionPaid)
        )
      ) + 1;
      if (_newUnrealised >= _userInfo.unrealised) {
        _newUnrealised = _userInfo.unrealised;
      }
      uint128 _newRealised = _userInfo.unrealised - _newUnrealised + _userInfo.realised; // never overflow here
      return (_newUnrealised, _newRealised);
    }
  }

  /// @notice Return the total amount of free baseToken in this contract, including staked in YieldStrategy.
  function totalBaseTokenInPool() public view returns (uint256) {
    YieldInfo memory _info = yieldInfo;
    uint256 _balanceInContract = IERC20Upgradeable(baseToken).balanceOf(address(this));
    if (_info.strategy == address(0)) {
      return _balanceInContract;
    } else {
      return _balanceInContract.add(IYieldStrategy(_info.strategy).totalUnderlyingToken());
    }
  }

  /********************************** Mutated Functions **********************************/

  /// @inheritdoc IMetaFurnace
  function deposit(address _account, uint256 _amount) external override {
    require(_amount > 0, "Furnace: deposit zero amount");

    // transfer token into contract
    IERC20Upgradeable(debtToken).safeTransferFrom(msg.sender, address(this), _amount);

    _deposit(_account, _amount);
  }

  /// @inheritdoc IMetaFurnace
  function withdraw(address _recipient, uint256 _amount) external override {
    require(_amount > 0, "Furnace: withdraw zero amount");

    _updateUserInfo(msg.sender);
    _withdraw(_recipient, _amount);
  }

  /// @inheritdoc IMetaFurnace
  function withdrawAll(address _recipient) external override {
    _updateUserInfo(msg.sender);

    _withdraw(_recipient, userInfo[msg.sender].unrealised);
  }

  /// @inheritdoc IMetaFurnace
  function claim(address _recipient) external override {
    _updateUserInfo(msg.sender);

    _claim(_recipient);
  }

  /// @inheritdoc IMetaFurnace
  function exit(address _recipient) external override {
    _updateUserInfo(msg.sender);

    _withdraw(_recipient, userInfo[msg.sender].unrealised);
    _claim(_recipient);
  }

  /// @inheritdoc IMetaFurnace
  function distribute(
    address _origin,
    address _token,
    uint256 _amount
  ) external override onlyWhitelisted {
    require(_token == baseToken, "Furnace: invalid distributed token");

    _distribute(_origin, _amount);
  }

  /// @notice Harvest the pending reward and convert to cvxCRV.
  /// @param _recipient - The address of account to receive harvest bounty.
  /// @param _minimumOut - The minimum amount of cvxCRV should get.
  /// @return the amount of baseToken harvested.
  function harvest(address _recipient, uint256 _minimumOut) external returns (uint256) {
    address _strategy = yieldInfo.strategy;
    if (_strategy == address(0)) return 0;

    // 1. harvest from yield strategy
    (uint256 _amount, , ) = IYieldStrategy(_strategy).harvest();
    require(_amount >= _minimumOut, "Furnace: insufficient harvested amount");

    emit Harvest(msg.sender, _amount);

    if (_amount > 0) {
      uint256 _distributeAmount = _amount;
      FeeInfo memory _feeInfo = feeInfo;
      // 2. take platform fee
      if (_feeInfo.platformPercentage > 0) {
        uint256 _platformFee = (_feeInfo.platformPercentage * _distributeAmount) / PRECISION;
        IERC20Upgradeable(baseToken).safeTransfer(_feeInfo.platform, _platformFee);
        _distributeAmount = _distributeAmount - _platformFee; // never overflow here
      }
      // 3. take harvest bounty
      if (_feeInfo.bountyPercentage > 0) {
        uint256 _harvestBounty = (_feeInfo.bountyPercentage * _distributeAmount) / PRECISION;
        IERC20Upgradeable(baseToken).safeTransfer(_recipient, _harvestBounty);
        _distributeAmount = _distributeAmount - _harvestBounty; // never overflow here
      }
      // 3. distribute harvest baseToken to pay debtToken
      _distribute(address(this), _distributeAmount);
    }
    return _amount;
  }

  /********************************** Restricted Functions **********************************/

  /// @notice Update the status of a list of whitelisted accounts.
  /// @param _whitelists The address list of whitelisted accounts.
  /// @param _status The status to update.
  function updateWhitelists(address[] memory _whitelists, bool _status) external onlyOwner {
    for (uint256 i = 0; i < _whitelists.length; i++) {
      // solhint-disable-next-line reason-string
      require(_whitelists[i] != address(0), "Furnace: zero whitelist address");
      isWhitelisted[_whitelists[i]] = _status;

      emit UpdateWhitelist(_whitelists[i], _status);
    }
  }

  /// @notice Update yield info for baseToken in this contract.
  /// @param _percentage The stake percentage to be updated, multipled by 1e5.
  /// @param _threshold The stake threshold to be updated.
  function updateYieldInfo(uint16 _percentage, uint80 _threshold) external onlyOwner {
    require(_percentage <= 1e5, "Furnace: percentage too large");

    yieldInfo.percentage = _percentage;
    yieldInfo.threshold = _threshold;

    emit UpdateYieldInfo(_percentage, _threshold);
  }

  /// @notice Migrate baseToken in old yield strategy contract to the given one.
  /// @dev If the given strategy is zero address, we will just withdraw all token from the current one.
  /// @param _strategy The address of new yield strategy.
  function migrateStrategy(address _strategy) external onlyOwner {
    YieldInfo memory _yieldInfo = yieldInfo;

    if (_yieldInfo.strategy != address(0)) {
      if (_strategy == address(0)) {
        IYieldStrategy(_yieldInfo.strategy).withdraw(
          address(this),
          IYieldStrategy(_yieldInfo.strategy).totalYieldToken(),
          true
        );
      } else {
        // migrate and notify
        uint256 _totalMigrate = IYieldStrategy(_yieldInfo.strategy).migrate(_strategy);
        IYieldStrategy(_strategy).onMigrateFinished(_totalMigrate);
      }
    }

    yieldInfo.strategy = _strategy;

    emit MigrateYieldStrategy(_yieldInfo.strategy, _strategy);
  }

  /// @notice Update the fee information.
  /// @param _platform The platform address to be updated.
  /// @param _platformPercentage The platform fee percentage to be updated, multipled by 1e9.
  /// @param _bountyPercentage The harvest bounty percentage to be updated, multipled by 1e9.
  function updatePlatformInfo(
    address _platform,
    uint32 _platformPercentage,
    uint32 _bountyPercentage,
    uint32 _withdrawPercentage
  ) external onlyOwner {
    require(_platform != address(0), "Furnace: zero address");
    require(_platformPercentage <= MAX_PLATFORM_FEE, "Furnace: fee too large");
    require(_bountyPercentage <= MAX_HARVEST_BOUNTY, "Furnace: fee too large");
    require(_withdrawPercentage <= MAX_WITHDRAW_FEE, "Furnace: fee too large");

    feeInfo = FeeInfo(_platform, _platformPercentage, _bountyPercentage, _withdrawPercentage);

    emit UpdateFeeInfo(_platform, _platformPercentage, _bountyPercentage, _withdrawPercentage);
  }

  /// @dev Update the clever configuration contract.
  /// @param _config The address to update.
  function updateCLeverConfiguration(address _config) external onlyOwner {
    config = CLeverConfiguration(_config);

    emit UpdateCLeverConfiguration(_config);
  }

  /********************************** Internal Functions **********************************/

  /// @dev Internal function called when user interacts with the contract.
  /// @param _account The address of user to update.
  function _updateUserInfo(address _account) internal {
    UserInfo memory _userInfo = userInfo[_account];
    uint128 _accUnrealisedFraction = furnaceInfo.accUnrealisedFraction;
    uint64 _distributeIndex = furnaceInfo.distributeIndex;
    if (_userInfo.lastDistributeIndex < furnaceInfo.lastPaidOffDistributeIndex) {
      // In this case, all unrealised is paid off since last operate.
      userInfo[_account] = UserInfo({
        unrealised: 0,
        realised: _userInfo.unrealised + _userInfo.realised, // never overflow here
        accUnrealisedFractionPaid: 0,
        lastDistributeIndex: _distributeIndex
      });
    } else {
      // extra plus 1, make sure we round up in division
      uint128 _newUnrealised = SafeCastUpgradeable.toUint128(
        _muldiv128(_userInfo.unrealised, _accUnrealisedFraction, uint128(_userInfo.accUnrealisedFractionPaid))
      ) + 1;
      if (_newUnrealised >= _userInfo.unrealised) {
        _newUnrealised = _userInfo.unrealised;
      }
      uint128 _newRealised = _userInfo.unrealised - _newUnrealised + _userInfo.realised; // never overflow here
      userInfo[_account] = UserInfo({
        unrealised: _newUnrealised,
        realised: _newRealised,
        accUnrealisedFractionPaid: _accUnrealisedFraction,
        lastDistributeIndex: _distributeIndex
      });
    }
  }

  /// @dev Internal function called by `deposit` and `depositFor`.
  ///      assume that debtToken is already transfered into this contract.
  /// @param _account The address of the user.
  /// @param _amount The amount of debtToken to deposit.
  function _deposit(address _account, uint256 _amount) internal {
    // 1. update user info
    _updateUserInfo(_account);

    // 2. compute realised and unrelised
    uint256 _scale = 10**(18 - IERC20Metadata(baseToken).decimals());
    uint256 _totalUnrealised = furnaceInfo.totalUnrealised;
    uint256 _totalRealised = furnaceInfo.totalRealised;
    uint256 _freeBaseToken = (totalBaseTokenInPool() * _scale).sub(_totalRealised);

    uint256 _newUnrealised;
    uint256 _newRealised;
    if (_freeBaseToken >= _amount) {
      // pay all the debt with baseToken in contract directly.
      _newUnrealised = 0;
      _newRealised = _amount;
    } else {
      // pay part of the debt with baseToken in contract directly
      // and part of the debt with future baseToken distributed to the contract.
      _newUnrealised = _amount - _freeBaseToken;
      _newRealised = _freeBaseToken;
    }

    // 3. update user and global state
    userInfo[_account].realised = SafeCastUpgradeable.toUint128(_newRealised.add(userInfo[_account].realised));
    userInfo[_account].unrealised = SafeCastUpgradeable.toUint128(_newUnrealised.add(userInfo[_account].unrealised));

    furnaceInfo.totalRealised = SafeCastUpgradeable.toUint128(_totalRealised.add(_newRealised));
    furnaceInfo.totalUnrealised = SafeCastUpgradeable.toUint128(_totalUnrealised.add(_newUnrealised));

    emit Deposit(_account, _amount);
  }

  /// @dev Internal function called by `withdraw` and `withdrawAll`.
  /// @param _recipient The address of user who will recieve the debtToken.
  /// @param _amount The amount of debtToken to withdraw.
  function _withdraw(address _recipient, uint256 _amount) internal {
    require(_amount <= userInfo[msg.sender].unrealised, "Furnace: debtToken not enough");

    userInfo[msg.sender].unrealised = uint128(uint256(userInfo[msg.sender].unrealised) - _amount); // never overflow here
    furnaceInfo.totalUnrealised = uint128(uint256(furnaceInfo.totalUnrealised) - _amount); // never overflow here

    FeeInfo memory _info = feeInfo;
    uint256 _fee = (_amount * _info.withdrawPercentage) / PRECISION;
    IERC20Upgradeable(debtToken).safeTransfer(_recipient, _amount - _fee);
    IERC20Upgradeable(debtToken).safeTransfer(_info.platform, _fee);

    emit Withdraw(msg.sender, _recipient, _amount);
  }

  /// @dev Internal function called by `claim`.
  /// @param _recipient The address of user who will recieve the baseToken.
  function _claim(address _recipient) internal {
    uint256 _debtAmount = userInfo[msg.sender].realised;
    // should not overflow, but just in case, we use safe math.
    furnaceInfo.totalRealised = uint128(uint256(furnaceInfo.totalRealised).sub(_debtAmount));
    userInfo[msg.sender].realised = 0;

    // scale to base token
    address _baseToken = baseToken;
    uint256 _scale = 10**(18 - IERC20Metadata(_baseToken).decimals());
    uint256 _baseAmount = ((_debtAmount / _scale) * PRECISION) / config.burnRatio(_baseToken);

    uint256 _balanceInContract = IERC20Upgradeable(_baseToken).balanceOf(address(this));
    if (_balanceInContract < _baseAmount) {
      address _strategy = yieldInfo.strategy;
      // balance is not enough, with from yield strategy
      uint256 _yieldAmountToWithdraw = ((_baseAmount - _balanceInContract) * 1e18) /
        IYieldStrategy(_strategy).underlyingPrice();
      uint256 _diff = IYieldStrategy(_strategy).withdraw(address(this), _yieldAmountToWithdraw, true);
      _baseAmount = _balanceInContract + _diff;
    }
    IERC20Upgradeable(_baseToken).safeTransfer(_recipient, _baseAmount);

    // burn realised debtToken
    ICLeverToken(debtToken).burn(_debtAmount);

    emit Claim(msg.sender, _recipient, _debtAmount);
  }

  /// @dev Internal function called by `distribute` and `harvest`.
  /// @param _origin The address of the user who will provide baseToken.
  /// @param _amount The amount of baseToken will be provided.
  function _distribute(address _origin, uint256 _amount) internal {
    FurnaceInfo memory _furnaceInfo = furnaceInfo;

    // scale to debt token
    uint256 _scale = 10**(18 - IERC20Metadata(baseToken).decimals());
    uint256 _debtAmount = ((_amount * _scale) * config.burnRatio(baseToken)) / PRECISION;

    _furnaceInfo.distributeIndex += 1;
    // 1. distribute baseToken rewards
    if (_debtAmount >= _furnaceInfo.totalUnrealised) {
      // In this case, all unrealised debtToken are paid off.
      _furnaceInfo.totalRealised = SafeCastUpgradeable.toUint128(
        _furnaceInfo.totalUnrealised + _furnaceInfo.totalRealised
      );
      _furnaceInfo.totalUnrealised = 0;

      _furnaceInfo.accUnrealisedFraction = 0;
      _furnaceInfo.lastPaidOffDistributeIndex = _furnaceInfo.distributeIndex;
    } else {
      uint128 _fraction = SafeCastUpgradeable.toUint128(
        ((_furnaceInfo.totalUnrealised - _debtAmount) * E128) / _furnaceInfo.totalUnrealised
      ); // mul never overflow

      _furnaceInfo.totalUnrealised = uint128(_furnaceInfo.totalUnrealised - _debtAmount);
      _furnaceInfo.totalRealised = SafeCastUpgradeable.toUint128(_furnaceInfo.totalRealised + _debtAmount);
      _furnaceInfo.accUnrealisedFraction = _mul128(_furnaceInfo.accUnrealisedFraction, _fraction);
    }

    furnaceInfo = _furnaceInfo;

    // 2. stake extra baseToken to yield strategy
    YieldInfo memory _yieldInfo = yieldInfo;
    if (_yieldInfo.strategy != address(0)) {
      uint256 _exepctToStake = totalBaseTokenInPool().mul(_yieldInfo.percentage) / 1e5;
      uint256 _balanceStaked = IYieldStrategy(_yieldInfo.strategy).totalUnderlyingToken();
      if (_balanceStaked < _exepctToStake) {
        _exepctToStake = _exepctToStake - _balanceStaked;
        if (_exepctToStake >= _yieldInfo.threshold) {
          IERC20Upgradeable(baseToken).safeTransfer(_yieldInfo.strategy, _exepctToStake);
          IYieldStrategy(_yieldInfo.strategy).deposit(address(this), _exepctToStake, true);
        }
      }
    }

    emit Distribute(_origin, _amount);
  }

  /// @dev Compute the value of (_a / 2^128) * (_b / 2^128) with precision 2^128.
  function _mul128(uint128 _a, uint128 _b) internal pure returns (uint128) {
    if (_a == 0) return _b;
    if (_b == 0) return _a;
    return uint128((uint256(_a) * uint256(_b)) / E128);
  }

  /// @dev Compute the value of _a * (_b / 2^128) / (_c / 2^128).
  function _muldiv128(
    uint256 _a,
    uint128 _b,
    uint128 _c
  ) internal pure returns (uint256) {
    if (_b == 0) {
      if (_c == 0) return _a;
      else return _a / _c;
    } else {
      if (_c == 0) return _a.mul(_b) / E128;
      else return _a.mul(_b) / _c;
    }
  }
}
