// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;
pragma abicoder v2;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

import "./YieldStrategyBase.sol";
import "../interfaces/ICurveSwapPool.sol";
import "../interfaces/IConcentratorVault.sol";
import "../../interfaces/IAladdinCRV.sol";
import "../../interfaces/IZap.sol";

// solhint-disable reason-string

/// @title ConcentratorStrategy Strategy for CLever.
///
/// @author 0xChiaki
///
/// @dev The gas usage is very high when combining CLever and Concentrator, we need a batch deposit version.
contract ConcentratorStrategy is Ownable, YieldStrategyBase {
  using SafeERC20 for IERC20;

  uint256 internal constant PRECISION = 1e9;

  /// @dev The address of aCRV on mainnet.
  // solhint-disable-next-line const-name-snakecase
  address internal constant aCRV = 0x2b95A1Dcc3D405535f9ed33c219ab38E8d7e0884;

  /// @dev The address of cvxCRV on mainnet.
  // solhint-disable-next-line const-name-snakecase
  address internal constant cvxCRV = 0x62B9c7356A2Dc64a1969e19C23e4f579F9810Aa7;

  /// @dev The address of Concentrator Vault on mainnet.
  address internal constant CONCENTRATOR_VAULT = 0xc8fF37F7d057dF1BB9Ad681b53Fa4726f268E0e8;

  /// @notice The address of zap contract.
  address public zap;

  /// @notice The address of curve pool for corresponding yield token.
  address public curvePool;

  uint256 public pid;

  uint256 public percentage;

  constructor(
    uint256 _pid,
    uint256 _percentage,
    address _curvePool,
    address _yieldToken,
    address _underlyingToken,
    address _operator
  ) YieldStrategyBase(_yieldToken, _underlyingToken, _operator) {
    require(_curvePool != address(0), "ConcentratorStrategy: zero address");
    require(_percentage <= PRECISION, "ConcentratorStrategy: percentage too large");

    pid = _pid;
    percentage = _percentage;
    curvePool = _curvePool;

    // The Concentrator Vault is maintained by our team, it's safe to approve uint256.max.
    IERC20(_yieldToken).safeApprove(CONCENTRATOR_VAULT, uint256(-1));
  }

  /// @inheritdoc IYieldStrategy
  function underlyingPrice() public view override returns (uint256) {
    return ICurveSwapPool(curvePool).get_virtual_price();
  }

  /// @inheritdoc IYieldStrategy
  ///
  /// @dev It is just an estimation, not accurate amount.
  function totalUnderlyingToken() external view override returns (uint256) {
    return (_totalYieldToken() * underlyingPrice()) / 1e18;
  }

  /// @inheritdoc IYieldStrategy
  function totalYieldToken() external view override returns (uint256) {
    return _totalYieldToken();
  }

  /// @inheritdoc IYieldStrategy
  function deposit(
    address,
    uint256 _amount,
    bool _isUnderlying
  ) external virtual override onlyOperator returns (uint256 _yieldAmount) {
    _yieldAmount = _zapBeforeDeposit(_amount, _isUnderlying);

    IConcentratorVault(CONCENTRATOR_VAULT).deposit(pid, _yieldAmount);
  }

  /// @inheritdoc IYieldStrategy
  function withdraw(
    address _recipient,
    uint256 _amount,
    bool _asUnderlying
  ) external virtual override onlyOperator returns (uint256 _returnAmount) {
    _amount = _withdrawFromConcentrator(pid, _amount);

    _returnAmount = _zapAfterWithdraw(_recipient, _amount, _asUnderlying);
  }

  /// @inheritdoc IYieldStrategy
  function harvest()
    external
    virtual
    override
    onlyOperator
    returns (
      uint256 _underlyingAmount,
      address[] memory _rewardTokens,
      uint256[] memory _amounts
    )
  {
    // 1. claim aCRV from Concentrator Vault
    uint256 _aCRVAmount = IConcentratorVault(CONCENTRATOR_VAULT).claim(pid, 0, IConcentratorVault.ClaimOption.Claim);

    address _underlyingToken = underlyingToken;
    // 2. sell part of aCRV as underlying token
    if (percentage > 0) {
      uint256 _sellAmount = (_aCRVAmount * percentage) / PRECISION;
      _aCRVAmount -= _sellAmount;

      address _zap;
      uint256 _cvxCRVAmount = IAladdinCRV(aCRV).withdraw(_zap, _aCRVAmount, 0, IAladdinCRV.WithdrawOption.Withdraw);
      _underlyingAmount = IZap(_zap).zap(cvxCRV, _cvxCRVAmount, _underlyingToken, 0);
    }

    // 3. transfer rewards to operator
    if (_underlyingAmount > 0) {
      IERC20(_underlyingToken).safeTransfer(msg.sender, _underlyingAmount);
    }
    if (_aCRVAmount > 0) {
      IERC20(aCRV).safeTransfer(msg.sender, _aCRVAmount);
    }

    _rewardTokens = new address[](1);
    _rewardTokens[0] = aCRV;

    _amounts = new uint256[](1);
    _amounts[0] = _aCRVAmount;
  }

  /// @inheritdoc IYieldStrategy
  function migrate(address _strategy) external virtual override onlyOperator returns (uint256 _yieldAmount) {
    IConcentratorVault(CONCENTRATOR_VAULT).withdrawAllAndClaim(pid, 0, IConcentratorVault.ClaimOption.None);

    address _yieldToken = yieldToken;
    _yieldAmount = IERC20(_yieldToken).balanceOf(address(this));
    IERC20(_yieldToken).safeTransfer(_strategy, _yieldAmount);
  }

  /// @inheritdoc IYieldStrategy
  function onMigrateFinished(uint256 _yieldAmount) external virtual override onlyOperator {
    IConcentratorVault(CONCENTRATOR_VAULT).deposit(pid, _yieldAmount);
  }

  function updatePercentage(uint256 _percentage) external onlyOwner {
    require(_percentage <= PRECISION, "ConcentratorStrategy: percentage too large");

    percentage = _percentage;
  }

  function _withdrawFromConcentrator(uint256 _pid, uint256 _amount) internal returns (uint256) {
    IConcentratorVault.PoolInfo memory _poolInfo = IConcentratorVault(CONCENTRATOR_VAULT).poolInfo(_pid);
    uint256 _shares = (_amount * _poolInfo.totalShare) / _poolInfo.totalUnderlying;

    // @note reuse variable `_amount` to indicate the amount of yield token withdrawn.
    (_amount, ) = IConcentratorVault(CONCENTRATOR_VAULT).withdrawAndClaim(
      _pid,
      _shares,
      0,
      IConcentratorVault.ClaimOption.None
    );
    return _amount;
  }

  function _zapBeforeDeposit(uint256 _amount, bool _isUnderlying) internal returns (uint256) {
    if (_isUnderlying) {
      address _zap = zap;
      address _underlyingToken = underlyingToken;
      IERC20(_underlyingToken).safeTransfer(_zap, _amount);
      return IZap(_zap).zap(_underlyingToken, _amount, yieldToken, 0);
    } else {
      return _amount;
    }
  }

  function _zapAfterWithdraw(
    address _recipient,
    uint256 _amount,
    bool _asUnderlying
  ) internal returns (uint256) {
    address _token = yieldToken;
    if (_asUnderlying) {
      address _zap = zap;
      address _underlyingToken = underlyingToken;
      IERC20(_token).safeTransfer(_zap, _amount);
      _amount = IZap(_zap).zap(_token, _amount, _underlyingToken, 0);
      _token = _underlyingToken;
    }
    IERC20(_token).safeTransfer(_recipient, _amount);
    return _amount;
  }

  function _totalYieldTokenInConcentrator(uint256 _pid) internal view returns (uint256) {
    IConcentratorVault.PoolInfo memory _poolInfo = IConcentratorVault(CONCENTRATOR_VAULT).poolInfo(_pid);
    IConcentratorVault.UserInfo memory _userInfo = IConcentratorVault(CONCENTRATOR_VAULT).userInfo(_pid, address(this));
    if (_userInfo.shares == 0) return 0;
    return (uint256(_userInfo.shares) * _poolInfo.totalUnderlying) / _poolInfo.totalShare;
  }

  function _totalYieldToken() internal view virtual returns (uint256) {
    return _totalYieldTokenInConcentrator(pid);
  }
}
