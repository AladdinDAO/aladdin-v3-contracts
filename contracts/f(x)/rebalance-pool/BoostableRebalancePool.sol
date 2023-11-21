// SPDX-License-Identifier: MIT

pragma solidity =0.8.20;

import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable-v4/token/ERC20/IERC20Upgradeable.sol";
import { SafeERC20Upgradeable } from "@openzeppelin/contracts-upgradeable-v4/token/ERC20/utils/SafeERC20Upgradeable.sol";

import { DecrementalFloatingPoint } from "../../common/math/DecrementalFloatingPoint.sol";
import { IMultipleRewardAccumulator } from "../../common/rewards/accumulator/IMultipleRewardAccumulator.sol";
import { MultipleRewardCompoundingAccumulator } from "../../common/rewards/accumulator/MultipleRewardCompoundingAccumulator.sol";
import { LinearMultipleRewardDistributor } from "../../common/rewards/distributor/LinearMultipleRewardDistributor.sol";

import { IFxBoostableRebalancePool } from "../../interfaces/f(x)/IFxBoostableRebalancePool.sol";
import { IFxMarket } from "../../interfaces/f(x)/IFxMarket.sol";
import { IFxTokenWrapper } from "../../interfaces/f(x)/IFxTokenWrapper.sol";
import { IFxTreasury } from "../../interfaces/f(x)/IFxTreasury.sol";
import { IVotingEscrow } from "../../interfaces/voting-escrow/IVotingEscrow.sol";
import { IVotingEscrowProxy } from "../../interfaces/voting-escrow/IVotingEscrowProxy.sol";
import { ICurveTokenMinter } from "../../interfaces/ICurveTokenMinter.sol";

// solhint-disable not-rely-on-time

