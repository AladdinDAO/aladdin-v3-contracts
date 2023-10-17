// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { ERC20PermitUpgradeable } from "@openzeppelin/contracts-upgradeable-v4/token/ERC20/extensions/ERC20PermitUpgradeable.sol";
import { SafeERC20Upgradeable } from "@openzeppelin/contracts-upgradeable-v4/token/ERC20/utils/SafeERC20Upgradeable.sol";
import { ERC20Upgradeable } from "@openzeppelin/contracts-upgradeable-v4/token/ERC20/ERC20Upgradeable.sol";
import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable-v4/token/ERC20/IERC20Upgradeable.sol";

import { WordCodec } from "../../common/codec/WordCodec.sol";
import { CustomFeeRate } from "../../common/fees/CustomFeeRate.sol";
import { RewardAccumulator } from "../../common/rewards/accumulator/RewardAccumulator.sol";
import { ConcentratorBaseV2 } from "../ConcentratorBaseV2.sol";

import { IConcentratorCompounder } from "../../interfaces/concentrator/IConcentratorCompounder.sol";
import { IConcentratorHarvester } from "../../interfaces/concentrator/IConcentratorHarvester.sol";
import { IConcentratorStrategy } from "../../interfaces/concentrator/IConcentratorStrategy.sol";

// solhint-disable func-name-mixedcase
// solhint-disable no-empty-blocks

