// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";

import "./Layer1ACRVDefaultProxy.sol";

contract Layer1ACRVProxyFactory is Ownable {
  /// @notice The address of Layer1ACRVDefaultProxy contract.
  address public defaultProxyTemplate;
  /// @notice Mapping from target chain id to Layer1ACRVProxy
  mapping(uint256 => address) public aCRVProxy;

  constructor(address _defaultProxyTemplate) {
    // solhint-disable-next-line reason-string
    require(_defaultProxyTemplate != address(0), "Layer1ACRVProxyFactory: zero address");

    defaultProxyTemplate = _defaultProxyTemplate;
  }

  function deployDefaultProxy(
    uint256 _targetChain,
    address _anyCallProxy,
    address _anyswapRouter,
    address _crossChainCallProxy,
    address _owner
  ) external onlyOwner returns (address) {
    address _proxy = Clones.clone(defaultProxyTemplate);

    Layer1ACRVDefaultProxy(_proxy).initialize(
      _targetChain,
      _anyCallProxy,
      _anyswapRouter,
      _crossChainCallProxy,
      _owner
    );

    aCRVProxy[_targetChain] = _proxy;

    return _proxy;
  }

  function updateACRVProxy(uint256 _targetChain, address _proxy) external onlyOwner {
    aCRVProxy[_targetChain] = _proxy;
  }

  function updateDefaultProxyTemplate(address _defaultProxyTemplate) external onlyOwner {
    defaultProxyTemplate = _defaultProxyTemplate;
  }
}
