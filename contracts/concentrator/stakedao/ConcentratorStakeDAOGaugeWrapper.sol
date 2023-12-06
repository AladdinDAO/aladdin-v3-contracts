// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable-v4/security/ReentrancyGuardUpgradeable.sol";
import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable-v4/token/ERC20/IERC20Upgradeable.sol";
import { SafeERC20Upgradeable } from "@openzeppelin/contracts-upgradeable-v4/token/ERC20/utils/SafeERC20Upgradeable.sol";
import { EnumerableSetUpgradeable } from "@openzeppelin/contracts-upgradeable-v4/utils/structs/EnumerableSetUpgradeable.sol";

import { IConcentratorStakeDAOGaugeWrapper } from "../../interfaces/concentrator/IConcentratorStakeDAOGaugeWrapper.sol";
import { IConcentratorStakeDAOLocker } from "../../interfaces/concentrator/IConcentratorStakeDAOLocker.sol";
import { ICurveGauge } from "../../interfaces/ICurveGauge.sol";
import { IMultiMerkleStash } from "../../interfaces/IMultiMerkleStash.sol";

import { WordCodec } from "../../common/codec/WordCodec.sol";
import { MultipleRewardAccumulator } from "../../common/rewards/accumulator/MultipleRewardAccumulator.sol";
import { ConcentratorBaseV2 } from "../ConcentratorBaseV2.sol";

import { StakeDAOGaugeWrapperStash } from "../stash/StakeDAOGaugeWrapperStash.sol";

// solhint-disable func-name-mixedcase

