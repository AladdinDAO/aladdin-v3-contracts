// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

import "./interfaces/IVoteMarketPlatform.sol";
import "../interfaces/ICurveLockerProxy.sol";
import "../../interfaces/IZap.sol";

import "./BaseBribeConverter.sol";

contract VoteMarketConverter is BaseBribeConverter {
  using SafeERC20 for IERC20;

  /*************
   * Variables *
   *************/

  /// @notice The address of Stake DAO Vote Market Platform contract.
  /// @dev Example: https://etherscan.io/address/0x7D0F747eb583D43D41897994c983F13eF7459e1f
  address public platform;

  /***************
   * Constructor *
   ***************/

  constructor(
    address _proxy,
    address _keeper,
    address _zap,
    address _platform
  ) BaseBribeConverter(_proxy, _keeper, _zap) {
    platform = _platform;
  }

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @notice Convert bribe rewards to CRV.
  /// @dev Make sure that the `recipient` for `proxy` in PlatformFactory is set to this contract.
  /// @param _bribeIds The list of bribe ids.
  /// @param _tokens The list of reward tokens.
  /// @return _amountCRV The amount of CRV converted.
  function convert(
    uint256[] calldata _bribeIds,
    address[] calldata _tokens,
    uint256 _minOut
  ) external onlyKeeper returns (uint256 _amountCRV) {
    IVoteMarketPlatform(platform).claimAllFor(proxy, _bribeIds);

    uint256 _length = _tokens.length;
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

  /// @notice Update the address of platform.
  /// @param _platform The address of new platform contract.
  function updatePlatform(address _platform) external onlyOwner {
    platform = _platform;
  }
}
