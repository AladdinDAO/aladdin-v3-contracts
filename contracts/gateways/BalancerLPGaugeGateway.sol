// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;
pragma abicoder v2;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

import "../interfaces/concentrator/IAladdinCRV.sol";
import "../interfaces/IBalancerVault.sol";
import "../zap/TokenZapLogic.sol";
import "./ZapGatewayBase.sol";

interface IGauge {
  // solhint-disable-next-line func-name-mixedcase
  function lp_token() external view returns (address);

  function deposit(
    uint256 _value,
    address _recipient,
    // solhint-disable-next-line var-name-mixedcase
    bool _claim_rewards
  ) external;
}

contract BalancerLPGaugeGateway is ZapGatewayBase {
  using SafeERC20 for IERC20;
  using SafeMath for uint256;

  /// @dev The address of CRV token.
  address private constant CRV = 0xD533a949740bb3306d119CC777fa900bA034cd52;

  /// @dev The address of cvxCRV token.
  // solhint-disable-next-line const-name-snakecase
  address private constant cvxCRV = 0x62B9c7356A2Dc64a1969e19C23e4f579F9810Aa7;

  /// @dev The address of aCRV token.
  // solhint-disable-next-line const-name-snakecase
  address private constant aCRV = 0x2b95A1Dcc3D405535f9ed33c219ab38E8d7e0884;

  /// @dev The address of Balancer V2 Vault.
  address private constant BALANCER_VAULT = 0xBA12222222228d8Ba445958a75a0704d566BF2C8;

  enum JoinKind {
    INIT,
    EXACT_TOKENS_IN_FOR_BPT_OUT,
    TOKEN_IN_FOR_EXACT_BPT_OUT,
    ALL_TOKENS_IN_FOR_EXACT_BPT_OUT
  }

  /// @notice The address of gauge contract.
  address public immutable gauge;

  /// @notice The address of CTR token.
  address public immutable ctr;

  /// @notice The address of Balancer LP token.
  address public immutable lpToken;

  /// @notice The pool id of the Balancer LP.
  bytes32 public immutable poolId;

  constructor(
    address _ctr,
    address _gauge,
    bytes32 _poolId,
    address _logic
  ) {
    address _lpToken = IGauge(_gauge).lp_token();

    ctr = _ctr;
    gauge = _gauge;
    lpToken = _lpToken;
    poolId = _poolId;
    logic = _logic;

    // make sure CRV can deposit to aCRV
    IERC20(CRV).safeApprove(aCRV, uint256(-1));

    // make sure cvxCRV can deposit to aCRV
    IERC20(cvxCRV).safeApprove(aCRV, uint256(-1));

    // make sure aCRV can add liquidity in Balancer
    IERC20(aCRV).safeApprove(BALANCER_VAULT, uint256(-1));

    // make sure CTR can add liquidity in Balancer
    IERC20(_ctr).safeApprove(BALANCER_VAULT, uint256(-1));

    // make sure Balancer LP can deposit in gauge
    IERC20(_lpToken).safeApprove(_gauge, uint256(-1));
  }

  /// @notice Deposit `_srcToken` into gauge contract with zap.
  /// @param _srcToken The address of start token. Use zero address, if you want deposit with ETH.
  /// @param _amountIn The amount of `_srcToken` to deposit.
  /// @param _routes The routes used to do zap.
  /// @param _minLPOut The minimum amount of lp token should receive.
  /// @return The amount of Balancer LP received.
  function deposit(
    address _srcToken,
    uint256 _amountIn,
    uint256[] calldata _routes,
    uint256 _minLPOut
  ) external payable returns (uint256) {
    // 1. transfer srcToken into this contract
    _amountIn = _transferTokenIn(_srcToken, _amountIn);

    // 2. zap and join as Balancer LP
    uint256 _amountLP;
    if (_srcToken == ctr || _srcToken == aCRV) {
      // @note source token is CTR/aCRV, can join directly
      _amountLP = _joinBalancerPool(_amountIn, _minLPOut, _srcToken == ctr);
    } else {
      // @note source token is not CTR, we should zap into aCRV first
      uint256 _amountACRV;
      if (_srcToken == cvxCRV) {
        // deposit cvxCRV as aCRV
        _amountACRV = IAladdinCRV(aCRV).deposit(address(this), _amountIn);
      } else {
        // zap source token to CRV
        uint256 _amountCRV = _zap(_routes, _amountIn);
        require(IERC20(CRV).balanceOf(address(this)) >= _amountCRV, "zap to CRV failed");

        // deposit CRV as aCRV
        _amountACRV = IAladdinCRV(aCRV).depositWithCRV(address(this), _amountCRV);
      }

      // join as Balancer LP
      _amountLP = _joinBalancerPool(_amountACRV, _minLPOut, false);
    }

    // 3. deposit to gauge
    IGauge(gauge).deposit(_amountLP, msg.sender, false);

    return _amountLP;
  }

  /// @dev Internal function to join as Balance Pool LP.
  /// @param _amount The amount of token to join.
  /// @param _minLPOut The minimum amount of LP token to receive.
  /// @param _isCTR Whether the input token is CTR.
  /// @return The amount of Balancer LP received.
  function _joinBalancerPool(
    uint256 _amount,
    uint256 _minLPOut,
    bool _isCTR
  ) internal returns (uint256) {
    IBalancerVault.JoinPoolRequest memory _request;
    uint256[] memory _amountsIn = new uint256[](2);
    _request.assets = new address[](2);
    if (ctr < aCRV) {
      if (_isCTR) _amountsIn[0] = _amount;
      else _amountsIn[1] = _amount;
      _request.assets[0] = ctr;
      _request.assets[1] = aCRV;
    } else {
      if (_isCTR) _amountsIn[1] = _amount;
      else _amountsIn[0] = _amount;
      _request.assets[0] = aCRV;
      _request.assets[1] = ctr;
    }

    _request.maxAmountsIn = new uint256[](2);
    _request.maxAmountsIn[0] = uint256(-1);
    _request.maxAmountsIn[1] = uint256(-1);
    _request.userData = abi.encode(JoinKind.EXACT_TOKENS_IN_FOR_BPT_OUT, _amountsIn, _minLPOut);

    uint256 _balance = IERC20(lpToken).balanceOf(address(this));
    IBalancerVault(BALANCER_VAULT).joinPool(poolId, address(this), address(this), _request);
    return IERC20(lpToken).balanceOf(address(this)).sub(_balance);
  }
}
