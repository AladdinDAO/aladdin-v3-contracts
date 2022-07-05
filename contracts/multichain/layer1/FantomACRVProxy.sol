// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;
pragma abicoder v2;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

import "./Layer1ACRVProxy.sol";

/// @notice The implementation of Layer1ACRVProxy for Fantom
///   + bridge aCRV using Multichain (Previously Anyswap)
///   + bridge CRV using Fantom Bridge.
/// @dev The address of this contract should be the same as corresponding Layer2Depositor.
contract FantomACRVProxy is Layer1ACRVProxy {
  using SafeERC20 for IERC20;

  address private constant FANTOM_BRIDGE = 0xC564EE9f21Ed8A2d8E7e76c085740d5e4c5FaFbE;

  /********************************** Internal Functions **********************************/

  /// @dev See {CrossChainCallBase-_bridgeCRV}
  function _bridgeCRV(address _recipient, uint256 _totalAmount)
    internal
    virtual
    override
    returns (uint256 _bridgeAmount, uint256 _totalFee)
  {
    // solhint-disable-next-line reason-string
    require(_recipient == address(this), "FantomACRVProxy: only bridge to self");

    IERC20(CRV).safeTransfer(FANTOM_BRIDGE, _totalAmount);

    _bridgeAmount = _totalAmount;
    _totalFee = 0;
  }
}
