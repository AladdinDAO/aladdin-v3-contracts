// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;
pragma abicoder v2;

import "@openzeppelin/contracts-upgradeable/math/SafeMathUpgradeable.sol";

import "../../curve-wrapper/interfaces/ICrvDepositor.sol";
import "../../curve-wrapper/interfaces/ICrvLockerLiquidityStaking.sol";
import "../../interfaces/IZap.sol";

import "../ConcentratorGeneralVault.sol";
import "../interfaces/IAladdinCompounder.sol";
import "../interfaces/IAladdinCompounderExtensions.sol";

// solhint-disable reason-string

contract ConcentratorVaultForCLeverVeCRV is ConcentratorGeneralVault {
  using SafeMathUpgradeable for uint256;
  using SafeERC20Upgradeable for IERC20Upgradeable;

  /// @dev The address of CRV token.
  address private constant CRV = 0xD533a949740bb3306d119CC777fa900bA034cd52;

  /// @notice The address of AldVeCRVLiquidityStaking contract.
  address public immutable crvDepositor;

  /// @notice The address of CLeverVeCRV token.
  address public immutable cveCRV;

  /// @dev The address of auto compounding CLeverVeCRV token.
  address private acveCRV;

  constructor(address _cveCRV, address _crvDepositor) {
    cveCRV = _cveCRV;
    crvDepositor = _crvDepositor;
  }

  function initialize(
    address _acveCRV,
    address _zap,
    address _platform
  ) external initializer {
    require(_acveCRV != address(0), "Concentrator: zero acveCRV address");
    ConcentratorGeneralVault._initialize(_zap, _platform);

    address _underlying = IAladdinCompounder(_acveCRV).asset();
    require(_underlying == cveCRV, "Concentrator: underlying mismatch");

    IERC20Upgradeable(CRV).safeApprove(_acveCRV, uint256(-1));
    IERC20Upgradeable(CRV).safeApprove(crvDepositor, uint256(-1));

    acveCRV = _acveCRV;
  }

  /********************************** View Functions **********************************/

  /// @inheritdoc IConcentratorGeneralVault
  function rewardToken() public view virtual override returns (address) {
    return acveCRV;
  }

  /********************************** Internal Functions **********************************/

  /// @inheritdoc ConcentratorGeneralVault
  function _claim(
    uint256 _amount,
    uint256 _minOut,
    address _recipient,
    address _claimAsToken
  ) internal virtual override returns (uint256) {
    address _acveCRV = acveCRV;
    uint256 _amountOut;
    if (_claimAsToken == _acveCRV) {
      _amountOut = _amount;
    } else {
      _amountOut = IAladdinCompounder(_acveCRV).redeem(_amount, address(this), address(this));
      if (_claimAsToken != cveCRV) {
        address _zap = zap;
        IERC20Upgradeable(cveCRV).safeTransfer(_zap, _amountOut);
        _amountOut = IZap(_zap).zap(cveCRV, _amountOut, _claimAsToken, 0);
      }
    }

    require(_amountOut >= _minOut, "Concentrator: insufficient rewards");

    if (_claimAsToken == address(0)) {
      // solhint-disable-next-line avoid-low-level-calls
      (bool _success, ) = msg.sender.call{ value: _amount }("");
      require(_success, "Concentrator: transfer ETH failed");
    } else {
      IERC20Upgradeable(_claimAsToken).safeTransfer(_recipient, _amountOut);
    }

    return _amountOut;
  }

  /// @inheritdoc ConcentratorGeneralVault
  function _harvest(uint256 _pid) internal virtual override returns (uint256) {
    address _strategy = poolInfo[_pid].strategy.strategy;
    address _zap = zap;
    uint256 _amountCRV = IConcentratorStrategy(_strategy).harvest(_zap, CRV);

    return IAladdinCompounderExtensions(acveCRV).depositWithCRV(address(this), _amountCRV);
  }
}
