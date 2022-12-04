// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import "@openzeppelin/contracts-upgradeable/math/SafeMathUpgradeable.sol";

import "../ConcentratorConvexVault.sol";
import "../interfaces/IAladdinCompounder.sol";
import "../../interfaces/ICurveETHPool.sol";
import "../../interfaces/IZap.sol";

contract AladdinETHConvexVault is ConcentratorConvexVault {
  using SafeMathUpgradeable for uint256;
  using SafeERC20Upgradeable for IERC20Upgradeable;

  /// @notice Emitted when the zap contract is updated.
  /// @param _zap The address of the zap contract.
  event UpdateZap(address indexed _zap);

  /// @notice The address of aladdinETH token.
  address public aladdinETH;

  /// @notice The address of ZAP contract, will be used to swap tokens.
  address public zap;

  /// @dev The address of curve swap pool.
  address private curveSwapPool;

  /// @dev The address of curve lp token.
  address private curveLpToken;

  function initialize(
    address _aladdinETH,
    address _curveSwapPool,
    address _zap,
    address _platform
  ) external initializer {
    ConcentratorConvexVault._initialize(_platform);

    require(_aladdinETH != address(0), "zero aladdinETH address");
    require(_zap != address(0), "zero zap address");

    curveLpToken = IAladdinCompounder(_aladdinETH).asset();
    curveSwapPool = _curveSwapPool;

    aladdinETH = _aladdinETH;
    zap = _zap;
  }

  /********************************** View Functions **********************************/

  /// @inheritdoc IConcentratorConvexVault
  function rewardToken() public view virtual override returns (address) {
    return aladdinETH;
  }

  /********************************** Restricted Functions **********************************/

  /// @dev Update the zap contract
  function updateZap(address _zap) external onlyOwner {
    require(_zap != address(0), "zero zap address");
    zap = _zap;

    emit UpdateZap(_zap);
  }

  /********************************** Internal Functions **********************************/

  /// @inheritdoc ConcentratorConvexVault
  function _claim(
    uint256 _amount,
    uint256 _minOut,
    address _recipient,
    address _claimAsToken
  ) internal virtual override returns (uint256) {
    address _aladdinETH = aladdinETH;
    uint256 _amountOut;
    if (_claimAsToken == _aladdinETH) {
      _amountOut = _amount;
    } else {
      _amountOut = IAladdinCompounder(_aladdinETH).redeem(_amount, address(this), address(this));
      address _underlying = curveLpToken;
      if (_claimAsToken != _underlying) {
        address _zap = zap;
        IERC20Upgradeable(_underlying).safeTransfer(_zap, _amountOut);
        _amountOut = IZap(_zap).zap(_underlying, _amountOut, _claimAsToken, 0);
      }
    }

    require(_amountOut >= _minOut, "insufficient rewards");

    if (_claimAsToken == address(0)) {
      // solhint-disable-next-line avoid-low-level-calls
      (bool _success, ) = msg.sender.call{ value: _amount }("");
      require(_success, "transfer ETH failed");
    } else {
      IERC20Upgradeable(_claimAsToken).safeTransfer(_recipient, _amountOut);
    }

    return _amountOut;
  }

  /// @inheritdoc ConcentratorConvexVault
  function _zapAsRewardToken(address[] memory _tokens, uint256[] memory _amounts)
    internal
    virtual
    override
    returns (uint256)
  {
    // 1. zap as ETH
    address _zap = zap;
    uint256 _amountETH;
    for (uint256 i = 0; i < _tokens.length; i++) {
      if (_amounts[i] > 0) {
        IERC20Upgradeable(_tokens[i]).safeTransfer(_zap, _amounts[i]);
        _amountETH = _amountETH.add(IZap(_zap).zap(_tokens[i], _amounts[i], address(0), 0));
      }
    }

    // 2. add liquidity as ETH/base LP
    uint256 _amountLP;
    if (_amountETH > 0) {
      uint256[2] memory _inputs;
      _inputs[0] = _amountETH;
      _amountLP = ICurveETHPool(curveSwapPool).add_liquidity{ value: _amountETH }(_inputs, 0);
    }

    // 3. deposit as aladdinETH
    if (_amountLP > 0) {
      return IAladdinCompounder(aladdinETH).deposit(_amountLP, address(this));
    } else {
      return 0;
    }
  }
}
