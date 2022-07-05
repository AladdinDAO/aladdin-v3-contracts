// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;
pragma abicoder v2;

import "@openzeppelin/contracts/proxy/Initializable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

import "./Layer1ACRVProxyBase.sol";

import "../interfaces/IAnyswapRouter.sol";

/// @dev The default implementation of Layer1ACRVProxy,
///      bridge aCRV using Multichain (Previously Anyswap).
contract Layer1ACRVProxy is Initializable, Layer1ACRVProxyBase {
  using SafeERC20 for IERC20;

  event UpdateAnyswapRouter(address indexed _anyswapRouter);

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

  /// @notice aCRV cross chain info.
  CrossChainInfo public aCRVCrossChainInfo;

  /// @notice  CRV cross chain info.
  // solhint-disable-next-line var-name-mixedcase
  CrossChainInfo public CRVCrossChainInfo;

  function initialize(
    uint256 _targetChain,
    address _anyCallProxy,
    address _anyswapRouter,
    address _crossChainCallProxy,
    address _owner
  ) external initializer {
    Layer1ACRVProxyBase._initialize(_targetChain, _anyCallProxy, _crossChainCallProxy, _owner);
    // solhint-disable-next-line reason-string
    require(_anyswapRouter != address(0), "Layer1ACRVProxy: zero address");

    anyswapRouter = _anyswapRouter;
  }

  /********************************** Restricted Functions **********************************/

  /// @notice Update CrossChainInfo for ACRV or CRV.
  /// @param _token The address of token to update.
  /// @param _info The CrossChainInfo to update.
  function updateCrossChainInfo(address _token, CrossChainInfo memory _info) external onlyOwner {
    // solhint-disable-next-line reason-string
    require(_token == ACRV || _token == CRV, "Layer1ACRVProxy: invalid token");
    // solhint-disable-next-line reason-string
    require(_info.feePercentage <= FEE_DENOMINATOR, "Layer1ACRVProxy: fee percentage too large");
    // solhint-disable-next-line reason-string
    require(_info.minCrossChainFee <= _info.maxCrossChainFee, "Layer1ACRVProxy: invalid cross chain fee");
    // solhint-disable-next-line reason-string
    require(_info.minCrossChainAmount <= _info.maxCrossChainAmount, "Layer1ACRVProxy: invalid cross chain amount");

    if (_token == ACRV) {
      aCRVCrossChainInfo = _info;
    } else {
      CRVCrossChainInfo = _info;
    }
  }

  /// @notice Update AnyswapRouter contract.
  /// @param _anyswapRouter The address to update.
  function updateAnyswapRouter(address _anyswapRouter) external onlyOwner {
    // solhint-disable-next-line reason-string
    require(_anyswapRouter != address(0), "Layer1ACRVProxy: zero address");

    anyswapRouter = _anyswapRouter;

    emit UpdateAnyswapRouter(_anyswapRouter);
  }

  /********************************** Internal Functions **********************************/

  /// @dev See {CrossChainCallBase-_bridgeACRV}
  function _bridgeACRV(address _recipient, uint256 _totalAmount)
    internal
    virtual
    override
    returns (uint256 _bridgeAmount, uint256 _totalFee)
  {
    (_bridgeAmount, _totalFee) = _bridgeWithAnyswapRouter(ANY_ACRV, ACRV, _recipient, _totalAmount, aCRVCrossChainInfo);
  }

  /// @dev See {CrossChainCallBase-_bridgeCRV}
  function _bridgeCRV(address, uint256) internal virtual override returns (uint256, uint256) {
    revert("bridge CRV unsupported");
  }

  /// @dev Internal function to bridge some token to target chain.
  /// @param _token The address of the token to bridge.
  /// @param _recipient The address of recipient will receive the token.
  /// @param _totalAmount The total amount of token to bridge.
  /// @return _bridgeAmount The total amount of token bridged, fees are included.
  /// @return _totalFee The total amount of token fee charged by Bridge.
  function _bridgeWithAnyswapRouter(
    address _token,
    address _underlying,
    address _recipient,
    uint256 _totalAmount,
    CrossChainInfo memory _info
  ) internal returns (uint256 _bridgeAmount, uint256 _totalFee) {
    // solhint-disable-next-line reason-string
    require(_totalAmount >= _info.minCrossChainAmount, "Layer1ACRVProxy: insufficient cross chain amount");

    address _anyswapRouter = anyswapRouter;
    IERC20(_underlying).safeApprove(_anyswapRouter, 0);
    IERC20(_underlying).safeApprove(_anyswapRouter, _totalAmount);

    uint256 _targetChain = targetChain;
    _bridgeAmount = _totalAmount;
    // batch swap in case the amount is too large for single cross chain.
    while (_bridgeAmount > 0 && _bridgeAmount >= _info.minCrossChainAmount) {
      uint256 _amount = _info.maxCrossChainAmount;
      if (_amount > _bridgeAmount) _amount = _bridgeAmount;
      IAnyswapRouter(_anyswapRouter).anySwapOutUnderlying(_token, _recipient, _amount, _targetChain);

      _totalFee += _computeBridgeFee(_amount, _info); // addition is safe
      _bridgeAmount -= _amount; // subtraction is safe
    }

    _bridgeAmount = _totalAmount - _bridgeAmount; // subtraction is safe
  }

  function _computeBridgeFee(uint256 _amount, CrossChainInfo memory _info) internal view virtual returns (uint256) {
    uint256 _fee = (_amount * _info.feePercentage) / FEE_DENOMINATOR; // multiplication is safe
    if (_fee < _info.minCrossChainFee) _fee = _info.minCrossChainFee;
    if (_fee > _info.maxCrossChainFee) _fee = _info.maxCrossChainFee;
    return _fee;
  }
}
