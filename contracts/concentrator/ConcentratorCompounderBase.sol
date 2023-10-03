// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { IERC4626Upgradeable } from "@openzeppelin/contracts-upgradeable-v4/interfaces/IERC4626Upgradeable.sol";
import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable-v4/security/ReentrancyGuardUpgradeable.sol";
import { ERC20PermitUpgradeable } from "@openzeppelin/contracts-upgradeable-v4/token/ERC20/extensions/ERC20PermitUpgradeable.sol";
import { SafeERC20Upgradeable } from "@openzeppelin/contracts-upgradeable-v4/token/ERC20/utils/SafeERC20Upgradeable.sol";
import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable-v4/token/ERC20/IERC20Upgradeable.sol";

import { CustomFeeRate } from "../common/fees/CustomFeeRate.sol";
import { LinearRewardDistributor } from "../common/rewards/distributor/LinearRewardDistributor.sol";
import { ConcentratorBaseV2 } from "./ConcentratorBaseV2.sol";

import { IConcentratorCompounder } from "./interfaces/IConcentratorCompounder.sol";
import { IConcentratorStrategy } from "./interfaces/IConcentratorStrategy.sol";

// solhint-disable func-name-mixedcase
// solhint-disable no-empty-blocks

abstract contract ConcentratorCompounderBase is
  ReentrancyGuardUpgradeable,
  ERC20PermitUpgradeable,
  ConcentratorBaseV2,
  CustomFeeRate,
  LinearRewardDistributor,
  IConcentratorCompounder
{
  using SafeERC20Upgradeable for IERC20Upgradeable;

  /*************
   * Constants *
   *************/

  /// @dev The fee type for withdrawal.
  uint256 private constant WITHDRAWAL_FEE_TYPE = 0;

  /*************
   * Variables *
   *************/

  /// @inheritdoc IERC4626Upgradeable
  uint256 public override totalAssets;

  /// @inheritdoc IConcentratorCompounder
  address public override strategy;

  /// @dev reserved slots.
  uint256[48] private __gap;

  /***************
   * Constructor *
   ***************/

  function __ConcentratorCompounderBase_init(address _strategy) internal onlyInitializing {
    strategy = _strategy;
  }

  /*************************
   * Public View Functions *
   *************************/

  /// @inheritdoc IERC4626Upgradeable
  function asset() external view override returns (address) {
    return _getAsset();
  }

  /// @inheritdoc IERC4626Upgradeable
  function convertToShares(uint256 _assets) public view override returns (uint256) {
    uint256 _totalAssets = totalAssets;
    if (_totalAssets == 0) return _assets;

    uint256 _totalShares = totalSupply();
    return (_totalShares * _assets) / _totalAssets;
  }

  /// @inheritdoc IERC4626Upgradeable
  function convertToAssets(uint256 _shares) public view override returns (uint256) {
    uint256 _totalShares = totalSupply();
    if (_totalShares == 0) return _shares;

    uint256 _totalAssets = totalAssets;
    return (_totalAssets * _shares) / _totalShares;
  }

  /// @inheritdoc IERC4626Upgradeable
  function maxDeposit(address) external pure override returns (uint256) {
    return type(uint256).max;
  }

  /// @inheritdoc IERC4626Upgradeable
  function previewDeposit(uint256 _assets) external view override returns (uint256) {
    return convertToShares(_assets);
  }

  /// @inheritdoc IERC4626Upgradeable
  function maxMint(address) external pure override returns (uint256) {
    return type(uint256).max;
  }

  /// @inheritdoc IERC4626Upgradeable
  function previewMint(uint256 _shares) external view override returns (uint256) {
    return convertToAssets(_shares);
  }

  /// @inheritdoc IERC4626Upgradeable
  function maxWithdraw(address) external pure override returns (uint256) {
    return type(uint256).max;
  }

  /// @inheritdoc IERC4626Upgradeable
  function previewWithdraw(uint256 _assets) external view override returns (uint256) {
    uint256 _totalAssets = totalAssets;
    if (_assets > _totalAssets) revert WithdrawExceedTotalAssets();

    uint256 _shares = convertToShares(_assets);
    if (_assets == _totalAssets) {
      return _shares;
    } else {
      unchecked {
        return (_shares * FEE_PRECISION) / (FEE_PRECISION - getWithdrawFeePercentage());
      }
    }
  }

  /// @inheritdoc IERC4626Upgradeable
  function maxRedeem(address) external pure override returns (uint256) {
    return type(uint256).max;
  }

  /// @inheritdoc IERC4626Upgradeable
  function previewRedeem(uint256 _shares) external view override returns (uint256) {
    uint256 _totalShares = totalSupply();
    if (_shares > _totalShares) revert RedeemExceedTotalSupply();

    uint256 _assets = convertToAssets(_shares);
    if (_shares == _totalShares) {
      return _assets;
    } else {
      unchecked {
        uint256 _withdrawFee = (_assets * getWithdrawFeePercentage()) / FEE_PRECISION;
        return _assets - _withdrawFee;
      }
    }
  }

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @inheritdoc IERC4626Upgradeable
  ///
  /// @dev If the caller wants to deposit all held tokens, use `_assets=type(uint256).max`.
  function deposit(uint256 _assets, address _receiver) external override nonReentrant returns (uint256) {
    _distributePendingReward();

    address _owner = _msgSender();
    if (_assets == type(uint256).max) {
      _assets = IERC20Upgradeable(_getAsset()).balanceOf(_owner);
    }

    return _deposit(_assets, _receiver, _owner);
  }

  /// @inheritdoc IERC4626Upgradeable
  function mint(uint256 _shares, address _receiver) external override nonReentrant returns (uint256) {
    _distributePendingReward();

    uint256 _assets = convertToAssets(_shares);

    _deposit(_assets, _receiver, _msgSender());
    return _assets;
  }

  /// @inheritdoc IERC4626Upgradeable
  ///
  /// @dev If the caller wants to withdraw all held shares, use `_assets=type(uint256).max`.
  function withdraw(
    uint256 _assets,
    address _receiver,
    address _owner
  ) external override nonReentrant returns (uint256) {
    _distributePendingReward();

    if (_assets == type(uint256).max) {
      _assets = convertToAssets(balanceOf(_owner));
    }

    uint256 _totalAssets = totalAssets;
    if (_assets > _totalAssets) revert WithdrawExceedTotalAssets();

    uint256 _shares = convertToShares(_assets);
    if (_assets < _totalAssets) {
      uint256 _withdrawPercentage = getFeeRate(WITHDRAWAL_FEE_TYPE, _owner);
      unchecked {
        _shares = (_shares * FEE_PRECISION) / (FEE_PRECISION - _withdrawPercentage);
      }
    }

    address _caller = _msgSender();
    if (_caller != _owner) {
      _spendAllowance(_owner, _caller, _shares);
    }

    _withdraw(_shares, _receiver, _owner);
    return _shares;
  }

  /// @inheritdoc IERC4626Upgradeable
  ///
  /// @dev If the caller wants to withdraw all held shares, use `_shares=type(uint256).max`.
  function redeem(
    uint256 _shares,
    address _receiver,
    address _owner
  ) external override nonReentrant returns (uint256) {
    _distributePendingReward();

    if (_shares == type(uint256).max) {
      _shares = balanceOf(_owner);
    }

    address _caller = _msgSender();
    if (_caller != _owner) {
      _spendAllowance(_owner, _caller, _shares);
    }

    return _withdraw(_shares, _receiver, _owner);
  }

  /// @inheritdoc IConcentratorCompounder
  function checkpoint() external nonReentrant {
    _distributePendingReward();
  }

  /// @inheritdoc IConcentratorCompounder
  function harvest(address _receiver, uint256 _minAssets)
    external
    override
    nonReentrant
    onlyHarvester
    returns (uint256 _assets)
  {
    _distributePendingReward();

    _assets = IConcentratorStrategy(strategy).harvest(converter, _getIntermediateToken());
    if (_assets < _minAssets) revert InsufficientHarvestedAssets();

    uint256 _totalAssets = totalAssets;
    uint256 _totalShares = totalSupply();

    // @note The shares minted to treasury and harvester will be a little more than the actual percentage,
    // since we are doing the minting before the rewards distribution. But it is ok with us.
    uint256 _performanceFee;
    uint256 _expenseRatio = getExpenseRatio();
    if (_expenseRatio > 0) {
      _performanceFee = (_assets * _expenseRatio) / FEE_PRECISION;
      _mint(treasury, (_performanceFee * _totalShares) / _totalAssets);
    }

    uint256 _harvesterBounty;
    uint256 _harvesterRatio = getHarvesterRatio();
    if (_harvesterRatio > 0) {
      _harvesterBounty = (_assets * _harvesterRatio) / FEE_PRECISION;
      _mint(_receiver, (_harvesterBounty * _totalShares) / _totalAssets);
    }

    emit Harvest(_msgSender(), _receiver, _assets, _performanceFee, _harvesterBounty);

    unchecked {
      _notifyReward(_assets - _performanceFee - _harvesterBounty);
    }
  }

  /************************
   * Restricted Functions *
   ************************/

  /// @inheritdoc IConcentratorCompounder
  function migrateStrategy(address _newStrategy) external onlyRole(DEFAULT_ADMIN_ROLE) {
    if (_newStrategy == address(0)) revert StrategyIsZero();

    // This is the actual assets deposited into strategy.
    (uint256 _distributable, uint256 _undistributed) = pendingRewards();
    uint256 _totalAssets = totalAssets + _distributable + _undistributed;

    address _oldStrategy = strategy;
    strategy = _newStrategy;

    IConcentratorStrategy(_oldStrategy).prepareMigrate(_newStrategy);
    IConcentratorStrategy(_oldStrategy).withdraw(_newStrategy, _totalAssets);
    IConcentratorStrategy(_oldStrategy).finishMigrate(_newStrategy);

    IConcentratorStrategy(_newStrategy).deposit(address(this), _totalAssets);

    emit Migrate(_oldStrategy, _newStrategy);
  }

  /**********************
   * Internal Functions *
   **********************/

  /// @inheritdoc CustomFeeRate
  function _defaultFeeRate(uint256 _feeType) internal view virtual override returns (uint32) {
    if (_feeType == WITHDRAWAL_FEE_TYPE) return uint32(getWithdrawFeePercentage());
    else return CustomFeeRate._defaultFeeRate(_feeType);
  }

  /// @inheritdoc LinearRewardDistributor
  /// @dev This function will deposit the underlying assets to strategy to generate yields.
  /// It will also make sure no underlying assets are left in this contract.
  function _afterRewardDeposit(uint256 _amount) internal virtual override {
    if (_amount > 0) {
      address _strategy = strategy;
      IERC20Upgradeable(_getAsset()).safeTransfer(strategy, _amount);
      IConcentratorStrategy(_strategy).deposit(address(this), _amount);
    }
  }

  /// @inheritdoc LinearRewardDistributor
  function _accumulateReward(uint256 _amount) internal virtual override {
    if (_amount > 0) {
      unchecked {
        totalAssets += _amount;
      }
    }
  }

  /// @dev Internal function to mint pool share for someone.
  ///
  /// The caller should make sure `_distributePendingReward` is called before.
  ///
  /// @param _receiver The address of account who will receive the pool share.
  /// @param _assets The amount of assets used to mint new shares.
  /// @return _shares the amount of pool shares to be received.
  function _mintShare(address _receiver, uint256 _assets) internal returns (uint256 _shares) {
    uint256 _totalAssets = totalAssets;
    uint256 _totalShares = totalSupply();

    if (_totalAssets == 0) {
      _shares = _assets;
    } else {
      _shares = (_assets * _totalShares) / _totalAssets;
    }

    _mint(_receiver, _shares);

    unchecked {
      totalAssets = _totalAssets + _assets;
    }
  }

  /// @dev Internal function to burn pool share.
  ///
  /// The caller should make sure `_distributePendingReward` is called before.
  ///
  /// @param _owner The address of user to withdraw from.
  /// @param _shares The amount of pool share to burn.
  /// @return _assets The amount of underlying assets to be received.
  function _burnShare(address _owner, uint256 _shares) internal returns (uint256 _assets) {
    uint256 _totalAssets = totalAssets;
    uint256 _totalShares = totalSupply();

    _burn(_owner, _shares);

    _assets = (_shares * _totalAssets) / _totalShares;
    if (_totalShares != _shares) {
      // take withdraw fee if it is not the last user.
      uint256 _withdrawPercentage = getFeeRate(WITHDRAWAL_FEE_TYPE, _owner);
      unchecked {
        uint256 _withdrawFee = (_assets * _withdrawPercentage) / FEE_PRECISION;
        _assets = _assets - _withdrawFee;
      }
    } else {
      // @note If it is the last user, some extra rewards still pending.
      // We just ignore it for now.
    }

    unchecked {
      // it should never overflow
      totalAssets = _totalAssets - _assets;
    }
  }

  /// @dev Internal function to deposit assets and transfer to `_receiver`.
  ///
  /// - If the address of `_owner` is zero, we assume the assets are already
  ///   transfered to strategy and deposited.
  /// - If the address of `_owner` is `strategy`, we assume the assets are
  ///   already transfered to strategy and but not deposited.
  ///
  /// @param _assets The amount of asset to deposit.
  /// @param _receiver The address of account who will receive the pool share.
  /// @param _owner The address of user who provides the assets.
  /// @return _shares The amount of pool shares to be received.
  function _deposit(
    uint256 _assets,
    address _receiver,
    address _owner
  ) internal virtual returns (uint256 _shares) {
    if (_owner != address(0)) {
      address _strategy = strategy;
      if (_owner == address(this)) {
        // It is cheaper use `transfer` when `_owner` is `address(this)`.
        IERC20Upgradeable(_getAsset()).safeTransfer(_strategy, _assets);
      } else if (_owner != _strategy) {
        IERC20Upgradeable(_getAsset()).safeTransferFrom(_owner, _strategy, _assets);
      }
      IConcentratorStrategy(_strategy).deposit(_receiver, _assets);
    }

    _shares = _mintShare(_receiver, _assets);

    emit Deposit(_msgSender(), _receiver, _assets, _shares);
  }

  /// @dev Internal function to withdraw assets from `_owner` and transfer to `_receiver`.
  /// @param _shares The amount of pool share to burn.
  /// @param _receiver The address of account who will receive the assets.
  /// @param _owner The address of user to withdraw from.
  /// @return _assets The amount of underlying assets to be received.
  function _withdraw(
    uint256 _shares,
    address _receiver,
    address _owner
  ) internal virtual returns (uint256 _assets) {
    _assets = _burnShare(_owner, _shares);

    IConcentratorStrategy(strategy).withdraw(_receiver, _assets);

    emit Withdraw(_msgSender(), _receiver, _owner, _assets, _shares);
  }

  /// @dev return the underlying asset token.
  function _getAsset() internal view virtual returns (address);

  /// @dev return the intermediate token. It is used for underlying strategy contract.
  function _getIntermediateToken() internal view virtual returns (address);
}
