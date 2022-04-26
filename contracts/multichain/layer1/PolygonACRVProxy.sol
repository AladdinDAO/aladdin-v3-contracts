// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;
pragma abicoder v2;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

import "./Layer1ACRVProxy.sol";
import "../interfaces/IPolygonRootChainManager.sol";

/// @notice The implementation of Layer1ACRVProxy for Polygon
///   + bridge aCRV using Multichain (Previously Anyswap)
///   + bridge CRV using Polygon Bridge.
/// @dev The address of this contract should be the same as corresponding Layer2Depositor.
contract PolygonACRVProxy is Layer1ACRVProxy {
  using SafeERC20 for IERC20;

  event ExitFromBridge(uint256 _amount);

  /// @dev The address of Polygon (Matic): Bridge in Ethereum.
  address private constant POLYGON_BRIDGE = 0xA0c68C638235ee32657e8f720a23ceC1bFc77C77;

  /// @dev The address of Polygon (Matic): ERC20 Bridge in Ethereum.
  address private constant POLYGON_ERC20_BRIDGE = 0x40ec5B33f54e0E8A33A975908C5BA1c14e5BbbDf;

  /********************************** Mutated Functions **********************************/

  /// @notice Withdraw CRV from Polygon Bridge.
  /// @param _inputData The calldata pass to Polygon Bridge.
  function exitFromBridge(bytes calldata _inputData) external onlyAnyCallProxy {
    uint256 _before = IERC20(CRV).balanceOf(address(this));
    IPolygonRootChainManager(POLYGON_BRIDGE).exit(_inputData);
    uint256 _after = IERC20(CRV).balanceOf(address(this));

    emit ExitFromBridge(_after - _before);
  }

  /********************************** Internal Functions **********************************/

  /// @dev See {CrossChainCallBase-_bridgeCRV}
  function _bridgeCRV(address _recipient, uint256 _totalAmount)
    internal
    virtual
    override
    returns (uint256 _bridgeAmount, uint256 _totalFee)
  {
    // solhint-disable-next-line reason-string
    require(_recipient == address(this), "PolygonACRVProxy: only bridge to self");

    IERC20(CRV).safeApprove(POLYGON_ERC20_BRIDGE, 0);
    IERC20(CRV).safeApprove(POLYGON_ERC20_BRIDGE, _totalAmount);

    bytes memory _depositData = abi.encode(_totalAmount);
    IPolygonRootChainManager(POLYGON_BRIDGE).depositFor(_recipient, CRV, _depositData);

    _bridgeAmount = _totalAmount;
    _totalFee = 0;
  }
}
