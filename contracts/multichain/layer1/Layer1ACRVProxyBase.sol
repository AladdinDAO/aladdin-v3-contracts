// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;
pragma abicoder v2;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

import "../CrossChainCallBase.sol";
import "../../misc/Multicall.sol";

import "../../interfaces/IAladdinCRV.sol";
import "../interfaces/ICrossChainCallProxy.sol";
import "../interfaces/ILayer2CRVDepositor.sol";
import "../interfaces/ILayer1ACRVProxy.sol";

// solhint-disable no-empty-blocks
abstract contract Layer1ACRVProxyBase is CrossChainCallBase, Multicall, ILayer1ACRVProxy {
  using SafeERC20 for IERC20;

  event Deposit(
    uint256 _executionId,
    uint256 _targetChain,
    address _recipient,
    uint256 _crvAmount,
    uint256 _acrvAmount,
    uint256 _acrvFee
  );

  event Redeem(
    uint256 _executionId,
    uint256 _targetChain,
    address _recipient,
    uint256 _acrvAmount,
    uint256 _crvAmount,
    uint256 _crvFee
  );

  /// @dev The denominator used to calculate cross chain fee.
  uint256 internal constant FEE_DENOMINATOR = 1e9;
  /// @dev The address of AladdinCRV contract.
  address internal constant ACRV = 0x2b95A1Dcc3D405535f9ed33c219ab38E8d7e0884;
  /// @dev The address of CRV.
  address internal constant CRV = 0xD533a949740bb3306d119CC777fa900bA034cd52;

  /// @notice The target chain id to interact.
  uint256 public targetChain;

  function _initialize(
    uint256 _targetChain,
    address _anyCallProxy,
    address _crossChainCallProxy,
    address _owner
  ) internal {
    // solhint-disable-next-line reason-string
    require(_targetChain != _getChainId(), "Layer1ACRVProxy: invalid target chain");

    CrossChainCallBase._initialize(_anyCallProxy, _crossChainCallProxy, _owner);

    targetChain = _targetChain;
  }

  /********************************** Mutated Functions **********************************/

  /// @notice See {ILayer1ACRVProxy-deposit}
  function deposit(
    uint256 _executionId,
    uint256 _targetChain,
    address _recipient,
    uint256 _crvAmount,
    address _callback
  ) external virtual override onlyAnyCallProxy {
    // do nothing, when amount is zero.
    // solhint-disable-next-line reason-string
    require(_crvAmount > 0, "Layer1ACRVProxy: deposit zero amount");
    // solhint-disable-next-line reason-string
    require(_targetChain == targetChain, "Layer1ACRVProxy: target chain mismatch");

    {
      uint256 _balance = IERC20(CRV).balanceOf(address(this));
      // solhint-disable-next-line reason-string
      require(_balance > 0, "Layer1ACRVProxy: insufficient CRV to deposit");
      // in case that the fee calculation in layer2 is wrong.
      if (_balance < _crvAmount) {
        _crvAmount = _balance;
      }
    }

    // 1. deposit CRV to aCRV
    IERC20(CRV).safeApprove(ACRV, 0);
    IERC20(CRV).safeApprove(ACRV, _crvAmount);
    IAladdinCRV(ACRV).deposit(address(this), _crvAmount);

    // 2. send aCRV to source chain
    (uint256 _bridgeAmount, uint256 _totalFee) = _bridgeACRV(
      _recipient,
      // use aCRV balance, in case some dust aCRV left in last deposit.
      IERC20(ACRV).balanceOf(address(this)),
      _targetChain
    );

    // 3. cross chain call to notify
    if (_callback != address(0)) {
      bytes memory _data = abi.encodeWithSelector(
        ILayer2CRVDepositor.finalizeDeposit.selector,
        _executionId,
        _crvAmount,
        _bridgeAmount,
        _totalFee
      );
      ICrossChainCallProxy(crossChainCallProxy).crossChainCall(_callback, _data, address(0), _targetChain);
    }

    emit Deposit(_executionId, _targetChain, _recipient, _crvAmount, _bridgeAmount, _totalFee);
  }

  /// @notice See {ILayer1ACRVProxy-redeem}
  function redeem(
    uint256 _executionId,
    uint256 _targetChain,
    address _recipient,
    uint256 _acrvAmount,
    uint256 _minCRVAmount,
    address _callback
  ) external virtual override onlyAnyCallProxy {
    // do nothing, when amount is zero.
    // solhint-disable-next-line reason-string
    require(_acrvAmount > 0, "Layer1ACRVProxy: deposit zero amount");
    // solhint-disable-next-line reason-string
    require(_targetChain == targetChain, "Layer1ACRVProxy: target chain mismatch");

    // 1. redeem CRV from aCRV.
    uint256 _totalAmount = IAladdinCRV(ACRV).withdraw(
      address(this),
      _acrvAmount,
      _minCRVAmount,
      IAladdinCRV.WithdrawOption.WithdrawAsCRV
    );

    // 2. bridge CRV to recipient in target chain.
    (uint256 _bridgeAmount, uint256 _totalFee) = _bridgeCRV(_recipient, _totalAmount, _targetChain);

    // 3. cross chain call to notify
    if (_callback != address(0)) {
      bytes memory _data = abi.encodeWithSelector(
        ILayer2CRVDepositor.finalizeRedeem.selector,
        _executionId,
        _acrvAmount,
        _bridgeAmount,
        _totalFee
      );
      ICrossChainCallProxy(crossChainCallProxy).crossChainCall(_callback, _data, address(0), _targetChain);
    }

    emit Redeem(_executionId, _targetChain, _recipient, _acrvAmount, _bridgeAmount, _totalFee);
  }

  /********************************** Internal Functions **********************************/

  /// @dev Internal function to bridge aCRV to target chain.
  /// @param _recipient The address of recipient will receive the aCRV.
  /// @param _totalAmount The total amount of aCRV to bridge.
  /// @param _targetChain The target chain id.
  /// @return _bridgeAmount The total amount of aCRV bridged, fees are included.
  /// @return _totalFee The total amount of aCRV fee charged by Bridge.
  function _bridgeACRV(
    address _recipient,
    uint256 _totalAmount,
    uint256 _targetChain
  ) internal virtual returns (uint256 _bridgeAmount, uint256 _totalFee) {}

  /// @dev Internal function to bridge CRV to target chain.
  /// @param _recipient The address of recipient will receive the CRV.
  /// @param _totalAmount The total amount of CRV to bridge.
  /// @param _targetChain The target chain id.
  /// @return _bridgeAmount The total amount of CRV bridged, fees are included.
  /// @return _totalFee The total amount of CRV fee charged by Bridge.
  function _bridgeCRV(
    address _recipient,
    uint256 _totalAmount,
    uint256 _targetChain
  ) internal virtual returns (uint256 _bridgeAmount, uint256 _totalFee) {}
}
