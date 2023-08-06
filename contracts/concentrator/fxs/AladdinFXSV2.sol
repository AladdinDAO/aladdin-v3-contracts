// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import { SafeMathUpgradeable } from "@openzeppelin/contracts-upgradeable/math/SafeMathUpgradeable.sol";
import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import { SafeERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/SafeERC20Upgradeable.sol";

import { IAladdinFXSExtensions } from "./interfaces/IAladdinFXSExtensions.sol";
import { IAladdinCompounder } from "../interfaces/IAladdinCompounder.sol";
import { IConcentratorStrategy } from "../interfaces/IConcentratorStrategy.sol";
import { IConvexFXSDepositor } from "../../interfaces/convex/IConvexFXSDepositor.sol";
import { IConvexBasicRewards } from "../../interfaces/IConvexBasicRewards.sol";
import { ICurveCryptoPool } from "../../interfaces/ICurveCryptoPool.sol";

import { AladdinCompounder } from "../AladdinCompounder.sol";

// solhint-disable no-empty-blocks
// solhint-disable const-name-snakecase
// solhint-disable reason-string

contract AladdinFXSV2 is AladdinCompounder, IAladdinFXSExtensions {
  using SafeMathUpgradeable for uint256;
  using SafeERC20Upgradeable for IERC20Upgradeable;

  /**********
   * Events *
   **********/

  /// @notice Emitted when pool assets migrated.
  /// @param _oldStrategy The address of old strategy.
  /// @param _newStrategy The address of current strategy.
  event Migrate(address _oldStrategy, address _newStrategy);

  /*************
   * Constants *
   *************/

  /// @dev The address of FXS token.
  address private constant FXS = 0x3432B6A60D23Ca0dFCa7761B7ab56459D9C964D0;

  /// @dev The address of cvxFXS token.
  address private constant cvxFXS = 0xFEEf77d3f69374f66429C91d732A244f074bdf74;

  /// @dev The address of Curve FXS/cvxFXS pool.
  address private constant CURVE_FXS_cvxFXS_POOL = 0xd658A338613198204DCa1143Ac3F01A722b5d94A;

  /// @dev The address of Convex FXS => cvxFXS Contract.
  address private constant FXS_DEPOSITOR = 0x8f55d7c21bDFf1A51AFAa60f3De7590222A3181e;

  /// @dev The address of cvxFXS/FXS-f reward contract.
  address private constant CONVEX_REWARDER = 0xf27AFAD0142393e4b3E5510aBc5fe3743Ad669Cb;

  /// @dev The address of CvxFxsStaking contract.
  address private constant stkCvxFxs = 0x49b4d1dF40442f0C31b1BbAEA3EDE7c38e37E31a;

  /*************
   * Variables *
   *************/

  /// @dev The address of ZAP contract, will be used to swap tokens.
  address public zap;

  /// @notice The list of rewards token.
  address[] public rewards;

  /// @notice The address of auto-compounding strategy.
  address public strategy;

  /***************
   * Constructor *
   ***************/

  function initializeV2(address _strategy) external {
    require(strategy == address(0), "initialized");
    strategy = _strategy;

    // make sure harvest is called before upgrade.
    require(IConvexBasicRewards(CONVEX_REWARDER).earned(address(this)) == 0, "not harvested");

    // withdraw all FXS/cvxFXS LP from staking contract
    uint256 _totalAssetsStored = totalAssetsStored;
    IConvexBasicRewards(CONVEX_REWARDER).withdrawAndUnwrap(_totalAssetsStored, false);

    // withdraw LP as cvxFXS
    _totalAssetsStored = ICurveCryptoPool(CURVE_FXS_cvxFXS_POOL).remove_liquidity_one_coin(_totalAssetsStored, 1, 0);

    // transfer cvxFXS to strategy
    IERC20Upgradeable(cvxFXS).safeTransfer(_strategy, _totalAssetsStored);
    IConcentratorStrategy(_strategy).deposit(address(0), _totalAssetsStored);
    totalAssetsStored = _totalAssetsStored;

    // approve
    IERC20Upgradeable(FXS).safeApprove(FXS_DEPOSITOR, uint256(-1));
  }

  /*************************
   * Public View Functions *
   *************************/

  /// @inheritdoc IAladdinCompounder
  function asset() public pure override returns (address) {
    return cvxFXS;
  }

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @inheritdoc IAladdinFXSExtensions
  function depositWithStkCvxFxs(uint256 _assets, address _receiver)
    external
    override
    nonReentrant
    returns (uint256 _shares)
  {
    _distributePendingReward();

    if (_assets == uint256(-1)) {
      _assets = IERC20Upgradeable(stkCvxFxs).balanceOf(msg.sender);
    }
    IERC20Upgradeable(stkCvxFxs).safeTransferFrom(msg.sender, strategy, _assets);

    _shares = _mintShare(_assets, _receiver);
  }

  /// @inheritdoc IAladdinFXSExtensions
  function depositWithFXS(
    uint256 _assets,
    address _receiver,
    uint256 _minShareOut
  ) external override nonReentrant returns (uint256 _shares) {
    _distributePendingReward();

    if (_assets == uint256(-1)) {
      _assets = IERC20Upgradeable(FXS).balanceOf(msg.sender);
    }
    IERC20Upgradeable(FXS).safeTransferFrom(msg.sender, address(this), _assets);

    address _strategy = strategy;
    _assets = _swapFXSToCvxFXS(_assets, _strategy);
    IConcentratorStrategy(_strategy).deposit(_receiver, _assets);

    _shares = _mintShare(_assets, _receiver);
    require(_shares >= _minShareOut, "aFXS: insufficient share received");
  }

  /// @inheritdoc IAladdinCompounder
  function harvest(address _recipient, uint256 _minAssets) external override nonReentrant returns (uint256) {
    ensureCallerIsHarvester();

    _distributePendingReward();

    uint256 _amountLP = IConcentratorStrategy(strategy).harvest(zap, FXS);
    require(_amountLP >= _minAssets, "aFXS: insufficient rewards");

    FeeInfo memory _info = feeInfo;
    uint256 _platformFee;
    uint256 _harvestBounty;
    uint256 _totalAssets = totalAssetsStored; // the value is correct
    uint256 _totalShare = totalSupply();
    if (_info.platformPercentage > 0) {
      _platformFee = (_info.platformPercentage * _amountLP) / FEE_PRECISION;
      // share will be a little more than the actual percentage since minted before distribute rewards
      _mint(_info.platform, _platformFee.mul(_totalShare) / _totalAssets);
    }
    if (_info.bountyPercentage > 0) {
      _harvestBounty = (_info.bountyPercentage * _amountLP) / FEE_PRECISION;
      // share will be a little more than the actual percentage since minted before distribute rewards
      _mint(_recipient, _harvestBounty.mul(_totalShare) / _totalAssets);
    }
    totalAssetsStored = _totalAssets.add(_platformFee).add(_harvestBounty);

    emit Harvest(msg.sender, _recipient, _amountLP, _platformFee, _harvestBounty);

    // 3. update rewards info
    _notifyHarvestedReward(_amountLP - _platformFee - _harvestBounty);

    return _amountLP;
  }

  /************************
   * Restricted Functions *
   ************************/

  /// @notice Update the zap contract
  /// @param _zap The address of the zap contract.
  function updateZap(address _zap) external onlyOwner {
    require(_zap != address(0), "aFXS: zero zap address");
    zap = _zap;

    emit UpdateZap(_zap);
  }

  /// @notice Migrate pool assets to new strategy.
  /// @param _newStrategy The address of new strategy.
  function migrateStrategy(address _newStrategy) external onlyOwner {
    require(_newStrategy != address(0), "aFXS: zero new strategy address");

    _distributePendingReward();

    uint256 _totalUnderlying = totalAssetsStored;
    RewardInfo memory _info = rewardInfo;
    if (_info.periodLength > 0) {
      if (block.timestamp < _info.finishAt) {
        _totalUnderlying += (_info.finishAt - block.timestamp) * _info.rate;
      }
    }

    address _oldStrategy = strategy;
    strategy = _newStrategy;

    IConcentratorStrategy(_oldStrategy).prepareMigrate(_newStrategy);
    IConcentratorStrategy(_oldStrategy).withdraw(_newStrategy, _totalUnderlying);
    IConcentratorStrategy(_oldStrategy).finishMigrate(_newStrategy);

    IConcentratorStrategy(_newStrategy).deposit(address(this), _totalUnderlying);

    emit Migrate(_oldStrategy, _newStrategy);
  }

  /**********************
   * Internal Functions *
   **********************/

  /// @inheritdoc AladdinCompounder
  /// @dev The caller should make sure `_distributePendingReward` is called before.
  function _deposit(uint256 _assets, address _receiver) internal override returns (uint256) {
    address _strategy = strategy;
    IERC20Upgradeable(cvxFXS).safeTransfer(_strategy, _assets);
    IConcentratorStrategy(_strategy).deposit(_receiver, _assets);

    return _mintShare(_assets, _receiver);
  }

  /// @dev Internal function to mint share to user.
  /// @param _assets The amount of asset to deposit.
  /// @param _receiver The address of account who will receive the pool share.
  /// @return Return the amount of pool shares to be received.
  function _mintShare(uint256 _assets, address _receiver) internal returns (uint256) {
    require(_assets > 0, "aFXS: deposit zero amount");

    uint256 _totalAssets = totalAssetsStored; // the value is correct
    uint256 _totalShare = totalSupply();
    uint256 _shares;
    if (_totalAssets == 0) _shares = _assets;
    else _shares = _assets.mul(_totalShare) / _totalAssets;

    _mint(_receiver, _shares);

    totalAssetsStored = _totalAssets + _assets;

    emit Deposit(msg.sender, _receiver, _assets, _shares);

    return _shares;
  }

  /// @inheritdoc AladdinCompounder
  /// @dev The caller should make sure `_distributePendingReward` is called before.
  function _withdraw(
    uint256 _shares,
    address _receiver,
    address _owner
  ) internal override returns (uint256) {
    require(_shares > 0, "aFXS: withdraw zero share");
    require(_shares <= balanceOf(_owner), "aFXS: insufficient owner shares");
    uint256 _totalAssets = totalAssetsStored; // the value is correct
    uint256 _totalShare = totalSupply();
    uint256 _amount = _shares.mul(_totalAssets) / _totalShare;
    _burn(_owner, _shares);

    if (_totalShare != _shares) {
      // take withdraw fee if it is not the last user.
      uint256 _withdrawPercentage = getFeeRate(WITHDRAW_FEE_TYPE, _owner);
      uint256 _withdrawFee = (_amount * _withdrawPercentage) / FEE_PRECISION;
      _amount = _amount - _withdrawFee; // never overflow here
    } else {
      // @note If it is the last user, some extra rewards still pending.
      // We just ignore it for now.
    }

    totalAssetsStored = _totalAssets - _amount; // never overflow here

    IConcentratorStrategy(strategy).withdraw(_receiver, _amount);

    emit Withdraw(msg.sender, _receiver, _owner, _amount, _shares);

    return _amount;
  }

  /// @dev Internal function to swap FXS to cvxFXS
  /// @param _amountIn The amount of FXS to swap.
  /// @param _recipient The address of recipient who will recieve the cvxFXS.
  function _swapFXSToCvxFXS(uint256 _amountIn, address _recipient) internal returns (uint256) {
    // CRV swap to cvxFXS or stake to cvxFXS
    uint256 _amountOut = ICurveCryptoPool(CURVE_FXS_cvxFXS_POOL).get_dy(0, 1, _amountIn);
    bool useCurve = _amountOut > _amountIn;

    if (useCurve) {
      IERC20Upgradeable(FXS).safeApprove(CURVE_FXS_cvxFXS_POOL, 0);
      IERC20Upgradeable(FXS).safeApprove(CURVE_FXS_cvxFXS_POOL, _amountIn);
      _amountOut = ICurveCryptoPool(CURVE_FXS_cvxFXS_POOL).exchange_underlying(0, 1, _amountIn, 0, _recipient);
    } else {
      uint256 _lockIncentive = IConvexFXSDepositor(FXS_DEPOSITOR).incentiveFxs();
      // if use `lock = false`, will possible take fee
      // if use `lock = true`, some incentive will be given
      _amountOut = IERC20Upgradeable(cvxFXS).balanceOf(address(this));
      if (_lockIncentive == 0) {
        // no lock incentive, use `lock = false`
        IConvexFXSDepositor(FXS_DEPOSITOR).deposit(_amountIn, false);
      } else {
        // no lock incentive, use `lock = true`
        IConvexFXSDepositor(FXS_DEPOSITOR).deposit(_amountIn, true);
      }
      _amountOut = IERC20Upgradeable(cvxFXS).balanceOf(address(this)) - _amountOut; // never overflow here
      if (_recipient != address(this)) {
        IERC20Upgradeable(cvxFXS).safeTransfer(_recipient, _amountOut);
      }
    }
    return _amountOut;
  }
}
