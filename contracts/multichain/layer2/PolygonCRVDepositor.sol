// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;
pragma abicoder v2;

import "../interfaces/IUChildERC20.sol";

import "../layer1/PolygonACRVProxy.sol";
import "./Layer2CRVDepositor.sol";

/// @notice The implementation of Layer2CRVDepositor for Polygon
///   + bridge aCRV using Multichain (Previously Anyswap)
///   + bridge CRV using Polygon Bridge.
/// @dev The address of this contract should be the same as corresponding Layer1ACRVProxy.
contract PolygonCRVDepositor is Layer2CRVDepositor {
  event AsyncExit(uint256 indexed _executionId);

  function asyncExit(bytes calldata _inputData) external payable onlyWhitelist SponsorCrossCallFee {
    CrossChainOperationData memory _operation = depositOperation;
    AsyncOperationStatus _status = asyncDepositStatus;
    // solhint-disable-next-line reason-string
    require(_status == AsyncOperationStatus.Pending, "PolygonCRVDepositor: no pending deposit");

    // cross chain call deposit
    bytes memory _data = abi.encodeWithSelector(PolygonACRVProxy.exitFromBridge.selector, _inputData);
    ICrossChainCallProxy(crossChainCallProxy).crossChainCall(layer1Proxy, _data, address(0), 1);

    emit AsyncExit(_operation.executionId);
  }

  // @todo add asyncExitAndRedeem

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
    require(_recipient == address(this), "PolygonCRVDepositor: only bridge to self");

    CrossChainInfo memory _info = CRVCrossChainInfo;
    // solhint-disable-next-line reason-string
    require(_totalAmount >= _info.minCrossChainAmount, "PolygonCRVDepositor: insufficient cross chain amount");
    // we don't need to check upper limit here.

    IUChildERC20(crv).withdraw(_totalAmount);

    _bridgeAmount = _totalAmount;
    _totalFee = 0;
  }
}
