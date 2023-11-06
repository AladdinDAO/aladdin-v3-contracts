// SPDX-License-Identifier: MIT

pragma solidity =0.8.20;

import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable-v4/token/ERC20/IERC20Upgradeable.sol";
import { SafeERC20Upgradeable } from "@openzeppelin/contracts-upgradeable-v4/token/ERC20/utils/SafeERC20Upgradeable.sol";

import { IMultipleRewardAccumulator } from "../../common/rewards/accumulator/IMultipleRewardAccumulator.sol";
import { MultipleRewardCompoundingAccumulator } from "../../common/rewards/accumulator/MultipleRewardCompoundingAccumulator.sol";
import { LinearMultipleRewardDistributor } from "../../common/rewards/distributor/LinearMultipleRewardDistributor.sol";

import { IFxBoostableRebalancePool } from "../../interfaces/f(x)/IFxBoostableRebalancePool.sol";
import { IFxTokenWrapper } from "../../interfaces/f(x)/IFxTokenWrapper.sol";

/// @title RebalancePoolWithBoost
/// @notice To add boost for FXN, we maintain a time-weighted boost ratio for each user.
///   boost[u][i] = min(balance[u][i], 0.4 * balance[u][i] + ve[u][i] * totalSupply[i] / veTotal[i] * 0.6)
///   ratio[u][x -> y] = sum(boost[u][i] / balance[u][i] * (t[i] - t[i - 1])) / (t[y] - t[x])
///
///   1. supply[w] is the total amount of token staked at the beginning of week `w`.
///   2. veSupply[w] is the total ve supply at the beginning of week `w`.
///   3. ve[u][w] is the ve balance for user `u` at the beginning of week `w`.
///   4. balance[u][w] is the amount of token staked for user `u` at the beginning of week `w`.
///   5. boosted[u][w] is the boosted balance for user `u` at the beginning of week `w`.
///      boosted[u][w] = min(balance[u][w], 0.4 * balance[u][w] + ve[u][w] * totalSupply[w] / veTotal[w] * 0.6)
///
/// Let `r[w]` be the amount of FXN allocated to the pool during week `w`,

contract BoostableRebalancePool is MultipleRewardCompoundingAccumulator, IFxBoostableRebalancePool {
  /*************
   * Constants *
   *************/

  bytes32 public constant LIQUIDATOR_ROLE = keccak256("LIQUIDATOR_ROLE");

  address public immutable fxn;

  address public immutable ve;

  address public immutable minter;

  /***********
   * Structs *
   ***********/

  struct TokenBalance {
    uint128 product;
    uint128 amount;
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

  /// @inheritdoc IFxBoostableRebalancePool
  address public override asset;

  TokenBalance private _totalSupply;

  mapping(address => TokenBalance) private _balances;

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
    address _minter
  ) LinearMultipleRewardDistributor(1 weeks) {
    fxn = _fxn;
    ve = _ve;
    minter = _minter;
  }

  function initialize(address _treasury, address _market) external initializer {}

  /*************************
   * Public View Functions *
   *************************/

  /// @inheritdoc IFxBoostableRebalancePool
  function totalSupply() external view returns (uint256) {
    return _totalSupply.amount;
  }

  /// @inheritdoc IFxBoostableRebalancePool
  function balanceOf(address _account) public view override returns (uint256) {}

  /// @inheritdoc IMultipleRewardAccumulator
  function claimable(address account, address token)
    public
    view
    override(MultipleRewardCompoundingAccumulator)
    returns (uint256 amount)
  {
    // special handle FXN
  }

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @inheritdoc IFxBoostableRebalancePool
  function deposit(uint256 amount, address recipient) external override {}

  /// @inheritdoc IFxBoostableRebalancePool
  function withdraw(uint256 amount, address recipient) external override {}

  /// @inheritdoc IFxBoostableRebalancePool
  function liquidate(uint256 maxAmount, uint256 minBaseOut)
    external
    override
    returns (uint256 liquidated, uint256 baseOut)
  {}

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
    // fetch rewards from gauge every 24h
    uint256 _balance = IERC20Upgradeable(fxn).balanceOf(address(this));

    MultipleRewardCompoundingAccumulator._checkpoint(_account);

    // take snapshot and update balance
  }

  /// @inheritdoc MultipleRewardCompoundingAccumulator
  function _claimSingle(
    address _account,
    address _token,
    address _receiver
  ) internal virtual override returns (uint256) {
    if (_token == fxn) {
      // special handle FXN
    } else {
      MultipleRewardCompoundingAccumulator._claimSingle(_account, _token, _receiver);
    }
  }

  /// @inheritdoc MultipleRewardCompoundingAccumulator
  function _getTotalPoolShare() internal view virtual override returns (uint128 _currentProd, uint256 _totalShare) {
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
    returns (uint128 _previousProd, uint256 _share)
  {
    TokenBalance memory _balance = _balances[_account];
    _previousProd = _balance.product;
    _share = _balance.amount;
  }
}
