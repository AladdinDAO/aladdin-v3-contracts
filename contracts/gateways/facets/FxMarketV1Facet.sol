// SPDX-License-Identifier: MIT

pragma solidity =0.8.20;

import { SafeERC20Upgradeable } from "@openzeppelin/contracts-upgradeable-v4/token/ERC20/utils/SafeERC20Upgradeable.sol";
import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable-v4/token/ERC20/IERC20Upgradeable.sol";

import { IFxMarket } from "../../interfaces/f(x)/IFxMarket.sol";

import { LibGatewayRouter } from "../libraries/LibGatewayRouter.sol";

contract FxMarketV1Facet {
  using SafeERC20Upgradeable for IERC20Upgradeable;

  /*************
   * Constants *
   *************/

  /// @notice The address of base token.
  address public immutable baseToken;

  /// @notice The address of Fractional Token.
  address public immutable fToken;

  /// @notice The address of Leveraged Token.
  address public immutable xToken;

  /// @notice The address of Market.
  address public immutable market;

  /***************
   * Constructor *
   ***************/

  constructor(
    address _market,
    address _baseToken,
    address _fToken,
    address _xToken
  ) {
    baseToken = _baseToken;
    fToken = _fToken;
    xToken = _xToken;
    market = _market;

    IERC20Upgradeable(_baseToken).safeApprove(_market, type(uint256).max);
    IERC20Upgradeable(_fToken).safeApprove(_market, type(uint256).max);
    IERC20Upgradeable(_xToken).safeApprove(_market, type(uint256).max);
  }

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @notice Mint some fToken with some ETH.
  /// @param _minFTokenMinted The minimum amount of fToken should be received.
  /// @return _fTokenMinted The amount of fToken received.
  function fxMintFTokenV1(LibGatewayRouter.ConvertInParams memory _params, uint256 _minFTokenMinted)
    external
    payable
    returns (uint256 _fTokenMinted)
  {
    uint256 _amount = LibGatewayRouter.transferInAndConvert(_params, baseToken);
    _fTokenMinted = IFxMarket(market).mintFToken(_amount, msg.sender, _minFTokenMinted);

    LibGatewayRouter.refundERC20(baseToken, msg.sender);
  }

  /// @notice Mint some xToken with some ETH.
  /// @param _minXTokenMinted The minimum amount of xToken should be received.
  /// @return _xTokenMinted The amount of xToken received.
  /// @return _bonusOut The amount of bonus base token received.
  function fxMintXTokenV1(LibGatewayRouter.ConvertInParams memory _params, uint256 _minXTokenMinted)
    external
    payable
    returns (uint256 _xTokenMinted, uint256 _bonusOut)
  {
    uint256 _amount = LibGatewayRouter.transferInAndConvert(_params, baseToken);
    (_xTokenMinted, _bonusOut) = IFxMarket(market).mintXToken(_amount, msg.sender, _minXTokenMinted);

    LibGatewayRouter.refundERC20(baseToken, msg.sender);
  }

  /// @notice Mint some xToken by add some ETH as collateral.
  /// @param _minXTokenMinted The minimum amount of xToken should be received.
  /// @return _xTokenMinted The amount of xToken received.
  function fxAddBaseTokenV1(LibGatewayRouter.ConvertInParams memory _params, uint256 _minXTokenMinted)
    external
    payable
    returns (uint256 _xTokenMinted)
  {
    uint256 _amount = LibGatewayRouter.transferInAndConvert(_params, baseToken);
    _xTokenMinted = IFxMarket(market).addBaseToken(_amount, msg.sender, _minXTokenMinted);

    LibGatewayRouter.refundERC20(baseToken, msg.sender);
  }

  /// @notice Redeem and convert to some other token.
  /// @param _fTokenIn the amount of fToken to redeem, use `uint256(-1)` to redeem all fToken.
  /// @param _xTokenIn the amount of xToken to redeem, use `uint256(-1)` to redeem all xToken.
  /// @param _minBaseToken The minimum amount of base token should be received.
  /// @return _baseOut The amount of base token received.
  /// @return _dstOut The amount of dst token received.
  /// @return _bonusOut The amount of bonus base token received.
  function fxRedeemV1(
    LibGatewayRouter.ConvertOutParams memory _params,
    uint256 _fTokenIn,
    uint256 _xTokenIn,
    uint256 _minBaseToken
  )
    external
    returns (
      uint256 _baseOut,
      uint256 _dstOut,
      uint256 _bonusOut
    )
  {
    if (_xTokenIn == 0) {
      _fTokenIn = LibGatewayRouter.transferTokenIn(fToken, address(this), _fTokenIn);
    } else {
      _xTokenIn = LibGatewayRouter.transferTokenIn(xToken, address(this), _xTokenIn);
      _fTokenIn = 0;
    }

    (_baseOut, _bonusOut) = IFxMarket(market).redeem(_fTokenIn, _xTokenIn, address(this), _minBaseToken);
    _dstOut = LibGatewayRouter.convertAndTransferOut(_params, baseToken, _baseOut + _bonusOut, msg.sender);

    if (_fTokenIn > 0) {
      LibGatewayRouter.refundERC20(fToken, msg.sender);
    }
    if (_xTokenIn > 0) {
      LibGatewayRouter.refundERC20(xToken, msg.sender);
    }
  }

  /// @notice Swap between fToken and xToken
  /// @param _amountIn The amount of input token.
  /// @param _fTokenForXToken Whether swap fToken for xToken.
  /// @param _minOut The minimum amount of token should be received.
  /// @return _amountOut The amount of token received.
  /// @return _bonusOut The amount of bonus token received.
  function fxSwapV1(
    uint256 _amountIn,
    bool _fTokenForXToken,
    uint256 _minOut
  ) external returns (uint256 _amountOut, uint256 _bonusOut) {
    if (_fTokenForXToken) {
      _amountIn = LibGatewayRouter.transferTokenIn(fToken, address(this), _amountIn);
      (uint256 _baseOut, uint256 _redeemBonus) = IFxMarket(market).redeem(_amountIn, 0, address(this), 0);
      _bonusOut = _redeemBonus;
      (_amountOut, _redeemBonus) = IFxMarket(market).mintXToken(_baseOut, msg.sender, 0);
      _bonusOut += _redeemBonus;
      LibGatewayRouter.refundERC20(fToken, msg.sender);
    } else {
      _amountIn = LibGatewayRouter.transferTokenIn(xToken, address(this), _amountIn);
      (uint256 _baseOut, uint256 _redeemBonus) = IFxMarket(market).redeem(0, _amountIn, address(this), 0);
      _bonusOut = _redeemBonus;
      _amountOut = IFxMarket(market).mintFToken(_baseOut, msg.sender, 0);
      LibGatewayRouter.refundERC20(xToken, msg.sender);
    }
    if (_amountOut < _minOut) revert LibGatewayRouter.ErrorInsufficientOutput();

    LibGatewayRouter.refundERC20(baseToken, msg.sender);
  }
}
