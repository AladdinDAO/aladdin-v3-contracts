// SPDX-License-Identifier: MIT

pragma solidity =0.8.20;

import { IERC20 } from "@openzeppelin/contracts-v4/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts-v4/token/ERC20/utils/SafeERC20.sol";

import { IConverterRegistry } from "../../helpers/converter/IConverterRegistry.sol";
import { ITokenConverter } from "../../helpers/converter/ITokenConverter.sol";
import { IConcentratorStrategy } from "../../interfaces/concentrator/IConcentratorStrategy.sol";
import { IConvexFXNDepositor } from "../../interfaces/convex/IConvexFXNDepositor.sol";
import { ICvxFxnStaking } from "../../interfaces/convex/ICvxFxnStaking.sol";
import { ICurveFactoryPlainPool } from "../../interfaces/ICurveFactoryPlainPool.sol";

import { ConcentratorStrategyBaseV2 } from "../strategies/ConcentratorStrategyBaseV2.sol";

contract CvxFxnStakingStrategy is ConcentratorStrategyBaseV2 {
  using SafeERC20 for IERC20;

  /**********
   * Errors *
   **********/

  /// @dev Thrown when the intermediate token passed is not FXN token.
  error IntermediateNotFXN();

  /*************
   * Constants *
   *************/

  /// @inheritdoc IConcentratorStrategy
  // solhint-disable const-name-snakecase
  string public constant override name = "CvxFxnStaking";

  /// @dev The address of WETH token.
  address private constant WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;

  /// @dev The address of FXN token.
  address private constant FXN = 0x365AccFCa291e7D3914637ABf1F7635dB165Bb09;

  /// @dev The address of cvxFXN token.
  address private constant cvxFXN = 0x183395DbD0B5e93323a7286D1973150697FFFCB3;

  /// @dev The address of Curve FXN/cvxFXN pool.
  address private constant CURVE_POOL = 0x1062FD8eD633c1f080754c19317cb3912810B5e5;

  /// @dev The address of Convex FXN => cvxFXN Contract.
  address private constant FXN_DEPOSITOR = 0x56B3c8eF8A095f8637B6A84942aA898326B82b91;

  /// @notice The address of CvxFxnStaking contract.
  address public constant staker = 0xEC60Cd4a5866fb3B0DD317A46d3B474a24e06beF;

  /***************
   * Constructor *
   ***************/

  constructor(address _operator) initializer {
    address[] memory _rewards = new address[](3);
    _rewards[0] = FXN; // FXN
    _rewards[1] = 0x4e3FBD56CD56c3e72c1403e103b45Db9da5B9D2B; // CVX
    _rewards[2] = 0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0; // wstETH

    __ConcentratorStrategyBase_init(_operator, _rewards);

    // approval
    IERC20(cvxFXN).safeApprove(staker, type(uint256).max);
    IERC20(FXN).safeApprove(FXN_DEPOSITOR, type(uint256).max);
    IERC20(FXN).safeApprove(CURVE_POOL, type(uint256).max);

    // protect token
    isTokenProtected[cvxFXN] = true;
    isTokenProtected[FXN] = true;
    isTokenProtected[0x4e3FBD56CD56c3e72c1403e103b45Db9da5B9D2B] = true; // CVX
    isTokenProtected[0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0] = true; // wstETH
    isTokenProtected[staker] = true;
  }

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @notice Sync reward tokens from CvxFxnStaking contract.
  function syncRewardToken() external {
    delete rewards;

    uint256 _length = ICvxFxnStaking(staker).rewardTokenLength();
    for (uint256 i = 0; i < _length; i++) {
      rewards.push(ICvxFxnStaking(staker).rewardTokens(i));
    }
  }

  /// @inheritdoc IConcentratorStrategy
  function deposit(address, uint256 _amount) external override onlyOperator {
    if (_amount > 0) {
      ICvxFxnStaking(staker).stake(_amount);
    }
  }

  /// @inheritdoc IConcentratorStrategy
  function withdraw(address _recipient, uint256 _amount) external override onlyOperator {
    if (_amount > 0) {
      ICvxFxnStaking(staker).withdraw(_amount);
      IERC20(cvxFXN).safeTransfer(_recipient, _amount);
    }
  }

  /// @inheritdoc IConcentratorStrategy
  function harvest(
    address _converter,
    address /*_intermediate*/
  ) external override onlyOperator returns (uint256 _harvested) {
    // 0. sweep balances
    address[] memory _rewards = rewards;
    _sweepToken(_rewards);

    // 1. claim rewards from staking contract.
    ICvxFxnStaking(staker).getReward(address(this));
    uint256[] memory _amounts = new uint256[](rewards.length);
    for (uint256 i = 0; i < rewards.length; i++) {
      _amounts[i] = IERC20(_rewards[i]).balanceOf(address(this));
    }

    address _registry = ITokenConverter(_converter).registry();
    // 2. convert all rewards (except FNX and cvxFXN) to WETH
    uint256 _amountFXN;
    uint256 _amountWETH;
    for (uint256 i = 0; i < rewards.length; i++) {
      address _rewardToken = _rewards[i];
      uint256 _amount = _amounts[i];
      if (_rewardToken == FXN) {
        _amountFXN += _amount;
      } else if (_rewardToken == cvxFXN) {
        _harvested += _amount;
      } else if (_amount > 0) {
        _transferToken(_rewardToken, _converter, _amount);
        _amountWETH += _convert(
          _converter,
          _amount,
          IConverterRegistry(_registry).getRoutes(_rewardToken, WETH),
          address(this)
        );
      }
    }

    // 3. convert all WETH to FXN
    if (_amountWETH > 0) {
      _transferToken(WETH, _converter, _amountWETH);
      _amountFXN += _convert(
        _converter,
        _amountWETH,
        IConverterRegistry(_registry).getRoutes(WETH, FXN),
        address(this)
      );
    }

    // 4. swap FXN to cvxFXN
    if (_amountFXN > 0) {
      _harvested += _swapFxnToCvxFxn(_amountFXN, address(this));
    }

    // 5. deposit
    if (_harvested > 0) {
      ICvxFxnStaking(staker).stake(_harvested);
    }

    return _harvested;
  }

  /**********************
   * Internal Functions *
   **********************/

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
        IERC20(cvxFXN).safeTransfer(_receiver, _amountIn);
      }
      _amountOut = _amountIn;
    }
  }
}
