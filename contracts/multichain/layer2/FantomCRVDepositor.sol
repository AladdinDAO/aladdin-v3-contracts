// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;
pragma abicoder v2;

import "../interfaces/IFantomCRV.sol";

import "./Layer2CRVDepositor.sol";

/// @notice The implementation of Layer2CRVDepositor for Fantom
///   + bridge aCRV using Multichain (Previously Anyswap)
///   + bridge CRV using Fantom Bridge.
/// @dev The address of this contract should be the same as corresponding Layer1ACRVProxy.
contract FantomCRVDepositor is Layer2CRVDepositor {
  event AsyncExit(uint256 indexed _executionId);

  /********************************** Internal Functions **********************************/

  /// @dev See {Layer2CRVDepositorBase-_customFallback}
  function _customFallback(address, bytes memory) internal virtual override {
    // solhint-disable-next-line reason-string
    revert("Layer2CRVDepositor: invalid fallback call");
  }

  /// @dev See {CrossChainCallBase-_bridgeCRV}
  function _bridgeCRV(address _recipient, uint256 _totalAmount)
    internal
    virtual
    override
    returns (uint256 _bridgeAmount, uint256 _totalFee)
  {
    // solhint-disable-next-line reason-string
    require(_recipient == address(this), "FantomCRVDepositor: only bridge to self");

    CrossChainInfo memory _info = CRVCrossChainInfo;
    // solhint-disable-next-line reason-string
    require(_totalAmount >= _info.minCrossChainAmount, "FantomCRVDepositor: insufficient cross chain amount");
    // we don't need to check upper limit here.

    IFantomCRV(crv).Swapout(_totalAmount, _recipient);

    _totalFee = _computeBridgeFee(_bridgeAmount, _info);
    _bridgeAmount = _totalAmount;
  }
}
