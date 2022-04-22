// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;
pragma abicoder v2;

import "@openzeppelin/contracts/proxy/Initializable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

import "./Layer1ACRVProxyBase.sol";

/// @dev The default implementation of Layer1ACRVProxy,
///      bridge CRV/aCRV using Multichain (Previously Anyswap).
contract Layer1ACRVDefaultProxy is Initializable, Layer1ACRVProxyBase {
  using SafeERC20 for IERC20;

  struct CrossChainInfo {
    // The cross chain fee percentage.
    uint32 feePercentage;
    // The minimum amount of token to pay as cross chain fee.
    uint112 minCrossChainFee;
    // The maximum amount of token to pay as cross chain fee.
    uint112 maxCrossChainFee;
    // The minimum amount of token allowed to cross chain.
    uint128 minCrossChainAmount;
    // The maximum amount of token allowed to cross chain.
    uint128 maxCrossChainAmount;
  }

  /// @notice The address of AnyswapRouter.
  address public anyswapRouter;

  /// @notice Mapping from chain id to aCRV cross chain info.
  mapping(uint256 => CrossChainInfo) public aCRVCrossChainInfo;

  /// @notice Mapping from chain id to CRV cross chain info.
  // solhint-disable-next-line var-name-mixedcase
  mapping(uint256 => CrossChainInfo) public CRVCrossChainInfo;

  function initialize(
    uint256 _targetChain,
    address _anyCallProxy,
    address _anyswapRouter,
    address _crossChainCallProxy,
    address _owner
  ) external initializer {
    Layer1ACRVProxyBase._initialize(_targetChain, _anyCallProxy, _crossChainCallProxy, _owner);
    // solhint-disable-next-line reason-string
    require(_anyswapRouter != address(0), "Layer1ACRVDefaultProxy: zero address");

    anyswapRouter = _anyswapRouter;
  }

  /********************************** Restricted Functions **********************************/

  /// @notice Update CrossChainInfo for ACRV or CRV.
  /// @param _token The address of token to update.
  /// @param _chainId The chain id to update.
  /// @param _info The CrossChainInfo to update.
  function updateCrossChainInfo(
    address _token,
    uint256 _chainId,
    CrossChainInfo memory _info
  ) external onlyOwner {
    // solhint-disable-next-line reason-string
    require(_token == ACRV || _token == CRV, "Layer1ACRVDefaultProxy: invalid token");
    // solhint-disable-next-line reason-string
    require(_info.feePercentage <= FEE_DENOMINATOR, "Layer1ACRVDefaultProxy: fee percentage too large");
    // solhint-disable-next-line reason-string
    require(_info.minCrossChainFee <= _info.maxCrossChainFee, "Layer1ACRVDefaultProxy: invalid cross chain fee");
    // solhint-disable-next-line reason-string
    require(
      _info.minCrossChainAmount <= _info.maxCrossChainAmount,
      "Layer1ACRVDefaultProxy: invalid cross chain amount"
    );

    if (_token == ACRV) {
      aCRVCrossChainInfo[_chainId] = _info;
    } else {
      CRVCrossChainInfo[_chainId] = _info;
    }
  }

  /// @notice Update AnyswapRouter contract.
  /// @param _anyswapRouter The address to update.
  function updateAnyswapRouter(address _anyswapRouter) external onlyOwner {
    anyswapRouter = _anyswapRouter;
  }

  /********************************** Internal Functions **********************************/

  /// @dev See {Layer1ACRVProxyBase-_bridgeACRV}
  function _bridgeACRV(
    address _recipient,
    uint256 _totalAmount,
    uint256 _targetChain
  ) internal virtual override returns (uint256 _bridgeAmount, uint256 _totalFee) {
    CrossChainInfo memory _info = aCRVCrossChainInfo[_targetChain];

    (_bridgeAmount, _totalFee) = _bridge(ACRV, _recipient, _totalAmount, _targetChain, _info);
  }

  /// @dev See {Layer1ACRVProxyBase-_bridgeCRV}
  function _bridgeCRV(
    address _recipient,
    uint256 _totalAmount,
    uint256 _targetChain
  ) internal virtual override returns (uint256 _bridgeAmount, uint256 _totalFee) {
    CrossChainInfo memory _info = CRVCrossChainInfo[_targetChain];

    (_bridgeAmount, _totalFee) = _bridge(CRV, _recipient, _totalAmount, _targetChain, _info);
  }

  /// @dev Internal function to bridge some token to target chain.
  /// @param _token The address of the token to bridge.
  /// @param _recipient The address of recipient will receive the token.
  /// @param _totalAmount The total amount of token to bridge.
  /// @param _targetChain The target chain id.
  /// @return _bridgeAmount The total amount of token bridged, fees are included.
  /// @return _totalFee The total amount of token fee charged by Bridge.
  function _bridge(
    address _token,
    address _recipient,
    uint256 _totalAmount,
    uint256 _targetChain,
    CrossChainInfo memory _info
  ) private returns (uint256 _bridgeAmount, uint256 _totalFee) {
    // solhint-disable-next-line reason-string
    require(_totalAmount >= _info.minCrossChainAmount, "Layer1ACRVDefaultProxy: insufficient cross chain amount");

    address _anyswapRouter = anyswapRouter;
    IERC20(_token).safeApprove(_anyswapRouter, 0);
    IERC20(_token).safeApprove(_anyswapRouter, _totalAmount);

    _bridgeAmount = _totalAmount;
    // batch swap in case the amount is too large for single cross chain.
    while (_bridgeAmount >= _info.minCrossChainAmount) {
      uint256 _amount = _info.maxCrossChainAmount;
      if (_amount > _bridgeAmount) _amount = _bridgeAmount;
      IAnyswapRouter(_anyswapRouter).anySwapOutUnderlying(_token, _recipient, _amount, _targetChain);

      uint256 _fee = (_amount * _info.feePercentage) / FEE_DENOMINATOR; // multiplication is safe
      if (_fee < _info.minCrossChainFee) _fee = _info.minCrossChainFee;
      if (_fee > _info.maxCrossChainFee) _fee = _info.maxCrossChainFee;

      _totalFee += _fee; // addition is safe
      _bridgeAmount -= _amount; // subtraction is safe
    }

    _bridgeAmount = _totalAmount - _bridgeAmount; // subtraction is safe
  }
}
