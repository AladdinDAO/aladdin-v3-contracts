// SPDX-License-Identifier: MIT

pragma solidity =0.8.20;

import { ERC20PermitUpgradeable } from "@openzeppelin/contracts-upgradeable-v4/token/ERC20/extensions/ERC20PermitUpgradeable.sol";
import { SafeERC20Upgradeable } from "@openzeppelin/contracts-upgradeable-v4/token/ERC20/utils/SafeERC20Upgradeable.sol";
import { ERC20Upgradeable } from "@openzeppelin/contracts-upgradeable-v4/token/ERC20/ERC20Upgradeable.sol";
import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable-v4/token/ERC20/IERC20Upgradeable.sol";

import { IGaugeController } from "../../interfaces/IGaugeController.sol";
import { IGovernanceToken } from "../../interfaces/IGovernanceToken.sol";
import { ILiquidityGauge } from "../../interfaces/ILiquidityGauge.sol";
import { ITokenMinter } from "../../interfaces/ITokenMinter.sol";
import { IVotingEscrow } from "../../interfaces/IVotingEscrow.sol";

import { MultipleRewardAccumulator } from "../../../common/rewards/accumulator/MultipleRewardAccumulator.sol";
import { LinearMultipleRewardDistributor } from "../../../common/rewards/distributor/LinearMultipleRewardDistributor.sol";

// solhint-disable func-name-mixedcase
// solhint-disable not-rely-on-time

