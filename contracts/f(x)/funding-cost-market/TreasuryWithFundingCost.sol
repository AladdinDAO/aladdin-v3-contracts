// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable-v4/token/ERC20/IERC20Upgradeable.sol";

import { ICrvUSDAmm } from "../../interfaces/curve/ICrvUSDAmm.sol";
import { IFxTreasuryV2 } from "../../interfaces/f(x)/IFxTreasuryV2.sol";

import { ExponentialMovingAverageV8 } from "../../common/math/ExponentialMovingAverageV8.sol";
import { FxStableMath } from "../math/FxStableMath.sol";
import { TreasuryV2 } from "../v2/TreasuryV2.sol";
import { CrvUSDBorrowRateAdapter } from "./funding-rate-adapter/CrvUSDBorrowRateAdapter.sol";

contract TreasuryWithFundingCost is TreasuryV2, CrvUSDBorrowRateAdapter {
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
    FxStableMath.SwapState memory _state = _loadSwapState(Action.None, false);
    return _harvestable(_state);
  }

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @inheritdoc TreasuryV2
  function harvest() external virtual override {
    // no need to harvest
    if (borrowRateSnapshot.timestamp == block.timestamp) return;

    // silently return when invalid price or under collateral
    // since `MarketWithFundingCost` would call this in each action.
    if (!isBaseTokenPriceValid()) return;
    FxStableMath.SwapState memory _state = _loadSwapState(Action.None, false);
    if (_state.xNav == 0) return;
    // update leverage
    _updateEMALeverageRatio(_state);

    uint256 _totalRewards = _harvestable(_state);
    totalBaseToken -= getUnderlyingValue(_totalRewards);
    _captureFundingRate();

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
  function _loadSwapState(Action _action)
    internal
    view
    virtual
    override
    returns (FxStableMath.SwapState memory _state)
  {
    return _loadSwapState(_action, true);
  }

  /// @dev Internal function to load swap variable to memory and deduct funding cost if needed.
  function _loadSwapState(Action _action, bool _deductFundingCost)
    private
    view
    returns (FxStableMath.SwapState memory _state)
  {
    _state.baseSupply = totalBaseToken;
    (_state.baseTwapNav, _state.baseNav) = _fetchBaseTokenPrice(_action);

    if (_state.baseSupply == 0) {
      _state.xNav = PRECISION;
    } else {
      _state.fSupply = IERC20Upgradeable(fToken).totalSupply();
      _state.xSupply = IERC20Upgradeable(xToken).totalSupply();
      _computeXTokenNav(_state);
    }

    // deduct funding costs if possible
    if (_deductFundingCost && borrowRateSnapshot.timestamp < block.timestamp) {
      _state.baseSupply -= getUnderlyingValue(_harvestable(_state));
      // recompute xToken nav
      _computeXTokenNav(_state);
    }
  }

  /// @dev Internal function to compute xToken nav
  function _computeXTokenNav(FxStableMath.SwapState memory _state) private pure {
    if (_state.xSupply == 0) {
      // no xToken, treat the nav of xToken as 1.0
      _state.xNav = PRECISION;
    } else {
      uint256 _baseVal = _state.baseSupply * _state.baseNav;
      uint256 _fVal = _state.fSupply * PRECISION;
      if (_baseVal >= _fVal) {
        _state.xNav = (_baseVal - _fVal) / _state.xSupply;
      } else {
        // under collateral
        _state.xNav = 0;
      }
    }
  }

  /// @dev Internal function to compute the funding costs.
  function _harvestable(FxStableMath.SwapState memory _state) private view returns (uint256) {
    // usually the leverage should always >= 1.0, but if < 1.0, the function will revert.
    uint256 _leverage = _state.leverageRatio();
    uint256 _fundingRate = getFundingRate();
    // funding cost = (xToken Value * (leverage - 1) / leverage * funding rate * scale) / baseNav
    uint256 _fundingCost = ((_state.xNav * _state.xSupply * (_leverage - PRECISION)) / _leverage);
    _fundingCost = (_fundingCost * _fundingRate) / PRECISION;
    _fundingCost /= _state.baseNav;

    return getWrapppedValue(_fundingCost);
  }
}
