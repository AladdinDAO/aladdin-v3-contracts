// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable-v4/token/ERC20/IERC20Upgradeable.sol";
import { SafeERC20Upgradeable } from "@openzeppelin/contracts-upgradeable-v4/token/ERC20/utils/SafeERC20Upgradeable.sol";

import { IFxBoostableRebalancePool } from "../../interfaces/f(x)/IFxBoostableRebalancePool.sol";
import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable-v4/token/ERC20/IERC20Upgradeable.sol";
import { IFxMarketV2 } from "../../interfaces/f(x)/IFxMarketV2.sol";
import { IFxTokenWrapper } from "../../interfaces/f(x)/IFxTokenWrapper.sol";
import { IFxTreasuryV2 } from "../../interfaces/f(x)/IFxTreasuryV2.sol";

import { ShareableRebalancePool } from "./ShareableRebalancePool.sol";

contract ShareableRebalancePoolV2 is ShareableRebalancePool {
  using SafeERC20Upgradeable for IERC20Upgradeable;

  /***************
   * Constructor *
   ***************/

  constructor(
    address _fxn,
    address _ve,
    address _veHelper,
    address _minter
  ) ShareableRebalancePool(_fxn, _ve, _veHelper, _minter) {}

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @inheritdoc IFxBoostableRebalancePool
  function liquidate(uint256 _maxAmount, uint256 _minBaseOut)
    external
    override
    onlyRole(LIQUIDATOR_ROLE)
    returns (uint256 _liquidated, uint256 _baseOut)
  {
    _checkpoint(address(0));

    IFxTreasuryV2 _treasury = IFxTreasuryV2(treasury);
    if (_treasury.collateralRatio() >= liquidatableCollateralRatio) {
      revert CannotLiquidate();
    }
    (, uint256 _maxLiquidatable) = _treasury.maxRedeemableFToken(liquidatableCollateralRatio);

    uint256 _amount = _maxLiquidatable;
    if (_amount > _maxAmount) {
      _amount = _maxAmount;
    }

    address _asset = asset;
    address _market = market;
    address _wrapper = wrapper;

    _liquidated = IERC20Upgradeable(_asset).balanceOf(address(this));
    if (_amount > _liquidated) {
      // cannot liquidate more than assets in this contract.
      _amount = _liquidated;
    }
    IERC20Upgradeable(_asset).safeApprove(_market, 0);
    IERC20Upgradeable(_asset).safeApprove(_market, _amount);
    (_baseOut, ) = IFxMarketV2(_market).redeemFToken(_amount, _wrapper, _minBaseOut);
    _liquidated = _liquidated - IERC20Upgradeable(_asset).balanceOf(address(this));

    emit Liquidate(_liquidated, _baseOut);

    // wrap base token if needed
    address _token = baseToken;
    if (_wrapper != address(this)) {
      _baseOut = IFxTokenWrapper(_wrapper).wrap(_baseOut);
      _token = IFxTokenWrapper(_wrapper).dst();
    }

    // distribute liquidated base token
    _accumulateReward(_token, _baseOut);

    // notify loss
    _notifyLoss(_liquidated);
  }
}