/// @title LiquidityGauge
/// @dev This is inspired from Curve's LiquidityGaugeV6.
/// The code could be found in https://github.com/curvefi/tricrypto-ng/blob/main/contracts/main/LiquidityGauge.vy
contract LiquidityGauge is ERC20PermitUpgradeable, MultipleRewardAccumulator, ILiquidityGauge {
  using SafeERC20Upgradeable for IERC20Upgradeable;

  /*************
   * Constants *
   *************/

  /// @notice The address of governance token, also the base reward token.
  address public immutable governanceToken;

  /// @notice The address of VotingEscrow contract.
  address public immutable ve;

  /// @notice The address of governance token minter.
  address public immutable minter;

  /// @notice The address of gauge controller.
  address public immutable controller;

  /// @dev The number of seconds in one week.
  uint256 internal constant WEEK = 7 days;

  /// @dev The number used to calculate ve boost.
  uint256 internal constant TOKENLESS_PRODUCTION = 40;

  /***********
   * Structs *
   ***********/

  /// @dev Compiler will pack this into single `uint256`.
  struct InflationParams {
    // The current emission rate of governance token.
    uint192 rate;
    // The timestamp of future epoch.
    uint64 futureEpochTime;
  }

  /*************
   * Variables *
   *************/

  /// @inheritdoc ILiquidityGauge
  address public override stakingToken;

  /// @inheritdoc ILiquidityGauge
  uint256 public override workingSupply;

  /// @inheritdoc ILiquidityGauge
  mapping(address => uint256) public override workingBalanceOf;

  /// @notice The cached inflation parameters for governance token.
  InflationParams public inflationParams;

  /// @notice The reward snapshot for governance token.
  ///
  /// @dev The integral is defined as 1e18 * ∫(rate(t) / totalPoolShare(t) dt).
  RewardSnapshot public snapshot;

  /// @notice Mapping from user address to the user governance token reward snapshot.
  ///
  /// @dev The integral is the value of `snapshot.integral` when the snapshot is taken.
  mapping(address => UserRewardSnapshot) public userSnapshot;

  /// @dev reserved slots.
  uint256[44] private __gap;

  /***************
   * Constructor *
   ***************/

  constructor(address _minter) LinearMultipleRewardDistributor(uint40(WEEK)) {
    address _controller = ITokenMinter(_minter).controller();

    governanceToken = ITokenMinter(_minter).token();
    ve = IGaugeController(_controller).voting_escrow();
    minter = _minter;
    controller = _controller;
  }

  function initialize(address _stakingToken) external initializer {
    string memory _name = string(abi.encodePacked(ERC20PermitUpgradeable(_stakingToken).name(), " Gauge Deposit"));
    string memory _symbol = string(abi.encodePacked(ERC20PermitUpgradeable(_stakingToken).symbol(), "-gauge"));

    __ReentrancyGuard_init();
    __ERC20_init(_name, _symbol);
    __ERC20Permit_init(_name);

    __MultipleRewardAccumulator_init();

    _grantRole(DEFAULT_ADMIN_ROLE, _msgSender());

    stakingToken = _stakingToken;
  }

  /*************************
   * Public View Functions *
   *************************/

  /// @inheritdoc ILiquidityGauge
  function integrate_fraction(address account) external view override returns (uint256) {
    return userSnapshot[account].rewards.pending;
  }

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @inheritdoc ILiquidityGauge
  function deposit(uint256 _amount) external override {
    address _sender = _msgSender();
    _deposit(_sender, _amount, _sender);
  }

  /// @inheritdoc ILiquidityGauge
  function deposit(uint256 _amount, address _receiver) external override {
    _deposit(_msgSender(), _amount, _receiver);
  }

  /// @inheritdoc ILiquidityGauge
  function withdraw(uint256 _amount) external override {
    address _sender = _msgSender();
    _withdraw(_sender, _amount, _sender);
  }

  /// @inheritdoc ILiquidityGauge
  function withdraw(uint256 _amount, address _receiver) external override {
    _withdraw(_msgSender(), _amount, _receiver);
  }

  /// @inheritdoc ILiquidityGauge
  function user_checkpoint(address _account) external override nonReentrant {
    if (_account != minter && _account != _msgSender()) {
      revert UnauthorizedCaller();
    }

    _checkpoint(_account);
    _updateWorkingBalance(_account);
  }

  /// @inheritdoc ILiquidityGauge
  function kick(address _account) external override {
    uint256 _snapshotTs = userSnapshot[_account].checkpoint.timestamp;
    uint256 _veTs = IVotingEscrow(ve).user_point_history__ts(_account, IVotingEscrow(ve).user_point_epoch(_account));
    if (IVotingEscrow(ve).balanceOf(_account) > 0 && _veTs <= _snapshotTs) {
      revert KickNotAllowed();
    }
    uint256 _balance = balanceOf(_account);
    if (workingBalanceOf[_account] <= (_balance * TOKENLESS_PRODUCTION) / 100) {
      revert KickNotNeeded();
    }

    _checkpoint(_account);
    _updateWorkingBalance(_account);
  }

  /**********************
   * Internal Functions *
   **********************/

  /// @inheritdoc ERC20Upgradeable
  function _beforeTokenTransfer(
    address _from,
    address _to,
    uint256 _amount
  ) internal virtual override nonReentrant {
    // no need to checkpoint on mint or burn
    if (_from == address(0) || _to == address(0)) return;

    _checkpoint(_from);
    _checkpoint(_to);

    if (_amount > 0) {
      _updateWorkingBalance(_from);
      _updateWorkingBalance(_to);
    }
  }

  /// @inheritdoc MultipleRewardAccumulator
  function _checkpoint(address _account) internal virtual override {
    // checkpoint extra rewards
    MultipleRewardAccumulator._checkpoint(_account);

    RewardSnapshot memory _cachedSnapshot = snapshot;
    InflationParams memory _prevInflationParams = inflationParams;
    InflationParams memory _nextInflationParams = _prevInflationParams;

    // update inflation rate if changed
    if (_nextInflationParams.futureEpochTime >= _cachedSnapshot.timestamp) {
      _nextInflationParams.rate = uint192(IGovernanceToken(governanceToken).rate());
      _nextInflationParams.futureEpochTime = uint64(IGovernanceToken(governanceToken).future_epoch_time_write());
      inflationParams = _nextInflationParams;
    }

    // update integral for global snapshot
    if (block.timestamp > _cachedSnapshot.timestamp) {
      uint256 _workingSupply = workingSupply;
      IGaugeController(controller).checkpoint_gauge(address(this));
      uint256 _prevWeekTime = _cachedSnapshot.timestamp;
      uint256 _weekTime = ((_prevWeekTime + WEEK) / WEEK) * WEEK;
      if (_weekTime > block.timestamp) {
        _weekTime = block.timestamp;
      }

      uint256 _rate = _prevInflationParams.rate;
      // this iteration will cover about 9.58 years, it should be enough.
      for (uint256 i = 0; i < 500; i++) {
        uint256 dt = _weekTime - _prevWeekTime;
        uint256 w = IGaugeController(controller).gauge_relative_weight(address(this), (_prevWeekTime / WEEK) * WEEK);
        if (_workingSupply > 0) {
          if (
            _prevInflationParams.futureEpochTime >= _prevWeekTime && _prevInflationParams.futureEpochTime < _weekTime
          ) {
            // If we went across one or multiple epochs, apply the rate
            // of the first epoch until it ends, and then the rate of
            // the last epoch.
            // If more than one epoch is crossed - the gauge gets less,
            // but that'd meen it wasn't called for more than 1 year
            _cachedSnapshot.integral += uint192(
              (_rate * w * (_prevInflationParams.futureEpochTime - _prevWeekTime)) / _workingSupply
            );
            _rate = _nextInflationParams.rate;
            _cachedSnapshot.integral += uint192(
              (_rate * w * (_weekTime - _prevInflationParams.futureEpochTime)) / _workingSupply
            );
          } else {
            _cachedSnapshot.integral += uint192((_rate * w * dt) / _workingSupply);
          }
          // On precisions of the calculation
          // rate ~= 10e18
          // last_weight > 0.01 * 1e18 = 1e16 (if pool weight is 1%)
          // _working_supply ~= TVL * 1e18 ~= 1e26 ($100M for example)
          // The largest loss is at dt = 1
          // Loss is 1e-9 - acceptable
        }

        if (_weekTime == block.timestamp) {
          break;
        }
        _prevWeekTime = _weekTime;
        _weekTime += WEEK;
        if (_weekTime > block.timestamp) {
          _weekTime = block.timestamp;
        }
      }

      _cachedSnapshot.timestamp = uint64(block.timestamp);
      snapshot = _cachedSnapshot;
    }

    // update integral for user snapshot
    if (_account != address(0)) {
      uint256 _workingBalance = workingBalanceOf[_account];
      UserRewardSnapshot memory _cachedUserSnapshot = userSnapshot[_account];
      _cachedUserSnapshot.rewards.pending += uint128(
        (_workingBalance * uint256(_cachedSnapshot.integral - _cachedUserSnapshot.checkpoint.integral)) /
          REWARD_PRECISION
      );
      _cachedUserSnapshot.checkpoint.integral = _cachedSnapshot.integral;
      _cachedUserSnapshot.checkpoint.timestamp = uint64(block.timestamp);
    }
  }

  /// @inheritdoc MultipleRewardAccumulator
  function _getTotalPoolShare() internal view virtual override returns (uint256) {
    return totalSupply();
  }

  /// @inheritdoc MultipleRewardAccumulator
  function _getUserPoolShare(address _account) internal view virtual override returns (uint256) {
    return balanceOf(_account);
  }

  /// @dev Internal function to deposit staking token.
  /// @param _owner The address of staking token owner.
  /// @param _amount The amount of staking token to deposit.
  /// @param _receiver The address of pool share recipient.
  function _deposit(
    address _owner,
    uint256 _amount,
    address _receiver
  ) internal nonReentrant {
    // transfer token
    _transferStakingTokenIn(_owner, _amount);

    // checkpoint
    _checkpoint(_receiver);

    // mint pool share
    _mint(_receiver, _amount);

    // update working balances
    _updateWorkingBalance(_receiver);

    // emit event
    emit Deposit(_owner, _receiver, _amount);
  }

  /// @dev Internal function to withdraw staking token.
  /// @param _owner The address of pool share owner.
  /// @param _amount The amount of staking token to withdraw.
  /// @param _receiver The address of staking token recipient.
  function _withdraw(
    address _owner,
    uint256 _amount,
    address _receiver
  ) internal nonReentrant {
    // do checkpoint
    _checkpoint(_owner);

    // burn user share
    if (_amount == type(uint256).max) {
      _amount = balanceOf(_owner);
    }
    if (_amount == 0) revert WithdrawZeroAmount();
    _burn(_owner, _amount);

    // update working balances
    _updateWorkingBalance(_owner);

    // transfer token out
    _transferStakingTokenOut(_receiver, _amount);

    // emit event
    emit Withdraw(_owner, _receiver, _amount);
  }

  /// @dev Internal function to transfer staking token to this contract.
  /// @param _owner The address of the token owner.
  /// @param _amount The amount of token to transfer.
  function _transferStakingTokenIn(address _owner, uint256 _amount) internal virtual returns (uint256) {
    // transfer token to this contract
    address _stakingToken = stakingToken;
    if (_amount == type(uint256).max) {
      _amount = IERC20Upgradeable(_stakingToken).balanceOf(_owner);
    }
    if (_amount == 0) revert DepositZeroAmount();
    IERC20Upgradeable(_stakingToken).safeTransferFrom(_owner, address(this), _amount);

    return _amount;
  }

  /// @dev Internal function to transfer staking token to some user.
  /// @param _receiver The address of the token recipient.
  /// @param _amount The amount of token to transfer.
  function _transferStakingTokenOut(address _receiver, uint256 _amount) internal virtual {
    IERC20Upgradeable(stakingToken).safeTransfer(_receiver, _amount);
  }

  /// @dev Internal function to query the ve token balance of some user.
  /// @param _account The address of user to query.
  function _getUserVeBalance(address _account) internal view virtual returns (uint256) {
    return IVotingEscrow(ve).balanceOf(_account);
  }

  /// @dev Internal function to update working balances.
  /// @param _account The address of user to update.
  function _updateWorkingBalance(address _account) internal {
    uint256 _workingBalance = _computeWorkingBalance(_account);
    uint256 _oldWorkingBalance = workingBalanceOf[_account];
    uint256 _workingSupply = workingSupply + _workingBalance - _oldWorkingBalance;
    workingBalanceOf[_account] = _workingBalance;
    workingSupply = _workingSupply;

    emit UpdateLiquidityLimit(_account, balanceOf(_account), totalSupply(), _workingBalance, _workingSupply);
  }

  /// @dev Internal function to compute the expected working balance for some user.
  /// @param _account The address of user to query.
  function _computeWorkingBalance(address _account) internal view virtual returns (uint256) {
    uint256 _veBalance = _getUserVeBalance(_account);
    uint256 _veSupply = IVotingEscrow(ve).totalSupply();

    uint256 _balance = balanceOf(_account);
    uint256 _supply = totalSupply();

    uint256 _workingBalance = (_balance * TOKENLESS_PRODUCTION) / 100;
    if (_veSupply > 0) {
      _workingBalance += (((_supply * _veBalance) / _veSupply) * (100 - TOKENLESS_PRODUCTION)) / 100;
    }
    if (_workingBalance > _balance) {
      _workingBalance = _balance;
    }

    return _workingBalance;
  }
}
