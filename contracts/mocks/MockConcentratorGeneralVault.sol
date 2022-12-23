// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;
pragma abicoder v2;

import "../concentrator/ConcentratorGeneralVault.sol";

// solhint-disable reason-string

contract MockConcentratorGeneralVault is ConcentratorGeneralVault {
  using SafeMathUpgradeable for uint256;
  using SafeERC20Upgradeable for IERC20Upgradeable;

  /// @dev The address of rewardToken token.
  address private _rewardToken;

  /// @dev The address of underlying token for aladdinETH.
  address private aladdinETHUnderlying;

  function initialize(
    address __rewardToken,
    address _zap,
    address _platform
  ) external initializer {
    require(__rewardToken != address(0), "Concentrator: zero rewardToken address");
    ConcentratorGeneralVault._initialize(_zap, _platform);

    _rewardToken = __rewardToken;
  }

  /********************************** View Functions **********************************/

  /// @inheritdoc IConcentratorGeneralVault
  function rewardToken() public view virtual override returns (address) {
    return _rewardToken;
  }

  /********************************** Internal Functions **********************************/

  /// @inheritdoc ConcentratorGeneralVault
  function _claim(
    uint256 _amount,
    uint256 _minOut,
    address _recipient,
    address _claimAsToken
  ) internal virtual override returns (uint256) {
    uint256 _amountOut;
    if (_claimAsToken == _rewardToken) {
      _amountOut = _amount;
    } else {
      revert("Concentrator: not supported");
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
    return IConcentratorStrategy(_strategy).harvest(zap, _rewardToken);
  }
}
