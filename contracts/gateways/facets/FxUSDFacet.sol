// SPDX-License-Identifier: MIT

pragma solidity =0.8.20;

import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable-v4/token/ERC20/IERC20Upgradeable.sol";

import { IFxMarketV2 } from "../../interfaces/f(x)/IFxMarketV2.sol";
import { IFxShareableRebalancePool } from "../../interfaces/f(x)/IFxShareableRebalancePool.sol";
import { IFxUSD } from "../../interfaces/f(x)/IFxUSD.sol";

import { LibGatewayRouter } from "../libraries/LibGatewayRouter.sol";

contract FxUSDFacet {
  /**********
   * Errors *
   **********/

  /// @dev Thrown when the length of two arrays is mismatch.
  error ErrorLengthMismatch();

  /*************
   * Constants *
   *************/

  /// @notice The address of fxUSD.
  address public immutable fxUSD;

  /***************
   * Constructor *
   ***************/

  constructor(address _fxUSD) {
    fxUSD = _fxUSD;
  }

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @notice Mint some fToken with given token and convert parameters.
  /// @param _params The token converting parameters.
  /// @param _market The address of market to use.
  /// @param _minFTokenMinted The minimum amount of fToken should be received.
  /// @return _fTokenMinted The amount of fToken received.
  function fxMintFTokenV2(
    LibGatewayRouter.ConvertInParams memory _params,
    address _market,
    uint256 _minFTokenMinted
  ) external payable returns (uint256 _fTokenMinted) {
    address _baseToken = IFxMarketV2(_market).baseToken();
    uint256 _amount = LibGatewayRouter.transferInAndConvert(_params, _baseToken);
    LibGatewayRouter.approve(_baseToken, _market, _amount);
    _fTokenMinted = IFxMarketV2(_market).mintFToken(_amount, msg.sender, _minFTokenMinted);
    LibGatewayRouter.refundERC20(_baseToken, msg.sender);
  }

  /// @notice Mint some xToken with given token and convert parameters.
  /// @param _params The token converting parameters.
  /// @param _market The address of market to use.
  /// @param _minXTokenMinted The minimum amount of xToken should be received.
  /// @return _xTokenMinted The amount of xToken received.
  /// @return _bonusOut The amount of bonus base token received.
  function fxMintXTokenV2(
    LibGatewayRouter.ConvertInParams memory _params,
    address _market,
    uint256 _minXTokenMinted
  ) external payable returns (uint256 _xTokenMinted, uint256 _bonusOut) {
    address _baseToken = IFxMarketV2(_market).baseToken();
    uint256 _amount = LibGatewayRouter.transferInAndConvert(_params, _baseToken);
    LibGatewayRouter.approve(_baseToken, _market, _amount);
    (_xTokenMinted, _bonusOut) = IFxMarketV2(_market).mintXToken(_amount, msg.sender, _minXTokenMinted);
    LibGatewayRouter.refundERC20(_baseToken, msg.sender);
  }

  /// @notice Redeem fToken and convert to some other token.
  /// @param _params The token converting parameters.
  /// @param _market The address of market to use.
  /// @param _fTokenIn the amount of fToken to redeem, use `uint256(-1)` to redeem all fToken.
  /// @param _minBaseToken The minimum amount of base token should be received.
  /// @return _baseOut The amount of base token received.
  /// @return _dstOut The amount of dst token received.
  /// @return _bonusOut The amount of bonus base token received.
  function fxRedeemFTokenV2(
    LibGatewayRouter.ConvertOutParams memory _params,
    address _market,
    uint256 _fTokenIn,
    uint256 _minBaseToken
  )
    external
    returns (
      uint256 _baseOut,
      uint256 _dstOut,
      uint256 _bonusOut
    )
  {
    address _fToken = IFxMarketV2(_market).fToken();
    address _baseToken = IFxMarketV2(_market).baseToken();
    _fTokenIn = LibGatewayRouter.transferTokenIn(_fToken, address(this), _fTokenIn);

    (_baseOut, _bonusOut) = IFxMarketV2(_market).redeemFToken(_fTokenIn, address(this), _minBaseToken);
    _dstOut = LibGatewayRouter.convertAndTransferOut(_params, _baseToken, _baseOut + _bonusOut, msg.sender);
    LibGatewayRouter.refundERC20(_fToken, msg.sender);
  }

  /// @notice Redeem xToken and convert to some other token.
  /// @param _params The token converting parameters.
  /// @param _market The address of market to use.
  /// @param _xTokenIn the amount of xToken to redeem, use `uint256(-1)` to redeem all xToken.
  /// @param _minBaseToken The minimum amount of base token should be received.
  /// @return _baseOut The amount of base token received.
  /// @return _dstOut The amount of dst token received.
  function fxRedeemXTokenV2(
    LibGatewayRouter.ConvertOutParams memory _params,
    address _market,
    uint256 _xTokenIn,
    uint256 _minBaseToken
  ) external returns (uint256 _baseOut, uint256 _dstOut) {
    address _xToken = IFxMarketV2(_market).xToken();
    address _baseToken = IFxMarketV2(_market).baseToken();
    _xTokenIn = LibGatewayRouter.transferTokenIn(_xToken, address(this), _xTokenIn);

    _baseOut = IFxMarketV2(_market).redeemXToken(_xTokenIn, address(this), _minBaseToken);
    _dstOut = LibGatewayRouter.convertAndTransferOut(_params, _baseToken, _baseOut, msg.sender);
    LibGatewayRouter.refundERC20(_xToken, msg.sender);
  }

  /// @notice Swap between fToken and xToken
  /// @param _market The address of market to use.
  /// @param _amountIn The amount of input token.
  /// @param _fTokenForXToken Whether swap fToken for xToken.
  /// @param _minOut The minimum amount of token should be received.
  /// @return _amountOut The amount of token received.
  /// @return _bonusOut The amount of bonus token received.
  function fxSwapV2(
    address _market,
    uint256 _amountIn,
    bool _fTokenForXToken,
    uint256 _minOut
  ) external returns (uint256 _amountOut, uint256 _bonusOut) {
    address _fToken = IFxMarketV2(_market).fToken();
    address _xToken = IFxMarketV2(_market).xToken();
    address _baseToken = IFxMarketV2(_market).baseToken();

    if (_fTokenForXToken) {
      _amountIn = LibGatewayRouter.transferTokenIn(_fToken, address(this), _amountIn);
      (uint256 _baseOut, uint256 _redeemBonus) = IFxMarketV2(_market).redeemFToken(_amountIn, address(this), 0);
      _bonusOut = _redeemBonus;
      LibGatewayRouter.approve(_baseToken, _market, _baseOut);
      (_amountOut, _redeemBonus) = IFxMarketV2(_market).mintXToken(_baseOut, msg.sender, 0);
      _bonusOut += _redeemBonus;
      LibGatewayRouter.refundERC20(_fToken, msg.sender);
    } else {
      _amountIn = LibGatewayRouter.transferTokenIn(_xToken, address(this), _amountIn);
      uint256 _baseOut = IFxMarketV2(_market).redeemXToken(_amountIn, address(this), 0);
      LibGatewayRouter.approve(_baseToken, _market, _baseOut);
      _amountOut = IFxMarketV2(_market).mintFToken(_baseOut, msg.sender, _minOut);
      LibGatewayRouter.refundERC20(_xToken, msg.sender);
    }

    LibGatewayRouter.refundERC20(_baseToken, msg.sender);
  }

  /// @notice Mint some fxUSD with given token and convert parameters.
  /// @param _params The token converting parameters.
  /// @param _baseToken The address of base token used to mint.
  /// @param _minFxUSDMinted The minimum amount of fxUSD should be received.
  /// @return _fxUSDMinted The amount of fxUSD received.
  function fxMintFxUSD(
    LibGatewayRouter.ConvertInParams memory _params,
    address _baseToken,
    uint256 _minFxUSDMinted
  ) external payable returns (uint256 _fxUSDMinted) {
    uint256 _amount = LibGatewayRouter.transferInAndConvert(_params, _baseToken);
    LibGatewayRouter.approve(_baseToken, fxUSD, _amount);
    _fxUSDMinted = IFxUSD(fxUSD).mint(_baseToken, _amount, msg.sender, _minFxUSDMinted);
    LibGatewayRouter.refundERC20(_baseToken, msg.sender);
  }

  /// @notice Mint some fxUSD and earn in rebalance pool with given token and convert parameters.
  /// @param _params The token converting parameters.
  /// @param _pool The address of rebalance pool used to earn.
  /// @param _minFxUSDMinted The minimum amount of fxUSD should be received.
  /// @return _fxUSDMinted The amount of fxUSD received.
  function fxMintFxUSDAndEarn(
    LibGatewayRouter.ConvertInParams memory _params,
    address _pool,
    uint256 _minFxUSDMinted
  ) external payable returns (uint256 _fxUSDMinted) {
    address _baseToken = IFxShareableRebalancePool(_pool).baseToken();
    uint256 _amount = LibGatewayRouter.transferInAndConvert(_params, _baseToken);
    LibGatewayRouter.approve(_baseToken, fxUSD, _amount);
    _fxUSDMinted = IFxUSD(fxUSD).mintAndEarn(_pool, _amount, msg.sender, _minFxUSDMinted);
    LibGatewayRouter.refundERC20(_baseToken, msg.sender);
  }

  /// @notice Withdraw fToken from rebalance pool as fxUSD
  /// @param _pool The address of rebalance pool used.
  /// @param _amountIn the amount of fToken to withdraw, use `uint256(-1)` to withdraw all fToken.
  /// @return _amountOut The amount of fxUSD received.
  function fxRebalancePoolWithdraw(address _pool, uint256 _amountIn) external payable returns (uint256 _amountOut) {
    address _baseToken = IFxShareableRebalancePool(_pool).baseToken();
    address _fToken = IFxShareableRebalancePool(_pool).asset();
    _amountOut = IERC20Upgradeable(_fToken).balanceOf(address(this));
    IFxShareableRebalancePool(_pool).withdrawFrom(msg.sender, _amountIn, address(this));
    _amountOut = IERC20Upgradeable(_fToken).balanceOf(address(this)) - _amountOut;
    LibGatewayRouter.approve(_fToken, fxUSD, _amountOut);
    IFxUSD(fxUSD).wrap(_baseToken, _amountOut, msg.sender);
  }

  /// @notice Withdraw fToken from rebalance pool as target token.
  /// @return _amountOut The amount of target token received.
  function fxRebalancePoolWithdraw(
    LibGatewayRouter.ConvertOutParams memory _params,
    address _pool,
    uint256 _amountIn
  ) external payable returns (uint256 _amountOut) {
    address _baseToken = IFxShareableRebalancePool(_pool).baseToken();
    address _fToken = IFxShareableRebalancePool(_pool).asset();
    address _market = IFxShareableRebalancePool(_pool).market();
    _amountOut = IERC20Upgradeable(_fToken).balanceOf(address(this));
    IFxShareableRebalancePool(_pool).withdrawFrom(msg.sender, _amountIn, address(this));
    _amountOut = IERC20Upgradeable(_fToken).balanceOf(address(this)) - _amountOut;
    // assume all fToken will be redeem for simplicity
    (uint256 _baseOut, uint256 _bonusOut) = IFxMarketV2(_market).redeemFToken(_amountOut, address(this), 0);
    _amountOut = LibGatewayRouter.convertAndTransferOut(_params, _baseToken, _baseOut + _bonusOut, msg.sender);
  }

  /// @notice Redeem fxUSD and convert to some other token.
  /// @param _params The token converting parameters.
  /// @param _baseToken The address of base token to use.
  /// @param _fxUSDIn the amount of fxUSD to redeem, use `uint256(-1)` to redeem all fToken.
  /// @param _minBaseToken The minimum amount of base token should be received.
  /// @return _baseOut The amount of base token received.
  /// @return _dstOut The amount of dst token received.
  /// @return _bonusOut The amount of bonus base token received.
  function fxRedeemFxUSD(
    LibGatewayRouter.ConvertOutParams memory _params,
    address _baseToken,
    uint256 _fxUSDIn,
    uint256 _minBaseToken
  )
    external
    payable
    returns (
      uint256 _baseOut,
      uint256 _dstOut,
      uint256 _bonusOut
    )
  {
    _fxUSDIn = LibGatewayRouter.transferTokenIn(fxUSD, address(this), _fxUSDIn);
    (_baseOut, _bonusOut) = IFxUSD(fxUSD).redeem(_baseToken, _fxUSDIn, address(this), _minBaseToken);
    _dstOut = LibGatewayRouter.convertAndTransferOut(_params, _baseToken, _baseOut + _bonusOut, msg.sender);
    LibGatewayRouter.refundERC20(fxUSD, msg.sender);
  }

  /// @notice Redeem fxUSD and convert to some other token.
  /// @param _params The list of token converting parameters.
  /// @param _fxUSDIn the amount of fxUSD to redeem, use `uint256(-1)` to redeem all fToken.
  /// @param _minBaseTokens The list of minimum amount of base token should be received.
  /// @return _baseOuts The list of amounts of base token received.
  /// @return _bonusOuts The list of amount of bonus base token received.
  /// @return _dstOut The amount of dst token received.
  function fxAutoRedeemFxUSD(
    LibGatewayRouter.ConvertOutParams[] memory _params,
    uint256 _fxUSDIn,
    uint256[] memory _minBaseTokens
  )
    external
    payable
    returns (
      uint256[] memory _baseOuts,
      uint256[] memory _bonusOuts,
      uint256 _dstOut
    )
  {
    _fxUSDIn = LibGatewayRouter.transferTokenIn(fxUSD, address(this), _fxUSDIn);
    address[] memory _baseTokens;
    (_baseTokens, _baseOuts, _bonusOuts) = IFxUSD(fxUSD).autoRedeem(_fxUSDIn, address(this), _minBaseTokens);
    if (_params.length != _baseOuts.length) revert ErrorLengthMismatch();
    for (uint256 i = 0; i < _params.length; i++) {
      _dstOut = LibGatewayRouter.convertAndTransferOut(
        _params[i],
        _baseTokens[i],
        _baseOuts[i] + _bonusOuts[i],
        msg.sender
      );
    }
  }

  /// @notice Swap base through fxUSD.
  /// @param _baseTokenIn The address of source base token to use.
  /// @param _amountIn the amount of source base token to swap, use `uint256(-1)` to swapp all.
  /// @param _baseTokenOut The address of target base token to use.
  /// @param _minOut The minimum amount of target base token should be received.
  /// @return _amountOut The amount of target base token received.
  /// @return _bonusOut The amount of bonus base token received.
  function fxBaseTokenSwap(
    address _baseTokenIn,
    uint256 _amountIn,
    address _baseTokenOut,
    uint256 _minOut
  ) external returns (uint256 _amountOut, uint256 _bonusOut) {
    _amountIn = LibGatewayRouter.transferTokenIn(_baseTokenIn, address(this), _amountIn);
    LibGatewayRouter.approve(_baseTokenIn, fxUSD, _amountIn);
    uint256 _fxUSDMinted = IFxUSD(fxUSD).mint(_baseTokenIn, _amountIn, msg.sender, 0);
    (_amountOut, _bonusOut) = IFxUSD(fxUSD).redeem(_baseTokenOut, _fxUSDMinted, msg.sender, _minOut);
  }
}
