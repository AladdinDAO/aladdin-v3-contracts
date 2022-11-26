// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;
pragma abicoder v2;

import "../../../interfaces/ICurveFactoryPlainPool.sol";
import "../interfaces/ICurveGauge.sol";
import "../interfaces/ICurveMinter.sol";
import "../interfaces/ILegacyFurnace.sol";

import "../CLeverAMOBase.sol";
import "../math/AMOMath.sol";

// solhint-disable reason-string
// solhint-disable var-name-mixedcase

contract AladdinCVX is CLeverAMOBase {
  using SafeERC20Upgradeable for IERC20Upgradeable;

  /// @dev The address of curve gauge.
  address private immutable gauge;

  int128 private immutable baseIndex;

  int128 private immutable debtIndex;

  constructor(
    address _baseToken,
    address _debtToken,
    address _curvePool,
    address _curveLpToken,
    address _furnace,
    address _gauge
  ) CLeverAMOBase(_baseToken, _debtToken, _curvePool, _curveLpToken, _furnace) {
    gauge = _gauge;

    address _coin0 = ICurveFactoryPlainPool(_curvePool).coins(0);
    debtIndex = _coin0 == _baseToken ? 1 : 0;
    baseIndex = _coin0 == _baseToken ? 0 : 1;
  }

  function initialize(uint256 _initialRatio, address[] memory _rewards) external initializer {
    CLeverAMOBase._initialize("Aladdin CVX", "aCVX");
    RewardClaimable._initialize(_rewards);

    initialRatio = _initialRatio;

    IERC20Upgradeable(curveLpToken).safeApprove(gauge, uint256(-1));
    IERC20Upgradeable(debtToken).safeApprove(furnace, uint256(-1));
  }

  /********************************** Mutated Functions **********************************/

  /********************************** Restricted Functions **********************************/

  /// @inheritdoc ICLeverAMO
  function rebalance(uint256 _withdrawAmount, uint256 _minOut) external override onlyOwner {
    _checkpoint(0);

    AMOConfig memory _config = config;
    {
      uint256 _ratio = ratio();
      require(_config.minLPRatio <= _ratio && _ratio <= _config.maxLPRatio, "aCVX: ratio out of range");
    }

    uint256 _debtInPool = ICurveFactoryPlainPool(curvePool).balances(uint256(debtIndex));
    uint256 _baseInPool = ICurveFactoryPlainPool(curvePool).balances(uint256(baseIndex));
    if (_debtInPool * PRECISION < _config.minAMO * _baseInPool) {
      // withdraw clevCVX from Furnace
      ILegacyFurnace(furnace).withdraw(address(this), _withdrawAmount);

      // add liquidity to curve pool
      uint256[2] memory _addAmounts;
      _addAmounts[uint256(debtIndex)] = _withdrawAmount;
      uint256 _lpTokenOut = ICurveFactoryPlain2Pool(curvePool).add_liquidity(_addAmounts, _minOut);

      // deposit to gauge
      _depositLpToken(_lpTokenOut);
    } else if (_debtInPool * PRECISION < _config.maxAMO * _baseInPool) {
      // withdraw clevCVX from curve pool
      uint256 _debtTokenOut = ICurveFactoryPlainPool(curvePool).remove_liquidity_one_coin(
        _withdrawAmount,
        debtIndex,
        _minOut
      );

      // deposit into Furnace
      ILegacyFurnace(furnace).deposit(_debtTokenOut);
    } else {
      revert("aCVX: amo in range");
    }
  }

  /********************************** Internal Functions **********************************/

  /// @inheritdoc ERC20Upgradeable
  function _beforeTokenTransfer(
    address _from,
    address _to,
    uint256
  ) internal override {
    _checkpointUser(_from);
    _checkpointUser(_to);
  }

  /// @inheritdoc CLeverAMOBase
  function _debtBalanceInContract() internal view override returns (uint256) {
    (uint256 _unrealised, ) = ILegacyFurnace(furnace).getUserInfo(address(this));
    return _unrealised;
  }

  /// @inheritdoc CLeverAMOBase
  function _lpBalanceInContract() internal view override returns (uint256) {
    return ICurveGauge(gauge).balanceOf(address(this));
  }

  /// @inheritdoc CLeverAMOBase
  function _convertFromBaseToken(uint256 _amount)
    internal
    override
    returns (
      uint256 _debtTokenOut,
      uint256 _lpTokenOut,
      uint256 _ratio
    )
  {
    uint256 _debtBalance;
    uint256 _lpBalance;
    uint256 _addLiquidityAmount;
    // compute split amount
    {
      if (totalSupply() == 0) {
        _addLiquidityAmount = _searchSplit(_amount, initialRatio, PRECISION);
      } else {
        _debtBalance = _debtBalanceInContract();
        _lpBalance = _lpBalanceInContract();
        _addLiquidityAmount = _searchSplit(_amount, _lpBalance, _debtBalance);
      }
    }
    // do add liquidity and swap
    {
      uint256[2] memory amounts;
      amounts[uint256(baseIndex)] = _addLiquidityAmount;
      _lpTokenOut = ICurveFactoryPlain2Pool(curvePool).add_liquidity(amounts, 0);
      _debtTokenOut = ICurveFactoryPlainPool(curvePool).exchange(
        baseIndex,
        debtIndex,
        _amount - _addLiquidityAmount,
        0,
        address(this)
      );
    }
    // compute the new ratio
    _ratio = ((_lpBalance + _lpTokenOut) * PRECISION) / (_debtBalance + _debtTokenOut);
  }

  /// @inheritdoc CLeverAMOBase
  function _convertToBaseToken(uint256 _debtTokenAmount, uint256 _lpTokenAmount)
    internal
    override
    returns (uint256 _baseTokenOut)
  {
    // swap then remove liquidity
    _baseTokenOut = ICurveFactoryPlainPool(curvePool).exchange(
      debtIndex,
      baseIndex,
      _debtTokenAmount,
      0,
      address(this)
    );
    _baseTokenOut += ICurveFactoryPlainPool(curvePool).remove_liquidity_one_coin(_lpTokenAmount, baseIndex, 0);
  }

  /// @inheritdoc CLeverAMOBase
  function _depositDebtToken(uint256 _amount) internal override {
    ILegacyFurnace(furnace).deposit(_amount);
  }

  /// @inheritdoc CLeverAMOBase
  function _withdrawDebtToken(uint256 _amount, address _recipient) internal override {
    ILegacyFurnace(furnace).withdraw(_recipient, _amount);
  }

  /// @inheritdoc CLeverAMOBase
  function _claimBaseFromFurnace() internal override returns (uint256 _baseTokenOut) {
    uint256 _before = IERC20Upgradeable(baseToken).balanceOf(address(this));
    ILegacyFurnace(furnace).claim(address(this));
    _baseTokenOut = IERC20Upgradeable(baseToken).balanceOf(address(this)) - _before;
  }

  /// @inheritdoc CLeverAMOBase
  function _depositLpToken(uint256 _amount) internal override {
    ICurveGauge(gauge).deposit(_amount);
  }

  /// @inheritdoc CLeverAMOBase
  function _withdrawLpToken(uint256 _amount, address _recipient) internal override {
    ICurveGauge(gauge).withdraw(_amount);
    if (_recipient != address(this)) {
      IERC20Upgradeable(curveLpToken).safeTransfer(_recipient, _amount);
    }
  }

  /// @inheritdoc CLeverAMOBase
  function _harvest() internal override returns (uint256) {
    uint256 _length = rewards.length;
    uint256[] memory _amounts = new uint256[](_length);
    for (uint256 i = 0; i < _length; i++) {
      address _token = rewards[i];
      _amounts[i] = IERC20Upgradeable(_token).balanceOf(address(this));
    }
    // claim CRV
    ICurveMinter(gauge).mint(gauge);
    // claim extra rewards
    ICurveGauge(gauge).claim_rewards();

    uint256 _totalSupply = totalSupply();
    for (uint256 i = 0; i < _length; i++) {
      address _token = rewards[i];
      _amounts[i] = IERC20Upgradeable(_token).balanceOf(address(this)) - _amounts[i];

      rewardPerShare[_token] += _amounts[i] / _totalSupply;
    }

    return 0;
  }

  /// @inheritdoc RewardClaimable
  function _getShares(address _user) internal view override returns (uint256) {
    return balanceOf(_user);
  }

  /// @dev Search the split between swap and add liquidity
  /// @param dx The input amount of base token.
  /// @param num The numerator of ratio between lp/debt
  /// @param den The denominator of ratio between lp/debt
  function _searchSplit(
    uint256 dx,
    uint256 num,
    uint256 den
  ) internal view returns (uint256) {
    uint256 fee = ICurveFactoryPlainPool(curvePool).fee();
    uint256 amp = ICurveFactoryPlainPool(curvePool).A_precise();
    uint256 supply = IERC20Upgradeable(curveLpToken).totalSupply();
    uint256 x = ICurveFactoryPlainPool(curvePool).balances(uint256(baseIndex));
    uint256 y = ICurveFactoryPlainPool(curvePool).balances(uint256(debtIndex));
    uint256 left;
    uint256 right = dx / AMOMath.UNIT;
    while (left < right) {
      uint256 mid = (left + right + 1) / 2;
      uint256 swap_out = dx - mid * AMOMath.UNIT;
      (uint256 new_x, uint256 new_y, uint256 add_out) = AMOMath.addLiquidity(
        amp,
        fee,
        supply,
        x,
        y,
        mid * AMOMath.UNIT,
        0
      );
      swap_out = AMOMath.swap(amp, fee, new_x, new_y, swap_out);
      // add_out/swap_out <= num/den => left = mid
      // add_out/swap_out > num/den => right = mid - 1
      if (add_out * den <= num * swap_out) {
        left = mid;
      } else {
        right = mid - 1;
      }
    }
    return left * AMOMath.UNIT;
  }
}
