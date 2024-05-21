// SPDX-License-Identifier: MIT

pragma solidity =0.8.20;

import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable-v4/token/ERC20/IERC20Upgradeable.sol";
import { SafeERC20Upgradeable } from "@openzeppelin/contracts-upgradeable-v4/token/ERC20/utils/SafeERC20Upgradeable.sol";

import { IMultipleRewardAccumulator } from "../../common/rewards/accumulator/IMultipleRewardAccumulator.sol";
import { IMultipleRewardDistributor } from "../../common/rewards/distributor/IMultipleRewardDistributor.sol";
import { ITokenConverter } from "../../helpers/converter/ITokenConverter.sol";
import { IFxUSDCompounder } from "../../interfaces/concentrator/IFxUSDCompounder.sol";
import { IConvexFXNBooster } from "../../interfaces/convex/IConvexFXNBooster.sol";
import { IStakingProxyRebalancePool } from "../../interfaces/convex/IStakingProxyRebalancePool.sol";
import { IFxUSD } from "../../interfaces/f(x)/IFxUSD.sol";
import { IFxShareableRebalancePool } from "../../interfaces/f(x)/IFxShareableRebalancePool.sol";

import { FxUSDStandardizedYieldBase } from "./FxUSDStandardizedYieldBase.sol";

