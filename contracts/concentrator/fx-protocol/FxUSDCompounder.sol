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

  /*************
   * Constants *
   *************/

  /// @notice The role for rebalancer.
  bytes32 public constant REBALANCER_ROLE = keccak256("REBALANCER_ROLE");

  /// @dev The address of Convex's f(x) Booster contract.
  address private constant BOOSTER = 0xAffe966B27ba3E4Ebb8A0eC124C7b7019CC762f8;

  /// @dev The balance precision for FxUSD in rebalance pool.
  uint256 private constant BALANCE_EPS = 10000;

  /// @notice The pid of convex pool
  uint256 private immutable pid;

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

  constructor(uint256 _pid) {
    pid = _pid;
  }

  function initialize(
    address _treasury,
    address _harvester,
    address _converter,
    address _fxUSD,
    address _pool,
    string memory _name,
    string memory _symbol
  ) external initializer {
    __Context_init();
    __ERC165_init();
    __AccessControl_init();
    __ReentrancyGuard_init();

    __ConcentratorBaseV2_init(_treasury, _harvester, _converter);
    __FxUSDStandardizedYieldBase_init(_fxUSD, _pool, _name, _symbol);

    _grantRole(DEFAULT_ADMIN_ROLE, _msgSender());

    address cachedVault = IConvexFXNBooster(BOOSTER).createVault(pid);
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
    if (!_hasLiquidation(cachedTotalBaseToken, currentTotalFxUSD, cachedTotalDepositedFxUSD)) revert();

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
      revert();
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
    address cachedFxUSD = yieldToken;
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
      if (baseOut < minBaseOut) revert();
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

      uint256 amountBaseToken = baseOut - expense - bounty;
      _doApprove(cachedBaseToken, cachedFxUSD, amountBaseToken);
      fxUSDOut = IFxUSD(cachedFxUSD).mint(cachedBaseToken, amountBaseToken, address(this), 0);
      if (fxUSDOut < minFxUSD) revert();

      // already approved in `initialize` function.
      IStakingProxyRebalancePool(cachedVault).depositFxUsd(fxUSDOut);
      emit Harvest(_msgSender(), baseOut, expense, bounty, fxUSDOut);

      totalDepositedFxUSD = cachedTotalDepositedFxUSD + fxUSDOut;
    }
  }

  /************************
   * Restricted Functions *
   ************************/

  function updateConvertRoutes(address token, uint256[] memory newRoutes) external onlyRole(DEFAULT_ADMIN_ROLE) {
    delete routes[token];
    routes[token] = newRoutes;
  }

  function updateMinRebalanceProfit(uint256 _newMinRebalanceProfit) external onlyRole(DEFAULT_ADMIN_ROLE) {
    _updateMinRebalanceProfit(_newMinRebalanceProfit);
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
      if (tokenOut != cachedBaseToken) revert();

      // claim pending base token first.
      IStakingProxyRebalancePool(cachedVault).getReward();

      // use current real FxUSD/BaseToken balance for calculation.
      cachedTotalBaseToken = IERC20Upgradeable(cachedBaseToken).balanceOf(address(this));
      amountFxUSD = (currentTotalFxUSD * amountSharesToRedeem) / cachedTotalSupply;
      amountBaseToken = (cachedTotalBaseToken * amountSharesToRedeem) / cachedTotalSupply;

      // withdraw as base token, since it may be impossible to wrap to FxUSD.
      IStakingProxyRebalancePool(cachedVault).withdrawAsBase(amountFxUSD, 0);
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
        IStakingProxyRebalancePool(cachedVault).withdrawAsBase(amountFxUSD, 0);
        amountBaseToken = IERC20Upgradeable(cachedBaseToken).balanceOf(address(this)) - amountBaseToken;
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

  function _updateMinRebalanceProfit(uint256 _newMinRebalanceProfit) private {
    minRebalanceProfit = _newMinRebalanceProfit;
  }
}
