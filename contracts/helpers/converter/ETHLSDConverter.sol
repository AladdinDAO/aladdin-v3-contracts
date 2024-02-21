// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;
pragma abicoder v2;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

import { IEtherFiLiquidityPool } from "../../interfaces/etherfi/IEtherFiLiquidityPool.sol";
import { IEtherFiWeETH } from "../../interfaces/etherfi/IEtherFiWeETH.sol";
import { IFrxETHMinter } from "../../interfaces/frax-finance/IFrxETHMinter.sol";
import { IKelpDAOLRTConfig } from "../../interfaces/kelp-dao/IKelpDAOLRTConfig.sol";
import { IKelpDAOLRTDepositPool } from "../../interfaces/kelp-dao/IKelpDAOLRTDepositPool.sol";
import { IPirexEthMinter } from "../../interfaces/pirex/IPirexEthMinter.sol";
import { IRenzoOracle } from "../../interfaces/renzo-protocol/IRenzoOracle.sol";
import { IRenzoRestakeManager } from "../../interfaces/renzo-protocol/IRenzoRestakeManager.sol";
import { IRocketDepositPool } from "../../interfaces/rocket-pool/IRocketDepositPool.sol";
import { IRocketTokenRETH } from "../../interfaces/rocket-pool/IRocketTokenRETH.sol";
import { IWBETH } from "../../interfaces/IWBETH.sol";
import { ITokenConverter } from "./ITokenConverter.sol";

import { ConverterBase } from "./ConverterBase.sol";

// solhint-disable const-name-snakecase
// solhint-disable no-empty-blocks

