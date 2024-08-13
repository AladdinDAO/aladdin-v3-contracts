// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import { IERC20 } from "@openzeppelin/contracts-v4/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts-v4/token/ERC20/utils/SafeERC20.sol";

import { IConverterRegistry } from "../../../helpers/converter/IConverterRegistry.sol";
import { ITokenConverter } from "../../../helpers/converter/ITokenConverter.sol";
import { IConcentratorStakeDAOLocker } from "../../../interfaces/concentrator/IConcentratorStakeDAOLocker.sol";
import { IConcentratorStrategy } from "../../../interfaces/concentrator/IConcentratorStrategy.sol";
import { ICurveGauge } from "../../../interfaces/ICurveGauge.sol";

import { StakeDAOGaugeWrapperStash } from "../../stash/StakeDAOGaugeWrapperStash.sol";
import { ConcentratorStrategyBaseV2 } from "../../strategies/ConcentratorStrategyBaseV2.sol";
import { SdPendleHelper } from "./SdPendleHelper.sol";

contract SdPendleGaugeStrategy is ConcentratorStrategyBaseV2 {
  using SafeERC20 for IERC20;

  /**********
   * Errors *
   **********/

  /// @dev Thrown when the intermediate token passed is not PENDLE token.
  error ErrorIntermediateNotPENDLE();

  /*************
   * Constants *
   *************/

  /// @inheritdoc IConcentratorStrategy
  // solhint-disable const-name-snakecase
  string public constant override name = "SdPendleGauge";

  /// @dev The address of Stake DAO: SDT Token.
  address private constant SDT = 0x73968b9a57c6E53d41345FD57a6E6ae27d6CDB2F;

  /// @dev The address of WETH token.
  address private constant WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;

  /***************
   * Constructor *
   ***************/

  constructor(address _operator) initializer {
    address[] memory cachedRewards = new address[](3);
    cachedRewards[0] = SDT; // SDT
    cachedRewards[1] = WETH; // WETH
    cachedRewards[2] = SdPendleHelper.PENDLE; // PENDLE

    __ConcentratorStrategyBase_init(_operator, cachedRewards);

    // approval
    IERC20(SdPendleHelper.PENDLE).safeApprove(SdPendleHelper.DEPOSITOR, type(uint256).max);
    IERC20(SdPendleHelper.PENDLE).safeApprove(SdPendleHelper.CURVE_POOL, type(uint256).max);

    // protect token
    isTokenProtected[SDT] = true;
    isTokenProtected[WETH] = true;
    isTokenProtected[SdPendleHelper.PENDLE] = true;
    isTokenProtected[SdPendleHelper.sdPENDLE] = true;

    stash = address(new StakeDAOGaugeWrapperStash(address(this)));
  }

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @notice Sync reward tokens from CvxFxnStaking contract.
  function syncRewardToken() external {
    delete rewards;

    uint256 _count = ICurveGauge(SdPendleHelper.SD_PENDLE_GAUGE).reward_count();
    for (uint256 i = 0; i < _count; i++) {
      address _token = ICurveGauge(SdPendleHelper.SD_PENDLE_GAUGE).reward_tokens(i);
      rewards.push(_token);
    }
  }

  /// @inheritdoc IConcentratorStrategy
  function deposit(address, uint256 _amount) external override onlyOperator {
    if (_amount > 0) {
      IERC20(SdPendleHelper.sdPENDLE).safeTransfer(SdPendleHelper.LOCKER, _amount);
      IConcentratorStakeDAOLocker(SdPendleHelper.LOCKER).deposit(
        SdPendleHelper.SD_PENDLE_GAUGE,
        SdPendleHelper.sdPENDLE
      );
    }
  }

  /// @inheritdoc IConcentratorStrategy
  function withdraw(address _recipient, uint256 _amount) external override onlyOperator {
    if (_amount > 0) {
      IConcentratorStakeDAOLocker(SdPendleHelper.LOCKER).withdraw(
        SdPendleHelper.SD_PENDLE_GAUGE,
        SdPendleHelper.sdPENDLE,
        _amount,
        _recipient
      );
    }
  }

  /// @inheritdoc IConcentratorStrategy
  function harvest(address _converter, address _intermediate)
    external
    override
    onlyOperator
    returns (uint256 _harvested)
  {
    if (_intermediate != SdPendleHelper.PENDLE) revert ErrorIntermediateNotPENDLE();

    // 1. claim rewards from LOCKER contract.
    address[] memory cachedRewards = rewards;
    IConcentratorStakeDAOLocker(SdPendleHelper.LOCKER).claimRewards(SdPendleHelper.SD_PENDLE_GAUGE, new address[](0));
    uint256[] memory _amounts = StakeDAOGaugeWrapperStash(stash).withdrawTokens(cachedRewards);

    address _registry = ITokenConverter(_converter).registry();
    // 2. convert all rewards (except PENDLE and sdPENDLE) to WETH
    uint256 _amountPENDLE;
    uint256 _amountWETH;
    for (uint256 i = 0; i < cachedRewards.length; i++) {
      address _rewardToken = cachedRewards[i];
      uint256 _amount = _amounts[i];
      if (_rewardToken == SdPendleHelper.PENDLE) {
        _amountPENDLE += _amount;
      } else if (_rewardToken == SdPendleHelper.sdPENDLE) {
        _harvested += _amount;
      } else if (_rewardToken == WETH) {
        _amountWETH += _amount;
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

    // 3. convert all WETH to PENDLE
    if (_amountWETH > 0) {
      _transferToken(WETH, _converter, _amountWETH);
      _amountPENDLE += _convert(
        _converter,
        _amountWETH,
        IConverterRegistry(_registry).getRoutes(WETH, SdPendleHelper.PENDLE),
        address(this)
      );
    }

    // 4. swap PENDLE to sdPENDLE
    uint256 _swapped;
    if (_amountPENDLE > 0) {
      _swapped += SdPendleHelper.swapPendleToSdPendle(_amountPENDLE, SdPendleHelper.LOCKER);
    }

    // 5. transfer
    // part of the sdPENDLE is transferred to LOCKER in step 4, we only transfer rest of them
    if (_harvested > 0) {
      IERC20(SdPendleHelper.sdPENDLE).safeTransfer(SdPendleHelper.LOCKER, _harvested);
    }
    _harvested += _swapped;

    // 6. deposit
    if (_harvested > 0) {
      _harvested = IConcentratorStakeDAOLocker(SdPendleHelper.LOCKER).deposit(
        SdPendleHelper.SD_PENDLE_GAUGE,
        SdPendleHelper.sdPENDLE
      );
    }

    return _harvested;
  }
}
