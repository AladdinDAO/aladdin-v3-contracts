// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/SafeERC20Upgradeable.sol";

import "../clever/interfaces/ICLeverCVXLocker.sol";
import "../clever/interfaces/IFurnace.sol";
import "../clever/interfaces/IMetaCLever.sol";
import "../clever/interfaces/IMetaFurnace.sol";
import "../zap/TokenZapLogic.sol";
import "./ZapGatewayUpgradeableBase.sol";

interface IMetaCLeverDetailed is IMetaCLever {
  function yieldStrategies(uint256 _strategyIndex)
    external
    view
    returns (
      // Whether the strategy is active.
      bool isActive,
      // The address of yield strategy contract.
      address strategy,
      // The address of underlying token.
      address underlyingToken,
      // The address of yield token.
      address yieldToken,
      // The total share of yield token of this strategy.
      uint256 totalShare,
      // The total amount of active yield tokens in CLever.
      uint256 activeYieldTokenAmount,
      // The total amount of yield token could be harvested.
      uint256 harvestableYieldTokenAmount,
      // The expected amount of underlying token should be deposited to this strategy.
      uint256 expectedUnderlyingTokenAmount
    );
}

contract FurnaceGateway is ZapGatewayUpgradeableBase {
  using SafeERC20Upgradeable for IERC20Upgradeable;

  /// @dev The address of CLever CVX token.
  // solhint-disable-next-line const-name-snakecase
  address private constant clevCVX = 0xf05e58fCeA29ab4dA01A495140B349F8410Ba904;

  /// @dev The address of CVX token.
  address private constant CVX = 0x4e3FBD56CD56c3e72c1403e103b45Db9da5B9D2B;

  /// @dev The address of Furnace for CVX.
  address private constant LEGACY_FURNACE = 0xCe4dCc5028588377E279255c0335Effe2d7aB72a;

  /// @dev The address of CLever for CVX.
  address private constant LEGACY_CLEVER = 0x96C68D861aDa016Ed98c30C810879F9df7c64154;

  modifier NonZeroDeposit(uint256 _amount) {
    require(_amount > 0, "deposit zero amount");
    _;
  }

  function initialize(address _logic) external initializer {
    _initialize(_logic);
  }

  /// @notice Deposit `_srcToken` into Legacy Furnace with zapping to clevCVX first.
  /// @param _srcToken The address of start token. Use zero address, if you want deposit with ETH.
  /// @param _amountIn The amount of `_srcToken` to deposit.
  /// @param _routes The routes used to do zap.
  /// @param _minOut The minimum amount of clevCVX should receive.
  /// @return The amount of clevCVX received.
  function depositIntoLegacyFurnace(
    address _srcToken,
    uint256 _amountIn,
    uint256[] calldata _routes,
    uint256 _minOut
  ) external payable NonZeroDeposit(_amountIn) returns (uint256) {
    // 1. transfer srcToken into this contract
    _amountIn = _transferTokenIn(_srcToken, _amountIn);

    // 2. zap srcToken to yieldToken
    uint256 _amountOut = _zap(_routes, _amountIn);
    require(IERC20Upgradeable(clevCVX).balanceOf(address(this)) >= _amountOut, "zap to dst token failed");
    require(_amountOut >= _minOut, "insufficient output");

    // 3. deposit to furnace
    IERC20Upgradeable(clevCVX).safeApprove(LEGACY_FURNACE, 0);
    IERC20Upgradeable(clevCVX).safeApprove(LEGACY_FURNACE, _amountOut);
    IFurnace(LEGACY_FURNACE).depositFor(msg.sender, _amountOut);

    return _amountOut;
  }

  /// @notice Deposit `_srcToken` into Furnace with zapping to clev token first.
  /// @param _furnace The address of MetaFurnace contract.
  /// @param _srcToken The address of start token. Use zero address, if you want deposit with ETH.
  /// @param _amountIn The amount of `_srcToken` to deposit.
  /// @param _routes The routes used to do zap.
  /// @param _minOut The minimum amount of clev token should receive.
  /// @return The amount of clev token received.
  function depositIntoFurnace(
    address _furnace,
    address _srcToken,
    uint256 _amountIn,
    uint256[] calldata _routes,
    uint256 _minOut
  ) external payable NonZeroDeposit(_amountIn) returns (uint256) {
    address _clevToken = IMetaFurnace(_furnace).debtToken();

    // 1. transfer srcToken into this contract
    _amountIn = _transferTokenIn(_srcToken, _amountIn);

    // 2. zap srcToken to yieldToken
    uint256 _amountOut = _zap(_routes, _amountIn);
    require(IERC20Upgradeable(_clevToken).balanceOf(address(this)) >= _amountOut, "zap to dst token failed");
    require(_amountOut >= _minOut, "insufficient output");

    // 3. deposit to furnace
    IERC20Upgradeable(_clevToken).safeApprove(_furnace, 0);
    IERC20Upgradeable(_clevToken).safeApprove(_furnace, _amountOut);
    IMetaFurnace(_furnace).deposit(msg.sender, _amountOut);

    return _amountOut;
  }

  /// @notice Deposit `_srcToken` into MetaCLever with zapping to yield token first.
  /// @param _clever The address of MetaCLever.
  /// @param _srcToken The address of start token. Use zero address, if you want deposit with ETH.
  /// @param _amountIn The amount of `_srcToken` to deposit.
  /// @param _routes The routes used to do zap.
  /// @param _minShareOut The minimum amount of pool shares should receive.
  /// @return The amount of pool shares received.
  function depositIntoCLever(
    address _clever,
    uint256 _strategyIndex,
    address _srcToken,
    uint256 _amountIn,
    address _dstToken,
    uint256[] calldata _routes,
    uint256 _minShareOut
  ) external payable NonZeroDeposit(_amountIn) returns (uint256) {
    bool _isUnderlying;
    {
      (, , address _underlyingToken, address _yieldToken, , , , ) = IMetaCLeverDetailed(_clever).yieldStrategies(
        _strategyIndex
      );
      if (_dstToken == _underlyingToken) _isUnderlying = true;
      else if (_dstToken == _yieldToken) _isUnderlying = false;
      else revert("invalid destination token");
    }

    // 1. transfer srcToken into this contract
    _amountIn = _transferTokenIn(_srcToken, _amountIn);

    // 2. zap srcToken to yieldToken
    uint256 _amountToken = _zap(_routes, _amountIn);
    require(IERC20Upgradeable(_dstToken).balanceOf(address(this)) >= _amountToken, "zap to dst token failed");

    // 3. deposit into Concentrator vault
    IERC20Upgradeable(_dstToken).safeApprove(_clever, 0);
    IERC20Upgradeable(_dstToken).safeApprove(_clever, _amountToken);
    uint256 _sharesOut = IMetaCLever(_clever).deposit(
      _strategyIndex,
      msg.sender,
      _amountToken,
      _minShareOut,
      _isUnderlying
    );

    require(_sharesOut >= _minShareOut, "insufficient share");
    return _sharesOut;
  }
}