abstract contract ConcentratorStakeDAOGaugeWrapper is
  ReentrancyGuardUpgradeable,
  ConcentratorBaseV2,
  MultipleRewardAccumulator,
  IConcentratorStakeDAOGaugeWrapper
{
  using EnumerableSetUpgradeable for EnumerableSetUpgradeable.AddressSet;
  using SafeERC20Upgradeable for IERC20Upgradeable;

  using WordCodec for bytes32;

  /*************
   * Constants *
   *************/

  /// @dev The maximum booster ratio.
  uint256 private constant MAX_BOOSTER_RATIO = 2e8; // 20%

  /// @dev The offset of booster ratio in `_miscData`.
  uint256 private constant BOOSTER_RATIO_OFFSET = 90;

  /// @dev The address of Stake DAO: SDT Token.
  address internal constant SDT = 0x73968b9a57c6E53d41345FD57a6E6ae27d6CDB2F;

  /// @inheritdoc IConcentratorStakeDAOGaugeWrapper
  address public immutable override gauge;

  /// @inheritdoc IConcentratorStakeDAOGaugeWrapper
  address public immutable override stakingToken;

  /// @notice The address of StakeDaoLockerProxy contract.
  address public immutable locker;

  /// @notice The address of VeSDTDelegation contract.
  address public immutable delegation;

  /*************
   * Variables *
   *************/

  /// @inheritdoc IConcentratorStakeDAOGaugeWrapper
  uint256 public override totalSupply;

  /// @inheritdoc IConcentratorStakeDAOGaugeWrapper
  mapping(address => uint256) public override balanceOf;

  /// @notice The address of stash contract.
  address public stash;

  /// @dev reserved slots.
  uint256[47] private __gap;

  /***************
   * Constructor *
   ***************/

  constructor(
    address _gauge,
    address _locker,
    address _delegation
  ) {
    gauge = _gauge;
    stakingToken = ICurveGauge(_gauge).staking_token();
    locker = _locker;
    delegation = _delegation;
  }

  function __ConcentratorStakeDAOGaugeWrapper_init() internal onlyInitializing {
    syncActiveRewardTokens();

    stash = address(new StakeDAOGaugeWrapperStash(address(this)));
  }

  /*************************
   * Public View Functions *
   *************************/

  /// @inheritdoc IConcentratorStakeDAOGaugeWrapper
  function getBoosterRatio() public view override returns (uint256) {
    return _miscData.decodeUint(BOOSTER_RATIO_OFFSET, 30);
  }

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @inheritdoc IConcentratorStakeDAOGaugeWrapper
  function deposit(uint256 _amount, address _receiver) external override nonReentrant {
    address _owner = _msgSender();
    if (_amount == type(uint256).max) {
      _amount = IERC20Upgradeable(stakingToken).balanceOf(_owner);
    }
    IERC20Upgradeable(stakingToken).safeTransferFrom(_owner, locker, _amount);

    _deposit(_amount, _owner, _receiver);
  }

  /// @inheritdoc IConcentratorStakeDAOGaugeWrapper
  function depositWithGauge(uint256 _amount, address _receiver) external override nonReentrant {
    address _owner = _msgSender();
    if (_amount == type(uint256).max) {
      _amount = IERC20Upgradeable(gauge).balanceOf(_owner);
    }
    IERC20Upgradeable(gauge).safeTransferFrom(_owner, locker, _amount);

    _deposit(_amount, address(0), _receiver);
  }

  /// @inheritdoc IConcentratorStakeDAOGaugeWrapper
  function withdraw(uint256 _amount, address _receiver) external override nonReentrant {
    address _owner = _msgSender();
    uint256 _balance = balanceOf[_owner];
    if (_amount == type(uint256).max) {
      _amount = _balance;
    }
    if (_amount == 0) revert ErrorWithdrawZeroAssets();
    if (_amount > _balance) revert ErrorInsufficientStakedToken();

    _checkpoint(_owner);

    unchecked {
      balanceOf[_owner] = _balance - _amount;
      totalSupply -= _amount;
    }

    IConcentratorStakeDAOLocker(locker).withdraw(gauge, stakingToken, _amount, _receiver);

    emit Withdraw(_owner, _receiver, _amount);
  }

  /// @inheritdoc IConcentratorStakeDAOGaugeWrapper
  function harvest(address _receiver) external override nonReentrant {
    _checkpoint(address(0));

    address[] memory _tokens = getActiveRewardTokens();
    // claim rewards from locker and stash
    IConcentratorStakeDAOLocker(locker).claimRewards(gauge, new address[](0));
    uint256[] memory _amounts = StakeDAOGaugeWrapperStash(stash).withdrawTokens(_tokens);

    address _treasury = treasury;
    uint256 _expenseRatio = getExpenseRatio();
    uint256 _harvesterRatio = getHarvesterRatio();
    uint256 _boosterRatio = getBoosterRatio();
    for (uint256 i = 0; i < _tokens.length; i++) {
      address _token = _tokens[i];
      uint256 _assets = _amounts[i];
      uint256 _performanceFee;
      uint256 _harvesterBounty;
      uint256 _boosterFee;
      if (_expenseRatio > 0) {
        _performanceFee = (_assets * _expenseRatio) / RATE_PRECISION;
        IERC20Upgradeable(_token).safeTransfer(_treasury, _performanceFee);
      }
      if (_harvesterRatio > 0) {
        _harvesterBounty = (_assets * _harvesterRatio) / RATE_PRECISION;
        IERC20Upgradeable(_token).safeTransfer(_receiver, _harvesterBounty);
      }
      if (_tokens[i] == SDT && _boosterRatio > 0) {
        _boosterFee = (_assets * _boosterRatio) / RATE_PRECISION;
        IERC20Upgradeable(_token).safeTransfer(delegation, _boosterFee);
      }

      emit Harvest(_token, _msgSender(), _receiver, _assets, _performanceFee, _harvesterBounty, _boosterFee);
      unchecked {
        _notifyReward(_token, _assets - _performanceFee - _harvesterBounty - _boosterFee);
      }
    }
  }

  /// @inheritdoc IConcentratorStakeDAOGaugeWrapper
  function harvestBribes(IMultiMerkleStash.claimParam[] memory _claims) external override nonReentrant {
    IConcentratorStakeDAOLocker(locker).claimBribeRewards(_claims, address(this));

    address _treasury = treasury;
    address _burner = converter;
    uint256 _expenseRatio = getExpenseRatio();
    uint256 _boosterRatio = getBoosterRatio();
    for (uint256 i = 0; i < _claims.length; i++) {
      address _token = _claims[i].token;
      uint256 _assets = _claims[i].amount;
      uint256 _performanceFee = (_assets * _expenseRatio) / RATE_PRECISION;
      uint256 _boosterFee = (_assets * _boosterRatio) / RATE_PRECISION;

      // For non-SDT rewards, it will be transfered to BribeBurner contract waiting for burn.
      // For SDT rewards, it will be distributed intermediately.
      if (_token == SDT) {
        if (_performanceFee > 0) {
          IERC20Upgradeable(_token).safeTransfer(_treasury, _performanceFee);
        }
        if (_boosterFee > 0) {
          IERC20Upgradeable(_token).safeTransfer(delegation, _boosterFee);
        }
        _notifyReward(_token, _assets - _performanceFee - _boosterFee);
      } else {
        IERC20Upgradeable(_token).safeTransfer(_burner, _assets);
      }

      emit HarvestBribe(_token, _assets, _performanceFee, _boosterFee);
    }
  }

  /// @notice Helper function to sync active reward tokens from StakeDAO gauge.
  function syncActiveRewardTokens() public {
    uint256 _count = ICurveGauge(gauge).reward_count();
    for (uint256 i = 0; i < _count; i++) {
      address _token = ICurveGauge(gauge).reward_tokens(i);
      bool _added = activeRewardTokens.add(_token);
      if (_added) {
        emit RegisterRewardToken(_token, address(this));

        // it is a new token, check balance and distribute
        uint256 _balance = IERC20Upgradeable(_token).balanceOf(address(this));
        if (_balance > 0) {
          _notifyReward(_token, _balance);
        }
      }
    }
  }

  /************************
   * Restricted Functions *
   ************************/

  /// @notice Update the fee ratio distributed to treasury.
  /// @param _newRatio The new ratio to update, multipled by 1e9.
  function updateBoosterRatio(uint32 _newRatio) external onlyRole(DEFAULT_ADMIN_ROLE) {
    if (uint256(_newRatio) > MAX_BOOSTER_RATIO) {
      revert ErrorBoosterRatioTooLarge();
    }

    bytes32 _data = _miscData;
    uint256 _oldRatio = _miscData.decodeUint(BOOSTER_RATIO_OFFSET, 30);
    _miscData = _data.insertUint(_newRatio, BOOSTER_RATIO_OFFSET, 30);

    emit UpdateBoosterRatio(_oldRatio, _newRatio);
  }

  /**********************
   * Internal Functions *
   **********************/

  /// @dev Internal function to deposit and alloc pool share to depositor.
  /// If `_owner=address(0)` it means the token is already deposited to gauge through locker.
  ///
  /// @param _amount The amount of the token.
  /// @param _owner The owner of the deposited token.
  /// @param _receiver The address of pool share recipient.
  function _deposit(
    uint256 _amount,
    address _owner,
    address _receiver
  ) internal {
    if (_amount == 0) revert ErrorDepositZeroAssets();

    _checkpoint(_receiver);

    if (_owner != address(0)) {
      uint256 _staked = IConcentratorStakeDAOLocker(locker).deposit(gauge, stakingToken);
      if (_staked < _amount) revert ErrorStakedAmountMismatch();
    }

    // normally won't overflow
    unchecked {
      balanceOf[_receiver] += _amount;
      totalSupply += _amount;
    }

    emit Deposit(_msgSender(), _receiver, _amount);
  }

  /// @inheritdoc MultipleRewardAccumulator
  function _getTotalPoolShare() internal view virtual override returns (uint256) {
    return totalSupply;
  }

  /// @inheritdoc MultipleRewardAccumulator
  function _getUserPoolShare(address _account) internal view virtual override returns (uint256) {
    return balanceOf[_account];
  }
}
