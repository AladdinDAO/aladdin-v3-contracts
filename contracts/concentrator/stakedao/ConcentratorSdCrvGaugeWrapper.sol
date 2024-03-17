// SPDX-License-Identifier: MIT

pragma solidity =0.8.20;

import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable-v4/token/ERC20/IERC20Upgradeable.sol";
import { SafeERC20Upgradeable } from "@openzeppelin/contracts-upgradeable-v4/token/ERC20/utils/SafeERC20Upgradeable.sol";
import { EnumerableSetUpgradeable } from "@openzeppelin/contracts-upgradeable-v4/utils/structs/EnumerableSetUpgradeable.sol";

import { IConcentratorSdCrvGaugeWrapper } from "../../interfaces/concentrator/IConcentratorSdCrvGaugeWrapper.sol";
import { IConcentratorStakeDAOLocker } from "../../interfaces/concentrator/IConcentratorStakeDAOLocker.sol";
import { ISdCRVLocker } from "../../interfaces/concentrator/ISdCRVLocker.sol";
import { IStakeDAOCRVDepositor } from "../../interfaces/stakedao/IStakeDAOCRVDepositor.sol";
import { ICurveFactoryPlainPool } from "../../interfaces/ICurveFactoryPlainPool.sol";

import { LinearMultipleRewardDistributor } from "../../common/rewards/distributor/LinearMultipleRewardDistributor.sol";
import { ConcentratorStakeDAOGaugeWrapper } from "./ConcentratorStakeDAOGaugeWrapper.sol";

contract ConcentratorSdCrvGaugeWrapper is ConcentratorStakeDAOGaugeWrapper, IConcentratorSdCrvGaugeWrapper {
  using EnumerableSetUpgradeable for EnumerableSetUpgradeable.AddressSet;
  using SafeERC20Upgradeable for IERC20Upgradeable;

  /*************
   * Constants *
   *************/

  /// @dev The address of CRV Token.
  address private constant CRV = 0xD533a949740bb3306d119CC777fa900bA034cd52;

  /// @dev The address of legacy sdveCRV Token.
  address private constant SD_VE_CRV = 0x478bBC744811eE8310B461514BDc29D03739084D;

  /// @dev The address of StakeDAO CRV Depositor contract.
  address private constant DEPOSITOR = 0x88C88Aa6a9cedc2aff9b4cA6820292F39cc64026;

  /// @dev The address of Curve CRV/sdCRV factory plain pool.
  address private constant CURVE_POOL = 0xCA0253A98D16e9C1e3614caFDA19318EE69772D0;

  /***************
   * Constructor *
   ***************/

  constructor(
    address _gauge,
    address _locker,
    address _delegation
  ) LinearMultipleRewardDistributor(7 days) ConcentratorStakeDAOGaugeWrapper(_gauge, _locker, _delegation) {}

  /// @param _treasury The address of treasury contract for holding platform revenue.
  /// @param _burner The address of bribe burner contract.
  function initialize(address _treasury, address _burner) external initializer {
    __Context_init(); // from ContextUpgradeable
    __ERC165_init(); // from ERC165Upgradeable
    __AccessControl_init(); // from AccessControlUpgradeable
    __ReentrancyGuard_init(); // from ReentrancyGuardUpgradeable

    __ConcentratorBaseV2_init(_treasury, address(0), _burner); // from ConcentratorBaseV2
    __LinearMultipleRewardDistributor_init(); // from LinearMultipleRewardDistributor
    __MultipleRewardAccumulator_init(); // from MultipleRewardAccumulator
    __ConcentratorStakeDAOGaugeWrapper_init(); // from ConcentratorStakeDAOGaugeWrapper

    if (activeRewardTokens.add(stakingToken)) {
      emit RegisterRewardToken(stakingToken, address(this));
    }

    // sync state from old vault
    address legacyVault = 0x2b3e72f568F96d7209E20C8B8f4F2A363ee1E3F6;
    address asdCRV = 0x43E54C2E7b3e294De3A155785F52AB49d87B9922;
    balanceOf[asdCRV] = IERC20Upgradeable(legacyVault).balanceOf(asdCRV);
    totalSupply = IERC20Upgradeable(legacyVault).totalSupply();
    ISdCRVLocker.LockedBalance[] memory _locks = ISdCRVLocker(legacyVault).getUserLocks(asdCRV);
    uint256 _totalLocked;
    for (uint256 i = 0; i < _locks.length; i++) {
      _totalLocked += _locks[i].amount;
    }
    IConcentratorStakeDAOLocker(locker).withdraw(gauge, stakingToken, _totalLocked, asdCRV);

    // grant role
    _grantRole(DEFAULT_ADMIN_ROLE, _msgSender());
  }

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @inheritdoc IConcentratorSdCrvGaugeWrapper
  function depositWithCRV(
    uint256 _amount,
    address _receiver,
    uint256 _minOut
  ) external override nonReentrant returns (uint256 _amountOut) {
    address _owner = _msgSender();
    if (_amount == type(uint256).max) {
      _amount = IERC20Upgradeable(CRV).balanceOf(_owner);
    }
    if (_amount == 0) revert ErrorDepositZeroAssets();

    IERC20Upgradeable(CRV).safeTransferFrom(_owner, address(this), _amount);

    // swap CRV to sdCRV
    uint256 _lockReturn = _amount + IStakeDAOCRVDepositor(DEPOSITOR).incentiveToken();
    uint256 _swapReturn = ICurveFactoryPlainPool(CURVE_POOL).get_dy(0, 1, _amount);
    if (_lockReturn >= _swapReturn) {
      IERC20Upgradeable(CRV).safeApprove(DEPOSITOR, 0);
      IERC20Upgradeable(CRV).safeApprove(DEPOSITOR, _amount);
      IStakeDAOCRVDepositor(DEPOSITOR).deposit(_amount, true, false, locker);
      _amountOut = _lockReturn;
    } else {
      IERC20Upgradeable(CRV).safeApprove(CURVE_POOL, 0);
      IERC20Upgradeable(CRV).safeApprove(CURVE_POOL, _amount);
      _amountOut = ICurveFactoryPlainPool(CURVE_POOL).exchange(0, 1, _amount, 0, locker);
    }
    if (_amountOut < _minOut) revert ErrorInsufficientAmountOut();

    _deposit(_amountOut, _owner, _receiver);
  }

  /// @inheritdoc IConcentratorSdCrvGaugeWrapper
  function depositWithSdVeCRV(uint256 _amount, address _receiver) external override nonReentrant {
    address _owner = _msgSender();
    if (_amount == type(uint256).max) {
      _amount = IERC20Upgradeable(SD_VE_CRV).balanceOf(_owner);
    }
    IERC20Upgradeable(SD_VE_CRV).safeTransferFrom(_owner, address(this), _amount);

    // lock to sdCRV
    IERC20Upgradeable(SD_VE_CRV).safeApprove(DEPOSITOR, 0);
    IERC20Upgradeable(SD_VE_CRV).safeApprove(DEPOSITOR, _amount);
    IStakeDAOCRVDepositor(DEPOSITOR).lockSdveCrvToSdCrv(_amount);

    // transfer to locker
    IERC20Upgradeable(stakingToken).safeTransfer(locker, _amount);

    // deposit
    _deposit(_amount, _owner, _receiver);
  }
}
