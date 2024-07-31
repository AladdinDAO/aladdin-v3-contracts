// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import { IERC4626Upgradeable } from "@openzeppelin/contracts-upgradeable-v4/interfaces/IERC4626Upgradeable.sol";
import { SafeERC20Upgradeable } from "@openzeppelin/contracts-upgradeable-v4/token/ERC20/utils/SafeERC20Upgradeable.sol";
import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable-v4/token/ERC20/IERC20Upgradeable.sol";

import { LinearRewardDistributor } from "../../common/rewards/distributor/LinearRewardDistributor.sol";
import { ConcentratorCompounderBase } from "../ConcentratorCompounderBase.sol";

import { ICvxFxnCompounder } from "../../interfaces/concentrator/ICvxFxnCompounder.sol";
import { IConvexFXNDepositor } from "../../interfaces/convex/IConvexFXNDepositor.sol";
import { ICurveFactoryPlainPool } from "../../interfaces/ICurveFactoryPlainPool.sol";

// solhint-disable const-name-snakecase
// solhint-disable no-empty-blocks

contract CvxFxnCompounder is ConcentratorCompounderBase, ICvxFxnCompounder {
  using SafeERC20Upgradeable for IERC20Upgradeable;

  /*************
   * Constants *
   *************/

  /// @dev The address of FXN token.
  address private constant FXN = 0x365AccFCa291e7D3914637ABf1F7635dB165Bb09;

  /// @dev The address of cvxFXN token.
  address private constant cvxFXN = 0x183395DbD0B5e93323a7286D1973150697FFFCB3;

  /// @dev The address of stkCvxFxn token.
  address private constant stkCvxFxn = 0xEC60Cd4a5866fb3B0DD317A46d3B474a24e06beF;

  /// @dev The address of Curve FXN/cvxFXN pool.
  address private constant CURVE_POOL = 0x1062FD8eD633c1f080754c19317cb3912810B5e5;

  /// @dev The address of Convex's FXN => cvxFXN depositor Contract.
  address private constant FXN_DEPOSITOR = 0x56B3c8eF8A095f8637B6A84942aA898326B82b91;

  /***************
   * Constructor *
   ***************/

  constructor(uint40 _periodLength) LinearRewardDistributor(_periodLength) {}

  function initialize(
    string memory _name,
    string memory _symbol,
    address _treasury,
    address _harvester,
    address _converter,
    address _strategy
  ) external initializer {
    __Context_init(); // from ContextUpgradeable
    __ERC165_init(); // from ERC165Upgradeable
    __AccessControl_init(); // from AccessControlUpgradeable
    __ReentrancyGuard_init(); // from ReentrancyGuardUpgradeable
    __ERC20_init(_name, _symbol); // from ERC20Upgradeable
    __ERC20Permit_init(_name); // from ERC20PermitUpgradeable

    __ConcentratorBaseV2_init(_treasury, _harvester, _converter); // from ConcentratorBaseV2
    __LinearRewardDistributor_init(cvxFXN); // from LinearRewardDistributor
    __ConcentratorCompounderBase_init(_strategy); // from ConcentratorCompounderBase

    // access control
    _grantRole(DEFAULT_ADMIN_ROLE, _msgSender());

    // approval
    IERC20Upgradeable(FXN).safeApprove(FXN_DEPOSITOR, type(uint256).max);
    IERC20Upgradeable(FXN).safeApprove(CURVE_POOL, type(uint256).max);
  }

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @inheritdoc ICvxFxnCompounder
  ///
  /// @dev If the caller wants to deposit all held tokens, use `_assets=type(uint256).max`.
  function depositWithStkCvxFxn(uint256 _assets, address _receiver)
    external
    override
    nonReentrant
    returns (uint256 _shares)
  {
    _distributePendingReward();

    address _sender = _msgSender();
    if (_assets == type(uint256).max) {
      _assets = IERC20Upgradeable(stkCvxFxn).balanceOf(_sender);
    }
    IERC20Upgradeable(stkCvxFxn).safeTransferFrom(_sender, strategy, _assets);

    _shares = _deposit(_assets, _receiver, address(0));
  }

  /// @inheritdoc ICvxFxnCompounder
  ///
  /// @dev If the caller wants to deposit all held tokens, use `_assets=type(uint256).max`.
  function depositWithFXN(
    uint256 _assets,
    address _receiver,
    uint256 _minShares
  ) external override nonReentrant returns (uint256 _shares) {
    _distributePendingReward();

    address _sender = _msgSender();
    if (_assets == type(uint256).max) {
      _assets = IERC20Upgradeable(FXN).balanceOf(_sender);
    }
    IERC20Upgradeable(FXN).safeTransferFrom(_sender, address(this), _assets);

    address _strategy = strategy;
    _assets = _swapFxnToCvxFxn(_assets, _strategy);

    _shares = _deposit(_assets, _receiver, _strategy);
    if (_shares < _minShares) revert InsufficientShares();
  }

  /**********************
   * Internal Functions *
   **********************/

  /// @inheritdoc ConcentratorCompounderBase
  function _getAsset() internal view virtual override returns (address) {
    return cvxFXN;
  }

  /// @inheritdoc ConcentratorCompounderBase
  function _getIntermediateToken() internal view virtual override returns (address) {
    return FXN;
  }

  /// @dev Internal function to swap FXN to cvxFXN
  ///
  /// @param _amountIn The amount of FXN to swap.
  /// @param _receiver The address of recipient who will recieve the cvxFXN.
  /// @return _amountOut The amount of cvxFXN received.
  function _swapFxnToCvxFxn(uint256 _amountIn, address _receiver) internal returns (uint256 _amountOut) {
    // CRV swap to cvxFXN or stake to cvxFXN
    _amountOut = ICurveFactoryPlainPool(CURVE_POOL).get_dy(0, 1, _amountIn);
    bool useCurve = _amountOut > _amountIn;

    if (useCurve) {
      _amountOut = ICurveFactoryPlainPool(CURVE_POOL).exchange(0, 1, _amountIn, 0, _receiver);
    } else {
      // no lock incentive, we don't explicit lock to save gas.
      IConvexFXNDepositor(FXN_DEPOSITOR).deposit(_amountIn, false);
      if (_receiver != address(this)) {
        IERC20Upgradeable(cvxFXN).safeTransfer(_receiver, _amountIn);
      }
      _amountOut = _amountIn;
    }
  }
}