abstract contract ConcentratorHarvesterBase is
  ERC20PermitUpgradeable,
  ConcentratorBaseV2,
  CustomFeeRate,
  RewardAccumulator,
  IConcentratorHarvester
{
  using SafeERC20Upgradeable for IERC20Upgradeable;
  using WordCodec for bytes32;

  /*************
   * Constants *
   *************/

  /// @dev The fee type for withdrawal.
  uint256 private constant WITHDRAWAL_FEE_TYPE = 0;

  /// @dev The offset of incentive ratio in `_miscData`.
  uint256 private constant INCENTIVE_RATIO_OFFSET = 90;

  /*************
   * Variables *
   *************/

  /// @inheritdoc IConcentratorHarvester
  address public override stakingToken;

  /// @inheritdoc IConcentratorHarvester
  address public override strategy;

  /// @inheritdoc IConcentratorHarvester
  uint256 public override incentive;

  /// @inheritdoc IConcentratorHarvester
  uint256 public override withdrawFeeAccumulated;

  /// @dev reserved slots.
  uint256[46] private __gap;

  /***************
   * Constructor *
   ***************/

  function __ConcentratorHarvesterBase_init(address _stakingToken, address _strategy) internal onlyInitializing {
    stakingToken = _stakingToken;
    strategy = _strategy;
  }

  /*************************
   * Public View Functions *
   *************************/

  /// @inheritdoc IConcentratorHarvester
  function compounder() public view returns (address) {
    return rewardToken;
  }

  /// @inheritdoc IConcentratorHarvester
  function getIncentiveRatio() public view returns (uint256) {
    return _miscData.decodeUint(INCENTIVE_RATIO_OFFSET, 30);
  }

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @inheritdoc IConcentratorHarvester
  ///
  /// @dev If the caller wants to deposit all held tokens, use `_assets=type(uint256).max`.
  function deposit(uint256 _assets) external override {
    deposit(_assets, _msgSender(), true);
  }

  /// @inheritdoc IConcentratorHarvester
  ///
  /// @dev If the caller wants to deposit all held tokens, use `_assets=type(uint256).max`.
  function deposit(uint256 _assets, address receiver) external override {
    deposit(_assets, receiver, true);
  }

  /// @inheritdoc IConcentratorHarvester
  ///
  /// @dev If the caller wants to deposit all held tokens, use `_assets=type(uint256).max`.
  function deposit(
    uint256 _assets,
    address _receiver,
    bool _stake
  ) public override nonReentrant {
    address _stakingToken = stakingToken;
    address _caller = _msgSender();
    if (_assets == type(uint256).max) {
      _assets = IERC20Upgradeable(_stakingToken).balanceOf(_caller);
    }
    if (_assets == 0) revert DepositZeroAssets();

    _checkpoint(_receiver);

    address _strategy = strategy;
    IERC20Upgradeable(_stakingToken).safeTransferFrom(_caller, _strategy, _assets);
    if (_stake) {
      _assets += incentive;
      incentive = 0;
      uint256 _balance = IERC20Upgradeable(_stakingToken).balanceOf(_strategy);
      IConcentratorStrategy(_strategy).deposit(address(this), _balance);
    } else {
      uint256 _incentive = (_assets * getIncentiveRatio()) / FEE_PRECISION;
      if (_incentive > 0) {
        incentive += _incentive;
      }
      unchecked {
        _assets -= _incentive;
      }
    }

    _mint(_receiver, _assets);

    emit Deposit(_caller, _receiver, _assets);
  }

  /// @inheritdoc IConcentratorHarvester
  ///
  /// @dev If the caller wants to withdraw all held shares, use `_assets=type(uint256).max`.
  function withdraw(uint256 _assets) external {
    withdraw(_assets, _msgSender(), _msgSender());
  }

  /// @inheritdoc IConcentratorHarvester
  ///
  /// @dev If the caller wants to withdraw all held shares, use `_assets=type(uint256).max`.
  function withdraw(uint256 _assets, address _receiver) external {
    withdraw(_assets, _receiver, _msgSender());
  }

  /// @inheritdoc IConcentratorHarvester
  ///
  /// @dev If the caller wants to withdraw all held shares, use `_assets=type(uint256).max`.
  function withdraw(
    uint256 _assets,
    address _receiver,
    address _owner
  ) public nonReentrant {
    if (_assets == type(uint256).max) {
      _assets = balanceOf(_owner);
    }
    if (_assets == 0) revert WithdrawZeroAssets();

    address _caller = _msgSender();
    if (_caller != _owner) {
      _spendAllowance(_owner, _caller, _assets);
    }

    _checkpoint(_owner);

    _burn(_owner, _assets);

    uint256 _fee = (_assets * getFeeRate(WITHDRAWAL_FEE_TYPE, _owner)) / FEE_PRECISION;
    if (_fee > 0) {
      withdrawFeeAccumulated += _fee;
    }

    unchecked {
      IConcentratorStrategy(strategy).withdraw(_receiver, _assets - _fee);
    }

    emit Withdraw(_caller, _receiver, _owner, _assets, _fee);
  }

  /// @inheritdoc IConcentratorHarvester
  function harvest(address _receiver, uint256 _minAssets) external nonReentrant returns (uint256 _assets) {
    _checkpoint(address(0));

    // harvest to intermediate token
    uint256 _imAmount = IConcentratorStrategy(strategy).harvest(converter, _getIntermediateToken());

    // convert to compounder token
    _assets = _convertToCompounder(_imAmount);
    if (_assets < _minAssets) revert InsufficientHarvestedAssets();

    // distribute performance fee and harvester bounty
    address _compounder = compounder();
    uint256 _performanceFee;
    uint256 _expenseRatio = getExpenseRatio();
    if (_expenseRatio > 0) {
      _performanceFee = (_assets * _expenseRatio) / FEE_PRECISION;
      IERC20Upgradeable(_compounder).safeTransfer(treasury, _performanceFee);
    }

    uint256 _harvesterBounty;
    uint256 _harvesterRatio = getHarvesterRatio();
    if (_harvesterRatio > 0) {
      _harvesterBounty = (_assets * _harvesterRatio) / FEE_PRECISION;
      IERC20Upgradeable(_compounder).safeTransfer(_receiver, _harvesterBounty);
    }

    emit Harvest(_msgSender(), _receiver, _assets, _performanceFee, _harvesterBounty);

    // notify rewards
    unchecked {
      _notifyReward(_assets - _performanceFee - _harvesterBounty);
    }
  }

  /************************
   * Restricted Functions *
   ************************/

  /// @inheritdoc IConcentratorHarvester
  function migrateStrategy(address _newStrategy) external onlyRole(DEFAULT_ADMIN_ROLE) {
    if (_newStrategy == address(0)) revert StrategyIsZero();

    uint256 _totalAssets = totalSupply();
    address _oldStrategy = strategy;
    strategy = _newStrategy;

    IConcentratorStrategy(_oldStrategy).prepareMigrate(_newStrategy);
    IConcentratorStrategy(_oldStrategy).withdraw(_newStrategy, _totalAssets);
    IConcentratorStrategy(_oldStrategy).finishMigrate(_newStrategy);

    IConcentratorStrategy(_newStrategy).deposit(address(this), _totalAssets);

    emit Migrate(_oldStrategy, _newStrategy);
  }

  /// @notice Withdraw and reset all pending withdraw fee from the contract.
  ///
  /// @param _receiver The address of recipient who will receive the withdraw fee.
  function takeWithdrawFee(address _receiver) external onlyRole(DEFAULT_ADMIN_ROLE) {
    uint256 _amount = withdrawFeeAccumulated;
    if (_amount > 0) {
      IConcentratorStrategy(strategy).withdraw(_receiver, _amount);
      withdrawFeeAccumulated = 0;

      emit TakeWithdrawFee(_msgSender(), _receiver, _amount);
    }
  }

  /**********************
   * Internal Functions *
   **********************/

  /// @inheritdoc ERC20Upgradeable
  function _beforeTokenTransfer(
    address from,
    address to,
    uint256
  ) internal virtual override {
    if (from == address(0) || to == address(0)) return;

    // check reentrancy on transfer or transferFrom
    require(!_reentrancyGuardEntered(), "ReentrancyGuard: reentrant call");

    _checkpoint(from);
    _checkpoint(to);
  }

  /// @inheritdoc CustomFeeRate
  function _defaultFeeRate(uint256 _feeType) internal view virtual override returns (uint32) {
    if (_feeType == WITHDRAWAL_FEE_TYPE) return uint32(getWithdrawFeePercentage());
    else return CustomFeeRate._defaultFeeRate(_feeType);
  }

  /// @inheritdoc RewardAccumulator
  function _getTotalPoolShare() internal view virtual override returns (uint256) {
    return totalSupply();
  }

  /// @inheritdoc RewardAccumulator
  function _getUserPoolShare(address _account) internal view virtual override returns (uint256) {
    return balanceOf(_account);
  }

  /// @dev Internal function to convert intermediate token to compounder token.
  ///
  /// @param _imAmount The amount of intermediate token.
  function _convertToCompounder(uint256 _imAmount) internal virtual returns (uint256) {
    return IConcentratorCompounder(compounder()).deposit(_imAmount, address(this));
  }

  /// @dev return the intermediate token. It is used for underlying strategy contract.
  function _getIntermediateToken() internal view virtual returns (address) {
    return IConcentratorCompounder(compounder()).asset();
  }
}
