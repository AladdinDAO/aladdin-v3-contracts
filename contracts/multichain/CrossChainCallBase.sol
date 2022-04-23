// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import "./interfaces/IAnyCallProxy.sol";

contract CrossChainCallBase {
  event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

  /// @notice The owner of the contract.
  address public owner;
  /// @notice The address of AnyCallProxy.
  address public anyCallProxy;
  /// @notice The address of CrossChainCallProxy.
  address public crossChainCallProxy;

  modifier onlyAnyCallProxy() {
    // solhint-disable-next-line reason-string
    require(msg.sender == anyCallProxy, "Layer2CRVDepositor: only AnyCallProxy");
    _;
  }

  modifier onlyOwner() {
    // solhint-disable-next-line reason-string
    require(msg.sender == owner, "Layer2CRVDepositor: only owner");
    _;
  }

  modifier SponsorCrossCallFee() {
    // caller sponsor cross chain fee.
    if (msg.value > 0) {
      IAnyCallProxy(anyCallProxy).deposit{ value: msg.value }(crossChainCallProxy);
    }
    _;
  }

  function _initialize(
    address _anyCallProxy,
    address _crossChainCallProxy,
    address _owner
  ) internal {
    // solhint-disable-next-line reason-string
    require(_anyCallProxy != address(0), "CrossChainCallBase: zero address");
    // solhint-disable-next-line reason-string
    require(_crossChainCallProxy != address(0), "CrossChainCallBase: zero address");
    // solhint-disable-next-line reason-string
    require(_owner != address(0), "CrossChainCallBase: zero address");

    anyCallProxy = _anyCallProxy;
    crossChainCallProxy = _crossChainCallProxy;
    owner = _owner;
  }

  /********************************** Restricted Functions **********************************/

  /// @notice Update AnyCallProxy contract.
  /// @param _anyCallProxy The address to update.
  function updateAnyCallProxy(address _anyCallProxy) external onlyOwner {
    anyCallProxy = _anyCallProxy;
  }

  /// @notice Update CrossChainCallProxy contract.
  /// @param _crossChainCallProxy The address to update.
  function updateCrossChainCallProxy(address _crossChainCallProxy) external onlyOwner {
    crossChainCallProxy = _crossChainCallProxy;
  }

  /// @notice Transfers ownership of the contract to a new account (`newOwner`).
  /// @dev Can only be called by the current owner.
  /// @param _owner The address of new owner.
  function transferOwnership(address _owner) public onlyOwner {
    // solhint-disable-next-line reason-string
    require(_owner != address(0), "Layer1ACRVProxy: zero address");
    emit OwnershipTransferred(owner, _owner);
    owner = _owner;
  }

  /// @notice Execute calls on behalf of contract in case of emergency
  /// @param _to The address of contract to call.
  /// @param _value The amount of ETH passing to the contract.
  /// @param _data The data passing to the contract.
  function execute(
    address _to,
    uint256 _value,
    bytes calldata _data
  ) external onlyOwner returns (bool, bytes memory) {
    // solhint-disable-next-line avoid-low-level-calls
    (bool success, bytes memory result) = _to.call{ value: _value }(_data);
    return (success, result);
  }

  /********************************** Internal Functions **********************************/

  /// @dev Internal function to get current chain id.
  function _getChainId() internal pure returns (uint256) {
    uint256 _chainId;
    // solhint-disable-next-line no-inline-assembly
    assembly {
      _chainId := chainid()
    }
    return _chainId;
  }
}
