// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;
pragma abicoder v2;

import "./Layer2CRVDepositor.sol";

contract PolygonCRVDepositor is Layer2CRVDepositor {
  /********************************** Internal Functions **********************************/

  /// See {Layer2CRVDepositorBase-_bridgeCRV}
  function _bridgeCRV(address _recipient, uint256 _totalAmount)
    internal
    virtual
    override
    returns (uint256 _bridgeAmount, uint256 _totalFee)
  {}
}
