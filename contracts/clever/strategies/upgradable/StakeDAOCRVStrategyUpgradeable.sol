// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;
pragma abicoder v2;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/SafeERC20Upgradeable.sol";

import "../YieldStrategyBase.sol";
import "../../../common/FeeCustomization.sol";
import "../../../concentrator/stakedao/interfaces/IStakeDAOCRVVault.sol";
import "../../../concentrator/stakedao/SdCRVLocker.sol";
import "../../../interfaces/IZap.sol";

contract StakeDAOCRVStrategyUpgradeable is OwnableUpgradeable, YieldStrategyBase, SdCRVLocker {
  using SafeERC20Upgradeable for IERC20Upgradeable;

  /// @dev The address of CRV Token.
  address private constant CRV = 0xD533a949740bb3306d119CC777fa900bA034cd52;

  /// @dev The address of SDT Token.
  address private constant SDT = 0x73968b9a57c6E53d41345FD57a6E6ae27d6CDB2F;

  // The address of 3CRV token.
  address private constant THREE_CRV = 0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490;

  /// @dev The type for withdraw fee in StakeDAOVaultBase
  bytes32 private constant VAULT_WITHDRAW_FEE_TYPE = keccak256("StakeDAOVaultBase.WithdrawFee");

  /// @dev The fee denominator used for rate calculation.
  uint256 private constant FEE_PRECISION = 1e9;

  /// @notice The address of zap contract.
  address public immutable zap;

  /// @dev The address of StakeDAOCRVVault on mainnet.
  address public immutable vault;

  // receive ETH from zap
  receive() external payable {}

  constructor(
    address _yieldToken,
    address _underlyingToken,
    address _operator,
    address _zap,
    address _vault
  ) YieldStrategyBase(_yieldToken, _underlyingToken, _operator) {
    zap = _zap;
    vault = _vault;
  }

  function initialize() external initializer {
    OwnableUpgradeable.__Ownable_init();

    // The StakeDAOCRVVault is maintained by our team, it's safe to approve uint256.max.
    IERC20Upgradeable(yieldToken).safeApprove(vault, uint256(-1));
    IERC20Upgradeable(underlyingToken).safeApprove(vault, uint256(-1));
  }

  /// @inheritdoc SdCRVLocker
  function withdrawLockTime() public view virtual override returns (uint256) {
    return SdCRVLocker(vault).withdrawLockTime();
  }

  /// @inheritdoc IYieldStrategy
  function underlyingPrice() external pure override returns (uint256) {
    return 1e18;
  }

  /// @inheritdoc IYieldStrategy
  function totalUnderlyingToken() external view override returns (uint256) {
    return IStakeDAOCRVVault(vault).balanceOf(address(this));
  }

  /// @inheritdoc IYieldStrategy
  function totalYieldToken() external view override returns (uint256) {
    return IStakeDAOCRVVault(vault).balanceOf(address(this));
  }

  /// @inheritdoc IYieldStrategy
  function deposit(
    address,
    uint256 _amount,
    bool _isUnderlying
  ) external override onlyOperator returns (uint256 _yieldAmount) {
    if (_isUnderlying) {
      return IStakeDAOCRVVault(vault).depositWithCRV(_amount, address(this), 0);
    } else {
      IStakeDAOCRVVault(vault).deposit(_amount, address(this));
      return _amount;
    }
  }

  /// @inheritdoc IYieldStrategy
  function withdraw(
    address _recipient,
    uint256 _amount,
    bool _asUnderlying
  ) external override onlyOperator returns (uint256 _returnAmount) {
    require(!_asUnderlying, "cannot withdraw as underlying");

    // vault has withdraw fee, we need to subtract from it
    IStakeDAOCRVVault(vault).withdraw(_amount, address(this));
    uint256 _vaultWithdrawFee = FeeCustomization(vault).getFeeRate(VAULT_WITHDRAW_FEE_TYPE, address(this));
    if (_vaultWithdrawFee > 0) {
      _vaultWithdrawFee = (_amount * _vaultWithdrawFee) / FEE_PRECISION;
      _amount = _amount - _vaultWithdrawFee;
    }

    _lockToken(_amount, _recipient);

    return _amount;
  }

  /// @inheritdoc IYieldStrategy
  function harvest()
    external
    override
    onlyOperator
    returns (
      uint256 _underlyingAmount,
      address[] memory _rewardTokens,
      uint256[] memory _amounts
    )
  {
    // 1.1 claim SDT/CRV/3CRV rewards
    uint256 _amountSDT = IERC20Upgradeable(SDT).balanceOf(address(this));
    uint256 _amountCRV = IERC20Upgradeable(CRV).balanceOf(address(this));
    uint256 _amount3CRV = IERC20Upgradeable(THREE_CRV).balanceOf(address(this));
    IStakeDAOCRVVault(vault).claim(address(this), address(this));
    _amountSDT = IERC20Upgradeable(SDT).balanceOf(address(this)) - _amountSDT;
    _amountCRV = IERC20Upgradeable(CRV).balanceOf(address(this)) - _amountCRV;
    _amount3CRV = IERC20Upgradeable(THREE_CRV).balanceOf(address(this)) - _amount3CRV;

    // 1.2 sell SDT/3CRV to ETH
    uint256 _amountETH;
    address _zap = zap;
    if (_amountSDT > 0) {
      IERC20Upgradeable(SDT).safeTransfer(_zap, _amountSDT);
      _amountETH += IZap(_zap).zap(SDT, _amountSDT, address(0), 0);
    }
    if (_amountSDT > 0) {
      IERC20Upgradeable(THREE_CRV).safeTransfer(_zap, _amountSDT);
      _amountETH += IZap(_zap).zap(THREE_CRV, _amountSDT, address(0), 0);
    }

    // 1.3 sell ETH to CRV
    if (_amountETH > 0) {
      _amountCRV += IZap(_zap).zap{ value: _amountETH }(address(0), _amountETH, CRV, 0);
    }

    if (_amountCRV > 0) {
      IERC20Upgradeable(CRV).safeTransfer(msg.sender, _amountCRV);
    }

    return (_amountCRV, new address[](0), new uint256[](0));
  }

  /// @inheritdoc IYieldStrategy
  function migrate(address _strategy) external virtual override onlyOperator returns (uint256 _yieldAmount) {
    _yieldAmount = IStakeDAOCRVVault(vault).balanceOf(address(this));
    IStakeDAOCRVVault(vault).withdraw(_yieldAmount, address(this));

    _lockToken(_yieldAmount, _strategy);
  }

  /// @inheritdoc SdCRVLocker
  function _unlockToken(uint256 _amount, address _recipient) internal virtual override {
    SdCRVLocker(vault).withdrawExpired(address(this), address(this));
    IERC20Upgradeable(yieldToken).safeTransfer(_recipient, _amount);
  }
}
