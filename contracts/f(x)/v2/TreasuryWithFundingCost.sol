// SPDX-License-Identifier: MIT

pragma solidity =0.8.20;
pragma abicoder v2;

import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable-v4/token/ERC20/IERC20Upgradeable.sol";
import { SafeERC20Upgradeable } from "@openzeppelin/contracts-upgradeable-v4/token/ERC20/utils/SafeERC20Upgradeable.sol";

import { ExponentialMovingAverageV8 } from "../../common/math/ExponentialMovingAverageV8.sol";

import { ICrvUSDAmm } from "../../interfaces/curve/ICrvUSDAmm.sol";
import { IFxRebalancePoolSplitter } from "../../interfaces/f(x)/IFxRebalancePoolSplitter.sol";
import { IFxTreasuryV2 } from "../../interfaces/f(x)/IFxTreasuryV2.sol";

import { CrvUSDBorrowRateAdapter } from "../funding-rate-adapter/CrvUSDBorrowRateAdapter.sol";
import { FxStableMath } from "../math/FxStableMath.sol";
import { TreasuryV2 } from "./TreasuryV2.sol";

contract TreasuryWithFundingCost is TreasuryV2, CrvUSDBorrowRateAdapter {
  using SafeERC20Upgradeable for IERC20Upgradeable;

  using ExponentialMovingAverageV8 for ExponentialMovingAverageV8.EMAStorage;
  using FxStableMath for FxStableMath.SwapState;

  /***************
   * Constructor *
   ***************/

  constructor(
    address _baseToken,
    address _fToken,
    address _xToken
  ) TreasuryV2(_baseToken, _fToken, _xToken) {}

  function initialize(
    address _platform,
    address _rebalancePoolSplitter,
    address _priceOracle,
    uint256 _baseTokenCap,
    uint24 sampleInterval,
    address _amm
  ) external initializer {
    __Context_init();
    __ERC165_init();
    __AccessControl_init();

    __TreasuryV2_init(_platform, _rebalancePoolSplitter, _priceOracle, _baseTokenCap, sampleInterval);
    __CrvUSDBorrowRateAdaptor_init(_amm);

    _grantRole(DEFAULT_ADMIN_ROLE, _msgSender());
  }

  /*************************
   * Public View Functions *
   *************************/

  /// @inheritdoc TreasuryV2
  function harvestable() public view override returns (uint256) {
    FxStableMath.SwapState memory _state = _loadSwapState(Action.None);

    // usually the leverage should always >= 1.0, but if < 1.0, the function will revert.
    uint256 _leverage = _state.leverageRatio();
    uint256 _fundingRate = getFundingRate();
    // funding cost = (xToken Value * (leverage - 1) * funding rate * scale) / baseNav
    uint256 _fundingCost = ((_state.xNav * _state.xSupply * (_leverage - PRECISION)) / PRECISION);
    _fundingCost = (_fundingCost * _fundingRate) / PRECISION;
    _fundingCost = (_fundingCost * fundingCostScale) / PRECISION;
    _fundingCost /= _state.baseNav;

    // no need to wrap or unwrap here, since we won't have rate provider in this treasury.
    return _fundingCost;
  }

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @inheritdoc TreasuryV2
  function harvest() external virtual override {
    // no need to harvest
    if (borrowRateSnapshot.timestamp == block.timestamp) return;

    // update leverage and revert when under collateral
    FxStableMath.SwapState memory _state = _loadSwapState(Action.None);
    if (_state.xNav == 0) revert ErrorUnderCollateral();
    _updateEMALeverageRatio(_state);

    uint256 _totalRewards = harvestable();
    _captureFundingRate();
    totalBaseToken -= _totalRewards;

    _distributedHarvestedRewards(_totalRewards);
  }

  /************************
   * Restricted Functions *
   ************************/

  /// @inheritdoc IFxTreasuryV2
  function initializeProtocol(uint256 _baseIn)
    external
    virtual
    override
    onlyRole(PROTOCOL_INITIALIZER_ROLE)
    returns (uint256 fTokenOut, uint256 xTokenOut)
  {
    (fTokenOut, xTokenOut) = _initializeProtocol(_baseIn);
    borrowRateSnapshot = BorrowRateSnapshot(uint128(ICrvUSDAmm(amm).get_rate_mul()), uint128(block.timestamp));
  }

  /**********************
   * Internal Functions *
   **********************/

  /// @inheritdoc TreasuryV2
  function _distributeRebalancePoolRewards(address _token, uint256 _amount) internal override {
    address _splitter = rebalancePoolSplitter;

    IERC20Upgradeable(_token).safeTransfer(_splitter, _amount);
    IFxRebalancePoolSplitter(_splitter).split(_token);
  }
}