/// @title RebalancePoolWithBoost
/// @notice To add boost for FXN, we maintain a time-weighted boost ratio for each user.
///   boost[u][i] = min(balance[u][i], 0.4 * balance[u][i] + ve[u][i] * totalSupply[i] / veTotal[i] * 0.6)
///   ratio[u][x -> y] = sum(boost[u][i] / balance[u][i] * (t[i] - t[i - 1])) / (t[y] - t[x])
///
///   1. supply[w] is the total amount of token staked at the beginning of week `w`.
///   2. veSupply[w] is the total ve supply at the beginning of week `w`.
///   3. ve[u][w] is the ve balance for user `u` at the beginning of week `w`.
///   4. balance[u][w] is the amount of token staked for user `u` at the beginning of week `w`.
contract BoostableRebalancePool is MultipleRewardCompoundingAccumulator, IFxBoostableRebalancePool {
  using SafeERC20Upgradeable for IERC20Upgradeable;
  using DecrementalFloatingPoint for uint112;

  /*************
   * Constants *
   *************/

  /// @notice The role for liquidator.
  bytes32 public constant LIQUIDATOR_ROLE = keccak256("LIQUIDATOR_ROLE");

  /// @dev The precison use to calculation.
  uint256 private constant PRECISION = 1e18;

  /// @dev The number of seconds in one day.
  uint256 private constant DAY = 1 days;

  /// @dev The number of seconds in one week.
  uint256 private constant WEEK = 7 days;

  /// @notice The address of FXN token.
  address public immutable fxn;

  /// @notice The address of Voting Escrow FXN.
  address public immutable ve;

  /// @notice The address of Voting Escrow FXN Boost.
  address public immutable veProxy;

  /// @notice The address of FXN token minter.
  address public immutable minter;

  /***********
   * Structs *
   ***********/

  /// @dev The token balance struct. The compiler will pack this into single `uint256`.
  ///
  /// @param product The encoding product data, see the comments of `DecrementalFloatingPoint`.
  /// @param amount The amount of token currently.
  /// @param updateAt The timestamp in day when the struct is updated.
  struct TokenBalance {
    uint112 product;
    uint104 amount;
    uint40 updateAt;
  }

  /// @dev The gauge data struct. The compiler will pack this into single `uint256`.
  ///
  /// @param gauge The address of the gauge.
  /// @param claimAt The timestamp in second when last claim happened.
  struct Gauge {
    address gauge;
    uint64 claimAt;
  }

  /// @dev The boost checkpoint struct. The compiler will pack this into single `uint256`.
  /// @param veBalance The ve balance at checkpoint.
  /// @param veSupply The ve supply at checkpoint.
  /// @param historyIndex The index of supply in totalSupplyHistory at checkpoint.
  struct BoostCheckpoint {
    uint112 veBalance;
    uint112 veSupply;
    uint32 historyIndex;
  }

  /*************
   * Variables *
   *************/

  /// @notice The address of treasury contract.
  address public treasury;

  /// @notice The address of market contract.
  address public market;

  /// @notice The gauge struct.
  Gauge public gauge;

  /// @notice The address of base token.
  address public baseToken;

  /// @inheritdoc IFxBoostableRebalancePool
  address public override asset;

  /// @dev The TokenBalance struct for current total supply.
  TokenBalance private _totalSupply;

  /// @dev Mapping account address to TokenBalance struct.
  mapping(address => TokenBalance) private _balances;

  /// @notice Mapping from account address to index in `totalSupplyHistory`.
  mapping(address => BoostCheckpoint) public boostCheckpoint;

  /// @notice The number of total supply history.
  uint256 public numTotalSupplyHistory;

  /// @notice Mapping from index to history totalSupply.
  ///
  /// @dev For simplicity, we keep at most one history in each day.
  /// If there are multiple updates during one day, the last one will be recorded.
  mapping(uint256 => TokenBalance) public totalSupplyHistory;

  /// @notice The maximum collateral ratio to call liquidate.
  uint256 public liquidatableCollateralRatio;

  /// @notice The address of token wrapper for liquidated base token;
  address public wrapper;

  /// @notice Error trackers for the error correction in the loss calculation.
  uint256 public lastAssetLossError;

  /***************
   * Constructor *
   ***************/

  constructor(
    address _fxn,
    address _ve,
    address _veProxy,
    address _minter
  ) LinearMultipleRewardDistributor(1 weeks) {
    fxn = _fxn;
    ve = _ve;
    veProxy = _veProxy;
    minter = _minter;
  }

  function initialize(
    address _treasury,
    address _market,
    address _gauge
  ) external initializer {
    __Context_init(); // from ContextUpgradeable
    __ERC165_init(); // from ERC165Upgradeable
    __AccessControl_init(); // from AccessControlUpgradeable
    __ReentrancyGuard_init(); // from ReentrancyGuardUpgradeable

    __MultipleRewardCompoundingAccumulator_init(); // from MultipleRewardCompoundingAccumulator

    // access control
    _grantRole(DEFAULT_ADMIN_ROLE, _msgSender());
    _grantRole(REWARD_MANAGER_ROLE, _msgSender());

    treasury = _treasury;
    market = _market;
    gauge.gauge = _gauge;

    baseToken = IFxTreasury(_treasury).baseToken();
    asset = IFxTreasury(_treasury).fToken();
    wrapper = address(this);

    _totalSupply.product = DecrementalFloatingPoint.encode(0, 0, uint64(PRECISION));
    _totalSupply.updateAt = uint40(block.timestamp);
    totalSupplyHistory[0] = _totalSupply;
    numTotalSupplyHistory = 1;
  }

  /*************************
   * Public View Functions *
   *************************/

  /// @inheritdoc IFxBoostableRebalancePool
  function totalSupply() external view returns (uint256) {
    return _totalSupply.amount;
  }

  /// @inheritdoc IFxBoostableRebalancePool
  function balanceOf(address _account) public view override returns (uint256) {
    TokenBalance memory _balance = _balances[_account];
    return _getCompoundedBalance(_balance.amount, _balance.product, _totalSupply.product);
  }

  /// @inheritdoc IFxBoostableRebalancePool
  function getBoostRatio(address _account) public view returns (uint256) {
    (uint256 _ratio, ) = _getBoostRatioRead(_account);
    return _ratio;
  }

  /// @inheritdoc IMultipleRewardAccumulator
  function claimable(address _account, address _token) public view virtual override returns (uint256) {
    if (_token == fxn) {
      UserRewardSnapshot memory _userSnapshot = userRewardSnapshot[_account][_token];
      uint256 fullEarned = _claimable(_account, _token) - _userSnapshot.rewards.pending;
      uint256 ratio = getBoostRatio(_account);
      uint256 boostEarned = (fullEarned * ratio) / PRECISION;
      return _userSnapshot.rewards.pending + boostEarned;
    } else {
      return _claimable(_account, _token);
    }
  }

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @inheritdoc IFxBoostableRebalancePool
  function deposit(uint256 _amount, address _receiver) external override {
    address _sender = _msgSender();
    // transfer asset token to this contract
    address _asset = asset;
    if (_amount == type(uint256).max) {
      _amount = IERC20Upgradeable(_asset).balanceOf(_sender);
    }
    if (_amount == 0) revert DepositZeroAmount();
    IERC20Upgradeable(_asset).safeTransferFrom(_sender, address(this), _amount);

    // @note after checkpoint, the account balances are correct, we can `_balances` safely.
    _checkpoint(_receiver);

    // It should never exceed `type(uint104).max`.
    TokenBalance memory _supply = _totalSupply;
    TokenBalance memory _balance = _balances[_receiver];
    _supply.amount += uint104(_amount);
    _supply.updateAt = uint40(block.timestamp);
    _balance.amount += uint104(_amount);
    _balance.updateAt = uint40(block.timestamp);

    _recordTotalSupply(_supply);
    _totalSupply = _supply;
    _balances[_receiver] = _balance;

    emit Deposit(_sender, _receiver, _amount);
    emit UserDepositChange(_receiver, _balance.amount, 0);
  }

  /// @inheritdoc IFxBoostableRebalancePool
  function withdraw(uint256 _amount, address _receiver) external override {
    address _sender = _msgSender();

    // @note after checkpoint, the account balances are correct, we can `_balances` safely.
    _checkpoint(_sender);

    TokenBalance memory _supply = _totalSupply;
    TokenBalance memory _balance = _balances[_sender];
    if (_amount > _balance.amount) {
      _amount = _balance.amount;
    }
    if (_amount == 0) revert WithdrawZeroAmount();

    unchecked {
      _supply.amount -= uint104(_amount);
      _supply.updateAt = uint40(block.timestamp);
      _balance.amount -= uint104(_amount);
      _balance.updateAt = uint40(block.timestamp);
    }

    _recordTotalSupply(_supply);
    _balances[_sender] = _balance;
    _totalSupply = _supply;

    IERC20Upgradeable(asset).safeTransfer(_receiver, _amount);

    emit Withdraw(_sender, _receiver, _amount);
    emit UserDepositChange(_sender, _balance.amount, 0);
  }

  /// @inheritdoc IFxBoostableRebalancePool
  function liquidate(uint256 _maxAmount, uint256 _minBaseOut)
    external
    override
    onlyRole(LIQUIDATOR_ROLE)
    returns (uint256 _liquidated, uint256 _baseOut)
  {
    _checkpoint(address(this));

    IFxTreasury _treasury = IFxTreasury(treasury);
    if (_treasury.collateralRatio() >= liquidatableCollateralRatio) {
      revert CannotLiquidate();
    }
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
      // cannot liquidate more than assets in this contract.
      _amount = _liquidated;
    }
    IERC20Upgradeable(_asset).safeApprove(_market, 0);
    IERC20Upgradeable(_asset).safeApprove(_market, _amount);
    (_baseOut, ) = IFxMarket(_market).redeem(_amount, 0, _wrapper, _minBaseOut);
    _liquidated = _liquidated - IERC20Upgradeable(_asset).balanceOf(address(this));

    emit Liquidate(_liquidated, _baseOut);

    // wrap base token if needed
    address _token = baseToken;
    if (_wrapper != address(this)) {
      _baseOut = IFxTokenWrapper(_wrapper).wrap(_baseOut);
      _token = IFxTokenWrapper(_wrapper).dst();
    }

    // distribute liquidated base token
    _accumulateReward(_token, _baseOut);

    // notify loss
    _notifyLoss(_liquidated);
  }

  /************************
   * Restricted Functions *
   ************************/

  /// @notice Update the address of reward wrapper.
  /// @param _newWrapper The new address of reward wrapper.
  function updateWrapper(address _newWrapper) external onlyRole(DEFAULT_ADMIN_ROLE) {
    if (IFxTokenWrapper(_newWrapper).src() != baseToken) {
      revert ErrorWrapperSrcMismatch();
    }

    address _oldWrapper = wrapper;
    if (_oldWrapper != address(this) && IFxTokenWrapper(_oldWrapper).dst() != IFxTokenWrapper(_newWrapper).dst()) {
      revert ErrorWrapperDstMismatch();
    }

    wrapper = _newWrapper;

    emit UpdateWrapper(_oldWrapper, _newWrapper);
  }

  /// @notice Update the collateral ratio line for liquidation.
  /// @param _newRatio The new liquidatable collateral ratio.
  function updateLiquidatableCollateralRatio(uint256 _newRatio) external onlyRole(DEFAULT_ADMIN_ROLE) {
    uint256 _oldRatio = liquidatableCollateralRatio;
    liquidatableCollateralRatio = _newRatio;

    emit UpdateLiquidatableCollateralRatio(_oldRatio, _newRatio);
  }

  /**********************
   * Internal Functions *
   **********************/

  /// @inheritdoc MultipleRewardCompoundingAccumulator
  function _checkpoint(address _account) internal virtual override {
    // fetch FXN from gauge every 24h
    Gauge memory _gauge = gauge;
    if (_gauge.gauge != address(0) && block.timestamp > uint256(_gauge.claimAt) + DAY) {
      uint256 _balance = IERC20Upgradeable(fxn).balanceOf(address(this));
      ICurveTokenMinter(minter).mint(_gauge.gauge);
      uint256 _minted = IERC20Upgradeable(fxn).balanceOf(address(this)) - _balance;
      gauge.claimAt = uint64(block.timestamp);
      _notifyReward(fxn, _minted);
    }

    MultipleRewardCompoundingAccumulator._checkpoint(_account);

    if (_account != address(0)) {
      boostCheckpoint[_account] = BoostCheckpoint(
        uint112(IVotingEscrowProxy(veProxy).adjustedVeBalance(_account)),
        uint112(IVotingEscrow(ve).totalSupply()),
        uint32(numTotalSupplyHistory)
      );

      TokenBalance memory _balance = _balances[_account];
      TokenBalance memory _supply = _totalSupply;

      uint104 _newBalance = uint104(_getCompoundedBalance(_balance.amount, _balance.product, _supply.product));
      if (_newBalance != _balance.amount) {
        // no unchecked here, just in case
        emit UserDepositChange(_account, _newBalance, _balance.amount - _newBalance);
      }

      _balance.amount = _newBalance;
      _balance.product = _supply.product;
      _balance.updateAt = uint40(block.timestamp);
      _balances[_account] = _balance;
    }
  }

  /// @inheritdoc MultipleRewardCompoundingAccumulator
  function _updateSnapshot(address _account, address _token) internal virtual override {
    UserRewardSnapshot memory _snapshot = userRewardSnapshot[_account][_token];
    uint48 epochExponent = _totalSupply.product.epochAndExponent();

    if (_token == fxn) {
      uint256 fullEarned = _claimable(_account, _token) - _snapshot.rewards.pending;
      uint256 ratio = _getBoostRatioWrite(_account);
      uint256 boostEarned = (fullEarned * ratio) / PRECISION;
      _snapshot.rewards.pending += uint128(boostEarned);
      if (fullEarned > boostEarned) {
        // redistribute unboosted rewards.
        _notifyReward(fxn, fullEarned - boostEarned);
      }
    } else {
      _snapshot.rewards.pending = uint128(_claimable(_account, _token));
    }
    _snapshot.checkpoint = epochToExponentToRewardSnapshot[_token][epochExponent];
    _snapshot.checkpoint.timestamp = uint64(block.timestamp);
    userRewardSnapshot[_account][_token] = _snapshot;
  }

  /// @inheritdoc MultipleRewardCompoundingAccumulator
  function _getTotalPoolShare() internal view virtual override returns (uint112 _currentProd, uint256 _totalShare) {
    TokenBalance memory _supply = _totalSupply;
    _currentProd = _supply.product;
    _totalShare = _supply.amount;
  }

  /// @inheritdoc MultipleRewardCompoundingAccumulator
  function _getUserPoolShare(address _account)
    internal
    view
    virtual
    override
    returns (uint112 _previousProd, uint256 _share)
  {
    TokenBalance memory _balance = _balances[_account];
    _previousProd = _balance.product;
    _share = _balance.amount;
  }

  /// @dev Internal function to reduce asset loss due to liquidation.
  /// @param _loss The amount of asset used by liquidation.
  function _notifyLoss(uint256 _loss) internal {
    TokenBalance memory _supply = _totalSupply;

    uint256 _assetLossPerUnitStaked;
    // use >= here, in case someone send extra asset to this contract.
    if (_loss >= _supply.amount) {
      // all assets are liquidated.
      _assetLossPerUnitStaked = PRECISION;
      lastAssetLossError = 0;
      _supply.amount = 0;
    } else {
      uint256 _lossNumerator = _loss * PRECISION - lastAssetLossError;
      // Add 1 to make error in quotient positive. We want "slightly too much" LUSD loss,
      // which ensures the error in any given compoundedAssetDeposit favors the Stability Pool.
      _assetLossPerUnitStaked = (_lossNumerator / uint256(_supply.amount)) + 1;
      lastAssetLossError = _assetLossPerUnitStaked * uint256(_supply.amount) - _lossNumerator;
      _supply.amount -= uint104(_loss);
    }

    // The newProductFactor is the factor by which to change all deposits, due to the depletion of Stability Pool LUSD in the liquidation.
    // We make the product factor 0 if there was a pool-emptying. Otherwise, it is (1 - LUSDLossPerUnitStaked)
    uint256 _newProductFactor = PRECISION - _assetLossPerUnitStaked;
    _supply.product = _supply.product.mul(uint64(_newProductFactor));
    _supply.updateAt = uint40(block.timestamp);

    _recordTotalSupply(_supply);
    _totalSupply = _supply;
  }

  /// @dev Internal function to record the historical total supply.
  /// @param _supply The new total supply to record.
  function _recordTotalSupply(TokenBalance memory _supply) internal {
    unchecked {
      uint256 _numTotalSupplyHistory = numTotalSupplyHistory;
      TokenBalance memory _last = totalSupplyHistory[_numTotalSupplyHistory - 1];
      if (_last.updateAt / DAY == _supply.updateAt / DAY) {
        totalSupplyHistory[_numTotalSupplyHistory - 1] = _supply;
      } else {
        totalSupplyHistory[_numTotalSupplyHistory] = _supply;
        numTotalSupplyHistory = _numTotalSupplyHistory + 1;
      }
    }
  }

  /// @dev Internal function to compute the amount of asset deposited after several liquidation.
  ///
  /// @param _initialBalance The amount of asset deposited initially.
  /// @param _initialProduct The epoch state snapshot at initial depositing.
  /// @return _compoundedBalance The amount asset deposited after several liquidation.
  function _getCompoundedBalance(
    uint256 _initialBalance,
    uint112 _initialProduct,
    uint112 _currentProduct
  ) internal pure returns (uint256 _compoundedBalance) {
    // no balance before, return 0
    if (_initialBalance == 0) {
      return 0;
    }

    // If stake was made before a pool-emptying event, then it has been fully cancelled with debt -- so, return 0
    if (_initialProduct.epoch() < _currentProduct.epoch()) {
      return 0;
    }

    uint256 _exponentDiff = _currentProduct.exponent() - _initialProduct.exponent();

    // Compute the compounded stake. If a scale change in P was made during the stake's lifetime,
    // account for it. If more than one scale change was made, then the stake has decreased by a factor of
    // at least 1e-9 -- so return 0.
    if (_exponentDiff == 0) {
      _compoundedBalance =
        (_initialBalance * uint256(_currentProduct.magnitude())) /
        uint256(_initialProduct.magnitude());
    } else if (_exponentDiff == 1) {
      _compoundedBalance =
        (_initialBalance * uint256(_currentProduct.magnitude())) /
        uint256(_initialProduct.magnitude()) /
        DecrementalFloatingPoint.HALF_PRECISION;
    } else {
      _compoundedBalance = 0;
    }

    // If compounded deposit is less than a billionth of the initial deposit, return 0.
    //
    // NOTE: originally, this line was in place to stop rounding errors making the deposit too large. However, the error
    // corrections should ensure the error in P "favors the Pool", i.e. any given compounded deposit should slightly less
    // than it's theoretical value.
    //
    // Thus it's unclear whether this line is still really needed.
    if (_compoundedBalance < _initialBalance / 1e9) {
      _compoundedBalance = 0;
    }

    return _compoundedBalance;
  }

  /// @dev Internal function to get boost ratio for the given account.
  ///
  /// @param _account The address of the account to query.
  function _getBoostRatioRead(address _account) internal view returns (uint256, BoostCheckpoint memory) {
    TokenBalance memory _balance = _balances[_account];
    BoostCheckpoint memory _boostCheckpoint = boostCheckpoint[_account];
    // no deposit before
    if (_balance.amount == 0) return (0, _boostCheckpoint);

    // @note For gas saving, we assume the ve balance and ve supply are changing linearly.
    uint256 _currentVeBalance = IVotingEscrowProxy(veProxy).adjustedVeBalance(_account);
    uint256 _currentVeSupply = IVotingEscrow(ve).totalSupply();

    (uint256 _currentRatio, uint256 _nextIndex) = _boostRatioAt(
      _balance,
      _boostCheckpoint.veBalance,
      _boostCheckpoint.veSupply,
      _boostCheckpoint.historyIndex,
      _balance.updateAt
    );
    if (uint256(_balance.updateAt) == block.timestamp) {
      _boostCheckpoint.veBalance = uint112(_currentVeBalance);
      _boostCheckpoint.veSupply = uint112(_currentVeSupply);
      _boostCheckpoint.historyIndex = uint32(_nextIndex);
      return (_currentRatio, _boostCheckpoint);
    }

    int256 _deltaVeBalance = int256(_currentVeBalance) - int256(uint256(_boostCheckpoint.veBalance));
    int256 _deltaVeSupply = int256(_currentVeSupply) - int256(uint256(_boostCheckpoint.veSupply));
    int256 _duration = int256(block.timestamp - _balance.updateAt);

    uint256 _prevTs = _balance.updateAt;
    uint256 _accumulatedRatio;
    // compute the time weighted boost from _balance.updateAt to now.
    uint256 _nowTs = ((_prevTs + WEEK - 1) / WEEK) * WEEK;
    for (uint256 i = 0; i < 256; ++i) {
      // it is more than 4 years, should be enough
      if (_nowTs > block.timestamp) _nowTs = block.timestamp;
      _accumulatedRatio += _currentRatio * (_nowTs - _prevTs);
      if (_nowTs == block.timestamp) break;
      uint256 _veBalance;
      uint256 _veSupply;
      {
        int256 dt = int256(_nowTs - _balance.updateAt);
        _veBalance = uint256((_deltaVeBalance * dt) / _duration + int256(uint256(_boostCheckpoint.veBalance)));
        _veSupply = uint256((_deltaVeSupply * dt) / _duration + int256(uint256(_boostCheckpoint.veSupply)));
      }
      (_currentRatio, _nextIndex) = _boostRatioAt(_balance, _veBalance, _veSupply, _nextIndex, _nowTs);
      _prevTs = _nowTs;
      _nowTs += WEEK;
    }

    _boostCheckpoint.veBalance = uint112(_currentVeBalance);
    _boostCheckpoint.veSupply = uint112(_currentVeSupply);
    _boostCheckpoint.historyIndex = uint32(_nextIndex);
    return (_accumulatedRatio / uint256(_duration), _boostCheckpoint);
  }

  /// @dev Internal function to get boost ratio for the given account and make state change.
  ///
  /// @param _account The address of the account to query.
  function _getBoostRatioWrite(address _account) internal returns (uint256) {
    (uint256 _ratio, BoostCheckpoint memory _newCheckpoint) = _getBoostRatioRead(_account);
    boostCheckpoint[_account] = _newCheckpoint;
    return _ratio;
  }

  /// @dev Internal function to get boost ratio at specific time point.
  function _boostRatioAt(
    TokenBalance memory _balance,
    uint256 _veBalance,
    uint256 _veSupply,
    uint256 startIndex,
    uint256 t
  ) internal view returns (uint256, uint256) {
    // @note since totalSupplyHistory is bounded by the number of days,
    // it should be ok to use while loop.
    unchecked {
      uint256 endIndex = numTotalSupplyHistory;
      while (startIndex < endIndex) {
        if (totalSupplyHistory[startIndex].updateAt > t) break;
        startIndex += 1;
      }
      if (startIndex > 0) startIndex -= 1;
    }
    TokenBalance memory _supply = totalSupplyHistory[startIndex];
    uint256 _realBalance = _getCompoundedBalance(_balance.amount, _balance.product, _supply.product);
    if (_realBalance == 0) {
      return ((PRECISION * 4) / 10, startIndex);
    }
    uint256 _boostedBalance = (_realBalance * 4) / 10;
    if (_veSupply > 0) {
      _boostedBalance += (((_veBalance * uint256(_supply.amount)) / _veSupply) * 6) / 10;
    }
    if (_boostedBalance > _realBalance) {
      _boostedBalance = _realBalance;
    }

    return ((_boostedBalance * PRECISION) / _realBalance, startIndex);
  }
}
