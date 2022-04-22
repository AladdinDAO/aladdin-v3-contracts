// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;
pragma abicoder v2;

import "../interfaces/IUChildERC20.sol";

import "./Layer2CRVDepositor.sol";

contract PolygonCRVDepositor is Layer2CRVDepositor {
  /********************************** Internal Functions **********************************/

  /// See {Layer2CRVDepositorBase-_bridgeCRV}
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

    IUChildERC20(crv).withdraw(_totalAmount);

    _bridgeAmount = _totalAmount;
    _totalFee = 0;
  }
}
