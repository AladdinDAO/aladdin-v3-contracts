// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;
pragma abicoder v2;

import { SafeMath } from "@openzeppelin/contracts/math/SafeMath.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

import { IFxTokenWrapper } from "../../interfaces/f(x)/IFxTokenWrapper.sol";
import { IBalancerVault } from "../../interfaces/IBalancerVault.sol";
import { IBalancerPool } from "../../interfaces/IBalancerPool.sol";

contract FxTokenBalancerV2Wrapper is IFxTokenWrapper {
  using SafeERC20 for IERC20;
  using SafeMath for uint256;

  /*************
   * Constants *
   *************/

  /// @inheritdoc IFxTokenWrapper
  /// @dev The src is FX token.
  address public immutable override src;

  /// @inheritdoc IFxTokenWrapper
  /// @dev The dst is balancer LP token.
  address public immutable override dst;

  /// @notice The token index of src token in Balancer pool.
  uint256 public immutable srcIndex;

  /// @notice The pool id of the balancer pool.
  bytes32 public immutable poolId;

  /// @dev The address of Balancer V2 Vault
  address private constant BALANCER_VAULT = 0xBA12222222228d8Ba445958a75a0704d566BF2C8;

  /// @dev The address of WETH token.
  address internal constant WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;

  /***************
   * Constructor *
   ***************/

  constructor(address _src, address _dst) {
    IERC20(_src).safeApprove(BALANCER_VAULT, uint256(-1));

    bytes32 _poolId = IBalancerPool(_dst).getPoolId();
    (address[] memory _assets, , ) = IBalancerVault(BALANCER_VAULT).getPoolTokens(_poolId);
    require(_assets.length == 2, "invalid lp token");
    require(_assets[0] == _src || _assets[1] == _src, "pool without src");
    require(_assets[0] == WETH || _assets[1] == WETH, "pool without WETH");

    src = _src;
    dst = _dst;
    srcIndex = _assets[0] == _src ? 0 : 1;
    poolId = _poolId;
  }

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @inheritdoc IFxTokenWrapper
  function wrap(uint256 _amount) external override returns (uint256) {
    address[] memory _assets = new address[](2);
    uint256[] memory _amounts = new uint256[](2);
    _assets[srcIndex] = src;
    _assets[1 - srcIndex] = WETH;
    _amounts[srcIndex] = _amount;

    uint256 _balance = IERC20(dst).balanceOf(msg.sender);
    IBalancerVault(BALANCER_VAULT).joinPool(
      poolId,
      address(this),
      msg.sender,
      IBalancerVault.JoinPoolRequest({
        assets: _assets,
        maxAmountsIn: _amounts,
        userData: abi.encode(IBalancerVault.JoinKind.EXACT_TOKENS_IN_FOR_BPT_OUT, _amounts, 0),
        fromInternalBalance: false
      })
    );
    return IERC20(dst).balanceOf(msg.sender).sub(_balance);
  }

  /// @inheritdoc IFxTokenWrapper
  function unwrap(uint256 _amount) external override returns (uint256) {
    address[] memory _assets = new address[](2);
    uint256[] memory _amounts = new uint256[](2);
    _assets[srcIndex] = src;
    _assets[1 - srcIndex] = WETH;

    uint256 _balance = IERC20(src).balanceOf(msg.sender);
    IBalancerVault(BALANCER_VAULT).exitPool(
      poolId,
      address(this),
      msg.sender,
      IBalancerVault.ExitPoolRequest({
        assets: _assets,
        minAmountsOut: _amounts,
        userData: abi.encode(IBalancerVault.ExitKind.EXACT_BPT_IN_FOR_ONE_TOKEN_OUT, _amount, srcIndex),
        toInternalBalance: false
      })
    );
    return IERC20(src).balanceOf(msg.sender).sub(_balance);
  }
}
