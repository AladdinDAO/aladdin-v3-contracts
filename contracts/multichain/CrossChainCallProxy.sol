// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import "@openzeppelin/contracts/access/Ownable.sol";

import "./interfaces/IAnyCallProxy.sol";
import "./interfaces/ICrossChainCallProxy.sol";

/// @dev This is a proxy contract to relay cross chain call to AnyCallProxy contract.
///      This contract should have the same address in all evm compatible chain.
contract CrossChainCallProxy is Ownable, ICrossChainCallProxy {
  /// @notice The address of AnyCallProxy.
  address public anyCallProxy;
  /// @notice Keep track the whitelist contracts.
  mapping(address => bool) public whitelist;

  modifier onlyWhitelist() {
    // solhint-disable-next-line reason-string
    require(whitelist[msg.sender], "CrossChainCallProxy: only whitelist");
    _;
  }

  constructor(address _anyCallProxy) {
    // solhint-disable-next-line reason-string
    require(_anyCallProxy != address(0), "CrossChainCallProxy: zero address");

    anyCallProxy = _anyCallProxy;
  }

  // solhint-disable-next-line no-empty-blocks
  receive() external payable {}

  /********************************** Mutated Functions **********************************/

  /// @notice Relay cross chain call to AnyCallProxy contract.
  /// @param _to The recipient of the cross chain call on `_toChainID`.
  /// @param _data The calldata supplied for the interaction with `_to`
  /// @param _fallback The address to call back on the originating chain if the cross chain interaction fails.
  /// @param _toChainID The target chain id to interact with
  function crossChainCall(
    address _to,
    bytes memory _data,
    address _fallback,
    uint256 _toChainID
  ) external override onlyWhitelist {
    IAnyCallProxy(anyCallProxy).anyCall(_to, _data, _fallback, _toChainID);
  }

  /********************************** Restricted Functions **********************************/

  /// @notice Withdraw execution budget from AnyCallProxy contract.
  /// @param _amount The amount of budget to withdraw.
  function withdraw(uint256 _amount) external onlyOwner {
    IAnyCallProxy(anyCallProxy).withdraw(_amount);

    // solhint-disable-next-line avoid-low-level-calls
    (bool success, ) = msg.sender.call{ value: _amount }("");
    // solhint-disable-next-line reason-string
    require(success, "CrossChainCallProxy: transfer failed");
  }

  /// @notice Update AnyCallProxy contract.
  /// @param _anyCallProxy The address to update.
  function updateAnyCallProxy(address _anyCallProxy) external onlyOwner {
    anyCallProxy = _anyCallProxy;
  }

  /// @notice Update whitelist contract can call `crossChainCall`.
  /// @param _whitelist The list of whitelist address to update.
  /// @param _status The status to update.
  function updateWhitelist(address[] memory _whitelist, bool _status) external onlyOwner {
    for (uint256 i = 0; i < _whitelist.length; i++) {
      whitelist[_whitelist[i]] = _status;
    }
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
}
