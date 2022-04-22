// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;
pragma abicoder v2;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

import "./Layer1ACRVDefaultProxy.sol";
import "../interfaces/IPolygonRootChainManager.sol";

/// @notice The implementation of Layer1ACRVProxy for Polygon
///   + bridge aCRV using Multichain (Previously Anyswap)
///   + bridge CRV using Polygon Bridge.
/// @dev The address of this contract should be the same as corresponding Layer2Depositor.
contract Layer1ACRVPolygonProxy is Layer1ACRVDefaultProxy {
  using SafeERC20 for IERC20;

  address private constant POLYGON_BRIDGE = 0xA0c68C638235ee32657e8f720a23ceC1bFc77C77;

  /********************************** Mutated Functions **********************************/

  /// @notice Withdraw CRV from Polygon Bridge.
  /// @param _inputData The calldata pass to Polygon Bridge.
  function exitFromBridge(bytes calldata _inputData) external onlyAnyCallProxy {
    IPolygonRootChainManager(POLYGON_BRIDGE).exit(_inputData);
  }

  /********************************** Internal Functions **********************************/

  /// @dev See {Layer1ACRVProxyBase-_bridgeCRV}
  function _bridgeCRV(
    address _recipient,
    uint256 _totalAmount,
    uint256 _targetChain
  ) internal virtual override returns (uint256 _bridgeAmount, uint256 _totalFee) {
    // solhint-disable-next-line reason-string
    require(_targetChain == 137, "Layer1ACRVPolygonProxy: invalid target chain");

    IERC20(CRV).safeApprove(POLYGON_BRIDGE, 0);
    IERC20(CRV).safeApprove(POLYGON_BRIDGE, _totalAmount);

    bytes memory _depositData = abi.encode(_totalAmount);
    IPolygonRootChainManager(POLYGON_BRIDGE).depositFor(_recipient, CRV, _depositData);

    _bridgeAmount = _totalAmount;
    _totalFee = 0;
  }
}
