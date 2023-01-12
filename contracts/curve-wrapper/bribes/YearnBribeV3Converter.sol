// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;
pragma abicoder v2;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

import "./interfaces/IYearnBribeV3.sol";
import "../interfaces/ICurveLockerProxy.sol";
import "../../interfaces/IZap.sol";

import "./BaseBribeConverter.sol";

// solhint-disable not-rely-on-time

contract YearnBribeV3Converter is BaseBribeConverter {
  using SafeERC20 for IERC20;

  /*************
   * Constants *
   *************/

  /// @dev The number of seconds in one week.
  uint256 private constant WEEK = 86400 * 7;

  /*************
   * Variables *
   *************/

  /// @notice The address of yBribe contract.
  /// @dev Example: https://etherscan.io/address/0x03dFdBcD4056E2F92251c7B07423E1a33a7D3F6d
  address public ybribe;

  /***************
   * Constructor *
   ***************/

  constructor(
    address _proxy,
    address _keeper,
    address _zap,
    address _ybribe
  ) BaseBribeConverter(_proxy, _keeper, _zap) {
    ybribe = _ybribe;
  }

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @notice Convert bribe rewards to CRV.
  /// @dev Make sure that the `reward_recipient` for `proxy` in yBribe is set to this contract.
  /// @param _gauges The address list of gauges.
  /// @param _tokens The address list of reward tokens.
  /// @return _amountCRV The amount of CRV converted.
  function convert(
    address[] calldata _gauges,
    address[] calldata _tokens,
    uint256 _minOut
  ) external onlyKeeper returns (uint256 _amountCRV) {
    address _ybribe = ybribe;
    uint256 _length = _gauges.length;
    address[] memory _users = new address[](_length);
    for (uint256 i = 0; i < _length; i++) {
      _users[i] = proxy;
    }
    IYearnBribeV3(_ybribe).claim_reward_for_many(_users, _gauges, _tokens);

    address _zap = zap;
    for (uint256 i = 0; i < _length; i++) {
      address _token = _tokens[i];

      uint256 _claimed = IERC20(_token).balanceOf(address(this));
      if (_token == CRV) _amountCRV += _claimed;
      else if (_claimed > 0) {
        IERC20(_token).safeTransfer(_zap, _claimed);
        _amountCRV += IZap(_zap).zap(_token, _claimed, CRV, 0);
      }
    }
    require(_amountCRV >= _minOut, "insufficient CRV output");

    IERC20(CRV).safeTransfer(distributor, _amountCRV);

    return _amountCRV;
  }

  /*******************************
   * Public Restricted Functions *
   *******************************/

  /// @notice Update the address of yBribe.
  /// @param _ybribe The address of new yBribe contract.
  function updateYBribe(address _ybribe) external onlyOwner {
    ybribe = _ybribe;
  }
}