contract FxUSDCompounder is FxUSDStandardizedYieldBase, IFxUSDCompounder {
  using SafeERC20Upgradeable for IERC20Upgradeable;

  /**********
   * Events *
   **********/

  /// @notice Emitted when the `minRebalanceProfit` is updated.
  /// @param oldValue The value of the previous `minRebalanceProfit`.
  /// @param newValue The value of the current `minRebalanceProfit`.
  event UpdateMinRebalanceProfit(uint256 oldValue, uint256 newValue);

  /// @notice Emitted when the converting routes are updated.
  /// @param token The address of token.
  /// @param routes The new converting routes.
  event UpdateConvertRoutes(address token, uint256[] routes);

  /**********
   * Errors *
   **********/

  /// @dev Thrown when the amount of rebalanced FxUSD is not enough.
  error ErrInsufficientRebalancedFxUSD();

  /// @dev Thrown when the amount of harvested base token is not enough.
  error ErrInsufficientHarvestedBaseToken();

  /// @dev Thrown when the amount of harvested FxUSD is not enough.
  error ErrInsufficientHarvestedFxUSD();

  /// @dev Thrown when no active liquidation currently.
  error ErrNotLiquidatedBefore();

  /*************
   * Constants *
   *************/

  /// @notice The role for rebalancer.
  bytes32 public constant REBALANCER_ROLE = keccak256("REBALANCER_ROLE");

  /// @dev The address of Convex's f(x) Booster contract.
  address private constant BOOSTER = 0xAffe966B27ba3E4Ebb8A0eC124C7b7019CC762f8;

  /// @dev The balance precision for FxUSD in rebalance pool.
  uint256 private constant BALANCE_EPS = 10000;

  /*************
   * Variables *
   *************/

  /// @notice The address of convex vault.
  address public vault;

  /// @inheritdoc IFxUSDCompounder
  uint256 public override totalPendingBaseToken;

  /// @notice The minimum profit ratio
  uint256 public minRebalanceProfit;

  /// @dev Mapping from token address to convert routes.
  mapping(address => uint256[]) private routes;

  /***************
   * Constructor *
   ***************/

  function initialize(
    address _treasury,
    address _harvester,
    address _converter,
    address _fxUSD,
    address _pool,
    string memory _name,
    string memory _symbol,
    uint256 _pid
  ) external initializer {
    __Context_init();
    __ERC165_init();
    __AccessControl_init();
    __ReentrancyGuard_init();

    __ConcentratorBaseV2_init(_treasury, _harvester, _converter);
    __FxUSDStandardizedYieldBase_init(_fxUSD, _pool, _name, _symbol);

    _grantRole(DEFAULT_ADMIN_ROLE, _msgSender());

    address cachedVault = IConvexFXNBooster(BOOSTER).createVault(_pid);
    vault = cachedVault;
    _updateMinRebalanceProfit(5e7); // 5%

    IERC20Upgradeable(_fxUSD).safeApprove(cachedVault, type(uint256).max);
  }

  /*************************
   * Public View Functions *
   *************************/

  /// @inheritdoc IFxUSDCompounder
  function getConvertRoutes(address token) external view returns (uint256[] memory) {
    return routes[token];
  }

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @inheritdoc IFxUSDCompounder
  function rebalance(uint256 minFxUSD) external onlyRole(REBALANCER_ROLE) returns (uint256 fxUSDOut) {
    address cachedVault = vault;
    uint256 cachedTotalBaseToken = totalPendingBaseToken;
    uint256 cachedTotalDepositedFxUSD = totalDepositedFxUSD;
    uint256 currentTotalFxUSD = IFxShareableRebalancePool(pool).balanceOf(cachedVault);
    if (!_hasLiquidation(cachedTotalBaseToken, currentTotalFxUSD, cachedTotalDepositedFxUSD)) {
      revert ErrNotLiquidatedBefore();
    }

    // claim pending base token first.
    IStakingProxyRebalancePool(cachedVault).getReward();

    address cachedBaseToken = baseToken;
    address cachedFxUSD = yieldToken;
    cachedTotalBaseToken = IERC20Upgradeable(cachedBaseToken).balanceOf(address(this));

    _doApprove(cachedBaseToken, cachedFxUSD, cachedTotalBaseToken);
    fxUSDOut = IFxUSD(cachedFxUSD).mint(cachedBaseToken, cachedTotalBaseToken, address(this), minFxUSD);
    if (
      fxUSDOut <
      ((cachedTotalDepositedFxUSD - currentTotalFxUSD) * (RATE_PRECISION + minRebalanceProfit)) / RATE_PRECISION
    ) {
      revert ErrInsufficientRebalancedFxUSD();
    }
    IStakingProxyRebalancePool(cachedVault).depositFxUsd(fxUSDOut);

    totalDepositedFxUSD = currentTotalFxUSD + fxUSDOut;
    totalPendingBaseToken = 0;

    emit Rebalance(_msgSender(), cachedTotalBaseToken, fxUSDOut);
  }

  /// @inheritdoc IFxUSDCompounder
  function harvest(
    address receiver,
    uint256 minBaseOut,
    uint256 minFxUSD
  ) external override onlyHarvester returns (uint256 baseOut, uint256 fxUSDOut) {
    address cachedBaseToken = baseToken;
    address cachedVault = vault;

    // claim rewards
    baseOut = IERC20Upgradeable(cachedBaseToken).balanceOf(address(this));
    IStakingProxyRebalancePool(cachedVault).getReward();
    baseOut = IERC20Upgradeable(cachedBaseToken).balanceOf(address(this)) - baseOut;

    // convert all other tokens to base token first
    {
      address[] memory tokens = IMultipleRewardDistributor(pool).getActiveRewardTokens();
      address cachedConverter = converter;
      for (uint256 i = 0; i < tokens.length; i++) {
        address cachedToken = tokens[i];
        if (cachedToken == cachedBaseToken) continue;
        baseOut += _doConvert(cachedConverter, cachedToken, IERC20Upgradeable(cachedToken).balanceOf(address(this)));
      }
      if (baseOut < minBaseOut) revert ErrInsufficientHarvestedBaseToken();
    }

    // if liquidated, do nothing and return
    // otherwise, convert to FxUSD and distribute bounty
    uint256 cachedTotalBaseToken = totalPendingBaseToken;
    uint256 cachedTotalDepositedFxUSD = totalDepositedFxUSD;
    if (
      _hasLiquidation(
        cachedTotalBaseToken,
        IFxShareableRebalancePool(pool).balanceOf(cachedVault),
        cachedTotalDepositedFxUSD
      )
    ) {
      totalPendingBaseToken = cachedTotalBaseToken + baseOut;
      emit Harvest(_msgSender(), baseOut, 0, 0, 0);
    } else {
      // use base token as bounty
      uint256 expense = (getExpenseRatio() * baseOut) / RATE_PRECISION;
      if (expense > 0) {
        IERC20Upgradeable(cachedBaseToken).safeTransfer(treasury, expense);
      }
      uint256 bounty = (getHarvesterRatio() * baseOut) / RATE_PRECISION;
      if (bounty > 0) {
        IERC20Upgradeable(cachedBaseToken).safeTransfer(receiver, bounty);
      }

      address cachedFxUSD = yieldToken;
      uint256 amountBaseToken = baseOut - expense - bounty;
      _doApprove(cachedBaseToken, cachedFxUSD, amountBaseToken);
      fxUSDOut = IFxUSD(cachedFxUSD).mint(cachedBaseToken, amountBaseToken, address(this), 0);
      if (fxUSDOut < minFxUSD) revert ErrInsufficientHarvestedFxUSD();

      // already approved in `initialize` function.
      IStakingProxyRebalancePool(cachedVault).depositFxUsd(fxUSDOut);
      emit Harvest(_msgSender(), baseOut, expense, bounty, fxUSDOut);

      totalDepositedFxUSD = cachedTotalDepositedFxUSD + fxUSDOut;
    }
  }

  /************************
   * Restricted Functions *
   ************************/

  /// @notice Update the converting routes for the given token.
  /// @param token The address of token to update.
  /// @param newRoutes The new converting routes.
  function updateConvertRoutes(address token, uint256[] memory newRoutes) external onlyRole(DEFAULT_ADMIN_ROLE) {
    delete routes[token];
    routes[token] = newRoutes;

    emit UpdateConvertRoutes(token, newRoutes);
  }

  /// @notice Update the minimum rebalance profit.
  /// @param newMinRebalanceProfit The new minimum rebalance profit.
  function updateMinRebalanceProfit(uint256 newMinRebalanceProfit) external onlyRole(DEFAULT_ADMIN_ROLE) {
    _updateMinRebalanceProfit(newMinRebalanceProfit);
  }

  /**********************
   * Internal Functions *
   **********************/

  /// @inheritdoc FxUSDStandardizedYieldBase
  function _liquidated() internal view virtual override returns (bool) {
    return
      _hasLiquidation(totalPendingBaseToken, IFxShareableRebalancePool(pool).balanceOf(vault), totalDepositedFxUSD);
  }

  /// @inheritdoc FxUSDStandardizedYieldBase
  function _deposit(address tokenIn, uint256 amountDeposited)
    internal
    virtual
    override
    returns (uint256 amountSharesOut)
  {
    address cachedFxUSD = yieldToken;
    uint256 amountFxUSD;
    if (tokenIn == cachedFxUSD) {
      amountFxUSD = amountDeposited;
    } else {
      _doApprove(tokenIn, cachedFxUSD, amountDeposited);
      amountFxUSD = IFxUSD(cachedFxUSD).mint(tokenIn, amountDeposited, address(this), 0);
    }

    // deposit into Convex, already approved in `initialize` function.
    IStakingProxyRebalancePool(vault).depositFxUsd(amountFxUSD);

    // convert to pool share
    uint256 _totalSupply = totalSupply();
    uint256 _totalFxUSD = totalDepositedFxUSD;
    if (_totalFxUSD == 0) {
      amountSharesOut = amountFxUSD;
    } else {
      amountSharesOut = (amountFxUSD * _totalSupply) / _totalFxUSD;
    }

    totalDepositedFxUSD = _totalFxUSD + amountFxUSD;
  }

  /// @inheritdoc FxUSDStandardizedYieldBase
  function _redeem(
    address receiver,
    address tokenOut,
    uint256 amountSharesToRedeem
  ) internal virtual override returns (uint256 amountTokenOut) {
    address cachedFxUSD = yieldToken;
    address cachedBaseToken = baseToken;
    address cachedVault = vault;

    // `_burn` is called before this function call, so we add it back here.
    uint256 cachedTotalSupply = totalSupply() + amountSharesToRedeem;
    uint256 cachedTotalDepositedFxUSD = totalDepositedFxUSD;
    uint256 cachedTotalBaseToken = totalPendingBaseToken;

    uint256 currentTotalFxUSD = IFxShareableRebalancePool(pool).balanceOf(cachedVault);
    uint256 amountFxUSD;
    uint256 amountBaseToken;
    // If has liquidation, can only redeem as baseToken
    // Otherwise, withdraw as FxUSD first
    if (_hasLiquidation(cachedTotalBaseToken, currentTotalFxUSD, cachedTotalDepositedFxUSD)) {
      if (tokenOut != cachedBaseToken) revert ErrInvalidTokenOut();

      // claim pending base token first.
      IStakingProxyRebalancePool(cachedVault).getReward();

      // use current real FxUSD/BaseToken balance for calculation.
      cachedTotalBaseToken = IERC20Upgradeable(cachedBaseToken).balanceOf(address(this));
      amountFxUSD = (currentTotalFxUSD * amountSharesToRedeem) / cachedTotalSupply;
      amountBaseToken = (cachedTotalBaseToken * amountSharesToRedeem) / cachedTotalSupply;

      // withdraw as base token, since it may be impossible to wrap to FxUSD.
      _withdrawAsBase(cachedVault, amountFxUSD);
      uint256 baseTokenDelta = IERC20Upgradeable(cachedBaseToken).balanceOf(address(this)) - cachedTotalBaseToken;

      totalPendingBaseToken = cachedTotalBaseToken - amountBaseToken;
      totalDepositedFxUSD = cachedTotalDepositedFxUSD - amountFxUSD;
      amountBaseToken += baseTokenDelta;
      amountFxUSD = 0;
    } else {
      // just in case someone donate FxUSD to this contract.
      if (currentTotalFxUSD > cachedTotalDepositedFxUSD) cachedTotalDepositedFxUSD = currentTotalFxUSD;

      amountFxUSD = (amountSharesToRedeem * cachedTotalDepositedFxUSD) / cachedTotalSupply;
      totalDepositedFxUSD = cachedTotalDepositedFxUSD - amountFxUSD;
      if (tokenOut == cachedFxUSD) {
        // It is very rare but possible that the corresponding market is under collateral.
        // In such case, we cannot withdraw as FxUSD and can only withdraw as base token.
        // But since it is very rare, we don't do anything about this for now and let the call revert.
        // The user will choose to withdraw as base token instead.
        IStakingProxyRebalancePool(cachedVault).withdrawFxUsd(amountFxUSD);
      } else {
        amountBaseToken = IERC20Upgradeable(cachedBaseToken).balanceOf(address(this));
        _withdrawAsBase(cachedVault, amountFxUSD);
        amountBaseToken = IERC20Upgradeable(cachedBaseToken).balanceOf(address(this)) - amountBaseToken;
        amountFxUSD = 0;
      }
    }

    if (amountBaseToken > 0) {
      IERC20Upgradeable(cachedBaseToken).safeTransfer(receiver, amountBaseToken);
      amountTokenOut = amountBaseToken;
    }
    if (amountFxUSD > 0) {
      IERC20Upgradeable(cachedFxUSD).safeTransfer(receiver, amountFxUSD);
      amountTokenOut = amountFxUSD;
    }
  }

  /// @dev Internal function to check whether the pool has been liquidated.
  function _hasLiquidation(
    uint256 cachedTotalBaseToken,
    uint256 currentTotalFxUSD,
    uint256 cachedTotalDepositedFxUSD
  ) private pure returns (bool) {
    // Since rebalance pool use rebased method to record balance and will have precision loss.
    // We add some epsilon during balance check.
    return (cachedTotalBaseToken > 0 || _isSmallerWithError(currentTotalFxUSD, cachedTotalDepositedFxUSD, BALANCE_EPS));
  }

  /// @dev Internal function to convert tokens.
  ///
  /// @param _converter The address of converter.
  /// @param _tokenIn The address of token to convert.
  /// @param _amountIn The amount of token to convert.
  /// @return _amountOut The amount of tokens converted.
  function _doConvert(
    address _converter,
    address _tokenIn,
    uint256 _amountIn
  ) internal returns (uint256 _amountOut) {
    if (_amountIn == 0) return 0;

    uint256[] memory cachedRoutes = routes[_tokenIn];
    _amountOut = _amountIn;
    unchecked {
      uint256 _length = cachedRoutes.length;
      if (_length > 0) {
        IERC20Upgradeable(_tokenIn).safeTransfer(_converter, _amountIn);
        _length -= 1;
        for (uint256 i = 0; i < _length; i++) {
          _amountOut = ITokenConverter(_converter).convert(cachedRoutes[i], _amountOut, _converter);
        }
        _amountOut = ITokenConverter(_converter).convert(cachedRoutes[_length], _amountOut, address(this));
      }
    }
  }

  /// @dev Internal function to check whether a + err < b
  function _isSmallerWithError(
    uint256 a,
    uint256 b,
    uint256 err
  ) internal pure returns (bool) {
    return a + err < b;
  }

  /// @dev Internal function to update rebalance profit.
  /// @param newMinRebalanceProfit The new minimum rebalance profit.
  function _updateMinRebalanceProfit(uint256 newMinRebalanceProfit) private {
    uint256 oldValue = minRebalanceProfit;
    minRebalanceProfit = newMinRebalanceProfit;

    emit UpdateMinRebalanceProfit(oldValue, newMinRebalanceProfit);
  }

  /// @dev Internal function to withdraw fxUSD to base token from convex vault
  /// @param cachedVault The address of convex vault.
  /// @param amountFxUSD The amount of fxUSD to withdraw
  function _withdrawAsBase(address cachedVault, uint256 amountFxUSD) private {
    try
      IStakingProxyRebalancePool(cachedVault).withdrawAsBase(
        amountFxUSD,
        0xA5e2Ec4682a32605b9098Ddd7204fe84Ab932fE4,
        0x11C907b3aeDbD863e551c37f21DD3F36b28A6784
      )
    {} catch {
      IStakingProxyRebalancePool(cachedVault).withdrawAsBase(amountFxUSD, 0);
    }
  }
}
