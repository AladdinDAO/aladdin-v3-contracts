// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;
pragma abicoder v2;

import "../interfaces/IFantomCRV.sol";

import "./Layer2CRVDepositor.sol";

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
    require(_recipient == address(this), "PolygonCRVDepositor: only withdraw to self");

    CrossChainInfo memory _info = CRVCrossChainInfo;
    // solhint-disable-next-line reason-string
    require(_totalAmount >= _info.minCrossChainAmount, "PolygonCRVDepositor: insufficient cross chain amount");
    // we don't need to check upper limit here.

    IFantomCRV(crv).Swapout(_totalAmount, _recipient);

    _totalFee = (_bridgeAmount * _info.feePercentage) / FEE_DENOMINATOR;
    if (_totalFee < _info.minCrossChainFee) {
      _totalFee = _info.minCrossChainFee;
    }
    if (_totalFee > _info.maxCrossChainFee) {
      _totalFee = _info.maxCrossChainFee;
    }

    _bridgeAmount = _totalAmount;
    _totalFee = 0;
  }
}