contract ETHLSDConverter is ConverterBase {
  using SafeERC20 for IERC20;

  /*************
   * Constants *
   *************/

  /// @dev The precision used to convert.
  uint256 private constant PRECISION = 1e18;

  /// @dev The address of Binance's wBETH Token.
  address private constant wBETH = 0xa2E3356610840701BDf5611a53974510Ae27E2e1;

  /// @dev The address of Rocket Pool's rETH token.
  address private constant rETH = 0xae78736Cd615f374D3085123A210448E74Fc6393;

  /// @dev The address of Frax Finance's rETH token.
  address private constant frxETH = 0x5E8422345238F34275888049021821E8E08CAa1f;

  /// @dev The address of ether.fi's LiquidityPool.
  address private constant ETHER_FI_LIQUIDITY_POOL = 0x308861A430be4cce5502d0A12724771Fc6DaF216;

  /// @dev The address of ether.fi's eETH token.
  address private constant eETH = 0x35fA164735182de50811E8e2E824cFb9B6118ac2;

  /// @dev The address of ether.fi's weETH token.
  address private constant weETH = 0xCd5fE23C85820F7B72D0926FC9b05b43E359b7ee;

  /// @dev The address of Renzo's RestakeManager.
  address private constant RENZO_RESTAKE_MANAGER = 0x74a09653A083691711cF8215a6ab074BB4e99ef5;

  /// @dev The address of Renzo's RenzoOracle.
  address private constant RENZO_ORACLE = 0x5a12796f7e7EBbbc8a402667d266d2e65A814042;

  /// @dev The address of Renzo's ezETH token.
  address private constant ezETH = 0xbf5495Efe5DB9ce00f80364C8B423567e58d2110;

  /// @dev The address of Dinero's pxETH token.
  address private constant pxETH = 0x04C154b66CB340F3Ae24111CC767e0184Ed00Cc6;

  /// @dev The address of KelpDAO's rsETH token.
  address private constant rsETH = 0xA1290d69c65A6Fe4DF752f95823fae25cB99e5A7;

  /***************
   * Constructor *
   ***************/

  constructor(address _registry) ConverterBase(_registry) {}

  /*************************
   * Public View Functions *
   *************************/

  /// @inheritdoc ITokenConverter
  function getTokenPair(uint256 _encoding) public view override returns (address _tokenIn, address _tokenOut) {
    require(_getPoolType(_encoding) == 11, "unsupported poolType");
    uint256 _action = _getAction(_encoding);
    require(_action != 0, "unsupported action");

    address _pool = _getPool(_encoding);
    _encoding >>= 10;
    uint256 protocol = (_encoding >> 160) & 255;
    if (protocol < 5) {
      require(_action == 1, "unsupported action");
      if (protocol == 4) {
        uint256 index = (_encoding >> 168) & 255;
        if (index == 0) _tokenIn = WETH;
        else _tokenIn = IRenzoRestakeManager(RENZO_RESTAKE_MANAGER).collateralTokens(index - 1);
        _tokenOut = ezETH;
      } else {
        _tokenIn = WETH;
        if (protocol == 0) _tokenOut = wBETH;
        else if (protocol == 1) _tokenOut = rETH;
        else if (protocol == 2) _tokenOut = frxETH;
        else if (protocol == 3) _tokenOut = pxETH;
      }
    } else if (protocol == 5) {
      if (_pool == eETH) {
        require(_action == 1, "unsupported action");
        _tokenIn = WETH;
        _tokenOut = eETH;
      } else if (_pool == weETH) {
        if (_action == 1) {
          _tokenIn = eETH;
          _tokenOut = weETH;
        } else {
          _tokenIn = weETH;
          _tokenOut = eETH;
        }
      } else {
        revert("unsupported pool");
      }
    } else if (protocol == 6) {
      address config = IKelpDAOLRTDepositPool(_pool).lrtConfig();
      uint256 index = (_encoding >> 168) & 255;
      _tokenIn = IKelpDAOLRTConfig(config).supportedAssetList(index);
      if (_isETH(_tokenIn)) _tokenIn = WETH;
      _tokenOut = rsETH;
    } else {
      revert("unsupported protocol");
    }
  }

  /// @inheritdoc ITokenConverter
  function queryConvert(uint256 _encoding, uint256 _amountIn) external view override returns (uint256 _amountOut) {
    (address _tokenIn, ) = getTokenPair(_encoding);
    address _pool = _getPool(_encoding);
    _encoding >>= 10;
    uint256 protocol = (_encoding >> 160) & 255;
    if (protocol == 0) {
      _amountOut = (_amountIn * PRECISION) / IWBETH(wBETH).exchangeRate();
    } else if (protocol == 1) {
      _amountOut = IRocketTokenRETH(rETH).getRethValue(_amountIn);
    } else if (protocol <= 2) {
      _amountOut = _amountIn;
    } else if (protocol == 3) {
      uint256 fee = (uint256(IPirexEthMinter(_pool).fees(IPirexEthMinter.Fees.Deposit)) * _amountIn) / 1e6;
      _amountOut = _amountIn - fee;
    } else if (protocol == 4) {
      if (_tokenIn != WETH) {
        _amountIn = IRenzoOracle(RENZO_ORACLE).lookupTokenValue(_tokenIn, _amountIn);
      }
      uint256 _supply = IERC20(ezETH).totalSupply();
      (, , uint256 _tvl) = IRenzoRestakeManager(RENZO_RESTAKE_MANAGER).calculateTVLs();
      _amountOut = IRenzoOracle(RENZO_ORACLE).calculateMintAmount(_tvl, _amountIn, _supply);
    } else if (protocol == 5) {
      if (_tokenIn == WETH) {
        // mint eETH from ETH
        _amountOut = _amountIn;
      } else if (_tokenIn == eETH) {
        // mint weETH from eETH
        _amountOut = IEtherFiWeETH(weETH).getWeETHByeETH(_amountIn);
      } else {
        // unwrap weETH to eETH
        _amountOut = IEtherFiWeETH(weETH).getEETHByWeETH(_amountIn);
      }
    } else if (protocol == 6) {
      if (_tokenIn == WETH) {
        _tokenIn = ETH;
      }
      _amountOut = IKelpDAOLRTDepositPool(_pool).getRsETHAmountToMint(_tokenIn, _amountIn);
    }
  }

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @inheritdoc ITokenConverter
  function convert(
    uint256 _encoding,
    uint256 _amountIn,
    address _recipient
  ) external payable override returns (uint256 _amountOut) {
    (address _tokenIn, address _tokenOut) = getTokenPair(_encoding);
    address _pool = _getPool(_encoding);
    _encoding >>= 10;
    uint256 protocol = (_encoding >> 160) & 255;
    if (protocol == 0) {
      _amountOut = _convertWrappedBinanceBeaconETH(_amountIn, _recipient);
    } else if (protocol == 1) {
      _amountOut = _convertRocketPool(_pool, _amountIn, _recipient);
    } else if (protocol == 2) {
      _amountOut = _convertFraxFinance(_pool, _amountIn, _recipient);
    } else if (protocol == 3) {
      _amountOut = _convertPirexETH(_pool, _amountIn, _recipient);
    } else if (protocol == 4) {
      _amountOut = _convertRenzoProtocol(_tokenIn, _amountIn, _recipient);
    } else if (protocol == 5) {
      _amountOut = _convertEtherFi(_tokenIn, _amountIn, _tokenOut, _recipient);
    } else if (protocol == 6) {
      _amountOut = _convertKelpDAO(_pool, _tokenIn, _amountIn, _recipient);
    }
  }

  /**********************
   * Internal Functions *
   **********************/

  function _convertWrappedBinanceBeaconETH(uint256 _amountIn, address _recipient)
    internal
    returns (uint256 _amountOut)
  {
    _unwrapIfNeeded(_amountIn);
    uint256 _before = IERC20(wBETH).balanceOf(address(this));
    IWBETH(wBETH).deposit{ value: _amountIn }(REFERRAL);
    _amountOut = IERC20(wBETH).balanceOf(address(this)) - _before;
    IERC20(wBETH).safeTransfer(_recipient, _amountOut);
  }

  function _convertRocketPool(
    address _minter,
    uint256 _amountIn,
    address _recipient
  ) internal returns (uint256 _amountOut) {
    _unwrapIfNeeded(_amountIn);
    uint256 _before = IERC20(rETH).balanceOf(address(this));
    IRocketDepositPool(_minter).deposit{ value: _amountIn }();
    _amountOut = IERC20(rETH).balanceOf(address(this)) - _before;
    if (_recipient != address(this)) {
      IERC20(rETH).safeTransfer(_recipient, _amountOut);
    }
  }

  function _convertFraxFinance(
    address _minter,
    uint256 _amountIn,
    address _recipient
  ) internal returns (uint256) {
    _unwrapIfNeeded(_amountIn);
    IFrxETHMinter(_minter).submitAndGive{ value: _amountIn }(_recipient);
    return _amountIn;
  }

  function _convertPirexETH(
    address _minter,
    uint256 _amountIn,
    address _recipient
  ) internal returns (uint256 _amountOut) {
    _unwrapIfNeeded(_amountIn);
    (_amountOut, ) = IPirexEthMinter(_minter).deposit{ value: _amountIn }(_recipient, false);
  }

  function _convertRenzoProtocol(
    address _tokenIn,
    uint256 _amountIn,
    address _recipient
  ) internal returns (uint256 _amountOut) {
    uint256 _before = IERC20(ezETH).balanceOf(address(this));
    if (_tokenIn == WETH) {
      _unwrapIfNeeded(_amountIn);
      IRenzoRestakeManager(RENZO_RESTAKE_MANAGER).depositETH{ value: _amountIn }();
    } else {
      _approve(_tokenIn, RENZO_RESTAKE_MANAGER, _amountIn);
      IRenzoRestakeManager(RENZO_RESTAKE_MANAGER).deposit(_tokenIn, _amountIn);
    }
    _amountOut = IERC20(ezETH).balanceOf(address(this)) - _before;
    if (_recipient != address(this)) {
      IERC20(ezETH).safeTransfer(_recipient, _amountOut);
    }
  }

  function _convertEtherFi(
    address _tokenIn,
    uint256 _amountIn,
    address _tokenOut,
    address _recipient
  ) internal returns (uint256 _amountOut) {
    uint256 _before = IERC20(_tokenOut).balanceOf(address(this));
    if (_tokenIn == WETH) {
      _unwrapIfNeeded(_amountIn);
      IEtherFiLiquidityPool(ETHER_FI_LIQUIDITY_POOL).deposit{ value: _amountIn }(REFERRAL);
    } else {
      if (_tokenIn == eETH) {
        _approve(_tokenIn, weETH, _amountIn);
        IEtherFiWeETH(weETH).wrap(_amountIn);
      } else {
        IEtherFiWeETH(weETH).unwrap(_amountIn);
      }
    }
    _amountOut = IERC20(_tokenOut).balanceOf(address(this)) - _before;
    if (_recipient != address(this)) {
      IERC20(_tokenOut).safeTransfer(_recipient, _amountOut);
    }
  }

  function _convertKelpDAO(
    address _minter,
    address _tokenIn,
    uint256 _amountIn,
    address _recipient
  ) internal returns (uint256 _amountOut) {
    string memory referralId = "d05723c7b17b4e4c722ca4fb95e64ffc54a70131c75e2b2548a456c51ed7cdaf";
    uint256 _before = IERC20(rsETH).balanceOf(address(this));
    if (_tokenIn == WETH) {
      _unwrapIfNeeded(_amountIn);
      IKelpDAOLRTDepositPool(_minter).depositETH{ value: _amountIn }(0, referralId);
    } else {
      _approve(_tokenIn, _minter, _amountIn);
      IKelpDAOLRTDepositPool(_minter).depositAsset(_tokenIn, _amountIn, 0, referralId);
    }
    _amountOut = IERC20(rsETH).balanceOf(address(this)) - _before;
    if (_recipient != address(this)) {
      IERC20(rsETH).safeTransfer(_recipient, _amountOut);
    }
  }
}
