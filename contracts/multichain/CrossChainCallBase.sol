// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import "./interfaces/IAnyCallProxy.sol";

contract CrossChainCallBase {
  event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
  event UpdateCrossChainCallProxy(address indexed _crossChainCallProxy);
  event UpdateAnyCallProxy(address indexed _anyCallProxy);

  /// @notice The owner of the contract.
  address public owner;
  /// @notice The address of AnyCallProxy.
  address public anyCallProxy;
  /// @notice The address of CrossChainCallProxy.
  address public crossChainCallProxy;

  modifier onlyAnyCallProxy() {
    // solhint-disable-next-line reason-string
    require(msg.sender == anyCallProxy, "CrossChainCallBase: only AnyCallProxy");
    _;
  }

  modifier onlyOwner() {
    // solhint-disable-next-line reason-string
    require(msg.sender == owner, "CrossChainCallBase: only owner");
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

  // solhint-disable-next-line no-empty-blocks
  receive() external payable {}

  /********************************** Restricted Functions **********************************/

  /// @notice Update AnyCallProxy contract.
  /// @param _anyCallProxy The address to update.
  function updateAnyCallProxy(address _anyCallProxy) external onlyOwner {
    // solhint-disable-next-line reason-string
    require(_anyCallProxy != address(0), "CrossChainCallBase: zero address");

    anyCallProxy = _anyCallProxy;

    emit UpdateAnyCallProxy(_anyCallProxy);
  }

  /// @notice Update CrossChainCallProxy contract.
  /// @param _crossChainCallProxy The address to update.
  function updateCrossChainCallProxy(address _crossChainCallProxy) external onlyOwner {
    // solhint-disable-next-line reason-string
    require(_crossChainCallProxy != address(0), "CrossChainCallBase: zero address");

    crossChainCallProxy = _crossChainCallProxy;

    emit UpdateCrossChainCallProxy(_crossChainCallProxy);
  }

  /// @notice Transfers ownership of the contract to a new account (`newOwner`).
  /// @dev Can only be called by the current owner.
  /// @param _owner The address of new owner.
  function transferOwnership(address _owner) public onlyOwner {
    // solhint-disable-next-line reason-string
    require(_owner != address(0), "CrossChainCallBase: zero address");

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

  /// @dev Internal function to bridge aCRV to target chain.
  /// @param _recipient The address of recipient will receive the aCRV.
  /// @param _totalAmount The total amount of aCRV to bridge.
  /// @return _bridgeAmount The total amount of aCRV bridged, fees are included.
  /// @return _totalFee The total amount of aCRV fee charged by Bridge.
  function _bridgeACRV(address _recipient, uint256 _totalAmount)
    internal
    virtual
    returns (uint256 _bridgeAmount, uint256 _totalFee)
  {}

  /// @dev Internal function to bridge CRV to target chain.
  /// @param _recipient The address of recipient will receive the CRV.
  /// @param _totalAmount The total amount of CRV to bridge.
  /// @return _bridgeAmount The total amount of CRV bridged, fees are included.
  /// @return _totalFee The total amount of CRV fee charged by Bridge.
  function _bridgeCRV(address _recipient, uint256 _totalAmount)
    internal
    virtual
    returns (uint256 _bridgeAmount, uint256 _totalFee)
  {}

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
