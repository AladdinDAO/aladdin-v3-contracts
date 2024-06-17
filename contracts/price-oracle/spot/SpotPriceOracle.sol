// SPDX-License-Identifier: MIT

pragma solidity =0.8.20;

import { Ownable2Step } from "@openzeppelin/contracts-v4/access/Ownable2Step.sol";
import { IERC4626 } from "@openzeppelin/contracts-v4/interfaces/IERC4626.sol";
import { Math } from "@openzeppelin/contracts-v4/utils/math/Math.sol";

import { StableMath } from "../../common/math/StableMath.sol";
import { ICurveStableSwapNG } from "../../interfaces/curve/ICurveStableSwapNG.sol";
import { IEtherFiWeETH } from "../../interfaces/etherfi/IEtherFiWeETH.sol";
import { IFxRateProvider } from "../../interfaces/f(x)/IFxRateProvider.sol";
import { IBalancerPool } from "../../interfaces/IBalancerPool.sol";
import { IBalancerVault } from "../../interfaces/IBalancerVault.sol";
import { ICurvePlainPool } from "../../interfaces/ICurvePlainPool.sol";
import { ICurvePoolOracle } from "../../interfaces/ICurvePoolOracle.sol";
import { IUniswapV2Pair } from "../../interfaces/IUniswapV2Pair.sol";
import { IUniswapV3Pool } from "../../interfaces/IUniswapV3Pool.sol";
import { ILidoWstETH } from "../../interfaces/ILidoWstETH.sol";
import { ISpotPriceOracle } from "../interfaces/ISpotPriceOracle.sol";

// solhint-disable var-name-mixedcase

contract SpotPriceOracle is Ownable2Step, ISpotPriceOracle {
  /*************
   * Constants *
   *************/

  /// @dev The precision for spot price.
  uint256 private constant PRECISION = 1e18;

  /// @dev The value of sqrt(PRECISION).
  uint256 private constant HALF_PRECISION = 1e9;

  /// @dev The value of `2^96`.
  uint256 private constant E96 = 2**96;

  /// @dev The address of wstETH token.
  address private constant wstETH = 0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0;

  /// @dev The address of weETH token.
  address private constant weETH = 0xCd5fE23C85820F7B72D0926FC9b05b43E359b7ee;

  /// @dev The address of ezETH token.
  address private constant ezETH = 0xbf5495Efe5DB9ce00f80364C8B423567e58d2110;

  /// @dev The address of rate provider for ezETH.
  address private constant ezETH_RATE_PROVIDER = 0x387dBc0fB00b26fb085aa658527D5BE98302c84C;

  /// @dev The address of Balancer V2 vault.
  address private constant BALANCER_VAULT = 0xBA12222222228d8Ba445958a75a0704d566BF2C8;

  /**********
   * Events *
   **********/

  /// @notice Emitted when the address of reader is updated.
  /// @param poolType The type of reader.
  /// @param oldReader The address of the previous reader.
  /// @param newReader The address of the current reader.
  event UpdateReader(uint256 poolType, address oldReader, address newReader);

  /**********
   * Errors *
   **********/

  /// @dev Thrown when the pool encoding is invalid.
  error ErrorInvalidEncoding();

  /// @dev Thrown when the pool is not supported.
  error ErrorUnsupportedPoolType();

  /// @dev Thrown when update some parameters to the same value.
  error ErrorParameterUnchanged();

  /*************
   * Variables *
   *************/

  /// @notice Mapping from pool type to spot price reader.
  mapping(uint256 => address) public readers;

  /*************************
   * Public View Functions *
   *************************/

  /// @inheritdoc ISpotPriceOracle
  function getSpotPrice(uint256 encoding) external view override returns (uint256 spotPrice) {
    uint256 poolType = encoding & 0xff;
    address reader = readers[poolType];
    // use custom reader
    if (reader != address(0)) {
      return ISpotPriceOracle(reader).getSpotPrice(encoding);
    }

    encoding >>= 8;
    if (poolType == 0) {
      spotPrice = _getSpotPriceByUniswapV2(encoding);
    } else if (poolType == 1) {
      spotPrice = _getSpotPriceByUniswapV3(encoding);
    } else if (poolType == 2) {
      spotPrice = _getSpotPriceByBalancerV2Weighted(encoding);
    } else if (poolType == 3) {
      spotPrice = _getSpotPriceByBalancerV2Stable(encoding);
    } else if (poolType == 4) {
      spotPrice = _getSpotPriceByCurvePlain(encoding);
    } else if (poolType == 5) {
      spotPrice = _getSpotPriceByCurvePlainWithOracle(encoding);
    } else if (poolType == 6) {
      spotPrice = _getSpotPriceByCurvePlainNG(encoding);
    } else if (poolType == 7) {
      spotPrice = _getSpotPriceByCurveCrypto(encoding);
    } else if (poolType == 8) {
      spotPrice = _getSpotPriceByCurveTriCrypto(encoding);
    } else if (poolType == 9) {
      spotPrice = _getSpotPriceByERC4626(encoding);
    } else if (poolType == 10) {
      spotPrice = _getSpotPriceByLSD(encoding);
    } else if (poolType == 11) {
      spotPrice = _getSpotPriceByBalancerV2RateCache(encoding);
    } else {
      revert ErrorUnsupportedPoolType();
    }
  }

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @notice Update the reader for a specific pool.
  /// @param poolType The type of the pool.
  /// @param newReader The address of the new reader.
  function updateReader(uint256 poolType, address newReader) external onlyOwner {
    address oldReader = readers[poolType];
    if (oldReader == newReader) {
      revert ErrorParameterUnchanged();
    }

    readers[poolType] = newReader;

    emit UpdateReader(poolType, oldReader, newReader);
  }

  /**********************
   * Internal Functions *
   **********************/

  /// @dev Internal function to get spot price from Uniswap V2 pairs.
  /// @param encoding The encoding for the pool.
  function _getSpotPriceByUniswapV2(uint256 encoding) internal view returns (uint256) {
    address pool = _getPool(encoding);
    uint256 base_index = (encoding >> 160) & 1;
    (uint256 r_base, uint256 r_quote, ) = IUniswapV2Pair(pool).getReserves();
    if (base_index == 1) {
      (r_base, r_quote) = (r_quote, r_base);
    }
    r_base *= 10**((encoding >> 161) & 255);
    r_quote *= 10**((encoding >> 169) & 255);
    return (r_quote * PRECISION) / r_base;
  }

  /// @dev Internal function to get spot price from Uniswap V3 pools.
  /// @param encoding The encoding for the pool.
  function _getSpotPriceByUniswapV3(uint256 encoding) internal view returns (uint256) {
    address pool = _getPool(encoding);
    uint256 base_index = (encoding >> 160) & 1;
    (uint256 sqrtPriceX96, , , , , , ) = IUniswapV3Pool(pool).slot0();
    if (base_index == 1) {
      sqrtPriceX96 = (E96 * E96) / sqrtPriceX96;
    }
    uint256 base_scale = 10**((encoding >> 161) & 255);
    uint256 quote_scale = 10**((encoding >> 169) & 255);
    // sqrt(base/quote) = sqrtPriceX96 / 2^96
    // (base * quote_scale * 10^18) / (quote * base_scale) = (sqrtPriceX96 / 2^96) ^ 2 * quote_scale / base_scale * 10^18
    // sqrtPriceX96^2 * 10^18 * quote_scale / (2^192 * base_scale)
    // (sqrtPriceX96 * 10^9 / 2^96)^2 * quote_scale / base_scale
    if (quote_scale > base_scale) {
      uint256 scale = Math.sqrt(quote_scale / base_scale);
      uint256 price = (sqrtPriceX96 * HALF_PRECISION * scale) / E96;
      return price * price;
    } else {
      uint256 price = (sqrtPriceX96 * HALF_PRECISION) / E96;
      return (price * price * quote_scale) / base_scale;
    }
  }

  /// @dev Internal function to get spot price from Balancer V2's weighted pools.
  /// @param encoding The encoding for the pool.
  function _getSpotPriceByBalancerV2Weighted(uint256 encoding) internal view returns (uint256) {
    address pool = _getPool(encoding);
    bytes32 poolId = IBalancerPool(pool).getPoolId();
    uint256[] memory weights = IBalancerPool(pool).getNormalizedWeights();
    (, uint256[] memory balances, ) = IBalancerVault(BALANCER_VAULT).getPoolTokens(poolId);
    uint256 base_index = (encoding >> 160) & 7;
    uint256 quote_index = (encoding >> 163) & 7;
    uint256 base_scale = 10**((encoding >> 166) & 255);
    uint256 quote_scale = 10**((encoding >> 174) & 255);
    uint256 price = (balances[quote_index] * quote_scale * PRECISION) / (balances[base_index] * base_scale);
    return (price * weights[base_index]) / weights[quote_index];
  }

  /// @dev Internal function to get spot price from Balance V2's composable stable pools.
  /// @param encoding The encoding for the pool.
  function _getSpotPriceByBalancerV2Stable(uint256 encoding) internal view returns (uint256) {
    address pool = _getPool(encoding);
    uint256 base_index = (encoding >> 160) & 7;
    uint256 quote_index = (encoding >> 163) & 7;
    bytes32 poolId = IBalancerPool(pool).getPoolId();
    uint256[] memory scales = IBalancerPool(pool).getScalingFactors();
    (address[] memory tokens, uint256[] memory balances, ) = IBalancerVault(BALANCER_VAULT).getPoolTokens(poolId);
    uint256[] memory realBalances = new uint256[](balances.length - 1);
    uint256 j;
    for (uint256 i = 0; i < balances.length; ++i) {
      if (tokens[i] == pool) continue;
      realBalances[j] = (balances[i] * scales[i]) / PRECISION;
      j += 1;
    }
    (uint256 amp, , ) = IBalancerPool(pool).getAmplificationParameter();
    uint256 invariant = StableMath.calculateInvariant(amp, realBalances);
    return StableMath.calculateSpotPrice(base_index, quote_index, amp, invariant, realBalances);
  }

  /// @dev Internal function to get spot price from Curve's plain pools (without oracle supported).
  /// @param encoding The encoding for the pool.
  function _getSpotPriceByCurvePlain(uint256 encoding) internal view returns (uint256) {
    address pool = _getPool(encoding);
    uint256 tokens = ((encoding >> 160) & 7) + 1;
    uint256 base_index = (encoding >> 163) & 7;
    uint256 quote_index = (encoding >> 166) & 7;
    uint256 has_amm_precise = (encoding >> 169) & 1;
    uint256 amp;
    // curve's precision is 100, and we use 1000 in this contract.
    if (has_amm_precise == 1) {
      amp = ICurvePlainPool(pool).A_precise() * 10;
    } else {
      amp = ICurvePlainPool(pool).A() * 1000;
    }
    encoding >>= 170;
    uint256[] memory balances = new uint256[](tokens);
    for (uint256 i = 0; i < tokens; ++i) {
      balances[i] = ICurvePlainPool(pool).balances(i);
      // scale to 18 decimals
      balances[i] *= 10**(encoding & 255);
      encoding >>= 8;
    }
    uint256 invariant = StableMath.calculateInvariant(amp, balances);
    return StableMath.calculateSpotPrice(base_index, quote_index, amp, invariant, balances);
  }

  /// @dev Internal function to get spot price from Curve's plain pools (with oracle supported).
  /// @param encoding The encoding for the pool.
  function _getSpotPriceByCurvePlainWithOracle(uint256 encoding) internal view returns (uint256) {
    address pool = _getPool(encoding);
    uint256 base_index = (encoding >> 160) & 1;
    uint256 use_cache = (encoding >> 161) & 1;
    // @note The value of `last_price()` and `get_p()` normally are very close to it.
    // But `last_price()` uses less gas. So we add a flag to read from cache.
    uint256 last_price;
    if (use_cache == 1) {
      last_price = ICurvePoolOracle(pool).last_price();
    } else {
      last_price = ICurvePoolOracle(pool).get_p();
    }
    if (base_index == 0) {
      last_price = (PRECISION * PRECISION) / last_price;
    }
    return last_price;
  }

  /// @dev Internal function to get spot price from Curve's stable swap ng pools.
  /// @param encoding The encoding for the pool.
  function _getSpotPriceByCurvePlainNG(uint256 encoding) internal view returns (uint256) {
    address pool = _getPool(encoding);
    uint256 base_index = (encoding >> 160) & 7;
    uint256 quote_index = (encoding >> 163) & 7;
    uint256 use_cache = (encoding >> 166) & 1;
    uint256 base_price = PRECISION;
    uint256 quote_price = PRECISION;
    // @note The value of `last_price(index)` and `get_p(index)` normally are very close to it.
    // But `last_price(index)` uses less gas. So we add a flag to read from cache.
    if (use_cache == 1) {
      if (base_index > 0) base_price = ICurvePoolOracle(pool).last_price(base_index - 1);
      if (quote_index > 0) quote_price = ICurvePoolOracle(pool).last_price(quote_index - 1);
    } else {
      if (base_index > 0) base_price = ICurvePoolOracle(pool).get_p(base_index - 1);
      if (quote_index > 0) quote_price = ICurvePoolOracle(pool).get_p(quote_index - 1);
    }
    return (base_price * PRECISION) / quote_price;
  }

  /// @dev Internal function to get spot price from Curve's crypto pools (with only two tokens).
  /// @param encoding The encoding for the pool.
  function _getSpotPriceByCurveCrypto(uint256 encoding) internal view returns (uint256) {
    address pool = _getPool(encoding);
    uint256 base_index = (encoding >> 160) & 1;
    uint256 last_price = ICurvePoolOracle(pool).last_prices();
    if (base_index == 0) {
      last_price = (PRECISION * PRECISION) / last_price;
    }
    return last_price;
  }

  /// @dev Internal function to get spot price from Curve's TriCrypto pools (with three tokens).
  /// @param encoding The encoding for the pool.
  function _getSpotPriceByCurveTriCrypto(uint256 encoding) internal view returns (uint256) {
    address pool = _getPool(encoding);
    uint256 base_index = (encoding >> 160) & 3;
    uint256 quote_index = (encoding >> 162) & 3;
    if (quote_index == 0) {
      return ICurvePoolOracle(pool).last_prices(base_index - 1);
    } else if (base_index == 0) {
      return (PRECISION * PRECISION) / ICurvePoolOracle(pool).last_prices(quote_index - 1);
    } else {
      uint256 base_price = ICurvePoolOracle(pool).last_prices(base_index - 1);
      uint256 quote_price = ICurvePoolOracle(pool).last_prices(quote_index - 1);
      return (base_price * PRECISION) / quote_price;
    }
  }

  /// @dev Internal function to get spot price from ERC4626 vault.
  /// @param encoding The encoding for the pool.
  function _getSpotPriceByERC4626(uint256 encoding) internal view returns (uint256) {
    address pool = _getPool(encoding);
    uint256 base_is_underlying = (encoding >> 160) & 1;
    return base_is_underlying == 1 ? IERC4626(pool).convertToShares(1 ether) : IERC4626(pool).convertToAssets(1 ether);
  }

  /// @dev Internal function to get spot price from LSD wrapper.
  /// @param encoding The encoding for the pool.
  function _getSpotPriceByLSD(uint256 encoding) internal view returns (uint256) {
    address pool = _getPool(encoding);
    uint256 base_is_ETH = (encoding >> 160) & 1;
    if (pool == wstETH) {
      return
        base_is_ETH == 1 ? ILidoWstETH(pool).getWstETHByStETH(1 ether) : ILidoWstETH(pool).getStETHByWstETH(1 ether);
    } else if (pool == weETH) {
      return
        base_is_ETH == 1 ? IEtherFiWeETH(pool).getWeETHByeETH(1 ether) : IEtherFiWeETH(pool).getEETHByWeETH(1 ether);
    } else if (pool == ezETH) {
      uint256 rate = IFxRateProvider(ezETH_RATE_PROVIDER).getRate();
      return base_is_ETH == 1 ? (PRECISION * PRECISION) / rate : rate;
    } else {
      revert ErrorInvalidEncoding();
    }
  }

  /// @dev Internal function to get spot price from Balancer V2 TokenRateCache.
  /// @param encoding The encoding for the pool.
  function _getSpotPriceByBalancerV2RateCache(uint256 encoding) internal view returns (uint256) {
    address pool = _getPool(encoding);
    bytes32 poolId = IBalancerPool(pool).getPoolId();
    (address[] memory tokens, , ) = IBalancerVault(BALANCER_VAULT).getPoolTokens(poolId);
    uint256 base_index = (encoding >> 160) & 7;
    (uint256 rate, , , ) = IBalancerPool(pool).getTokenRateCache(tokens[base_index]);
    return rate;
  }

  /// @dev Internal function to get the address of pool.
  /// @param encoding The route encoding.
  function _getPool(uint256 encoding) internal pure returns (address) {
    return address(uint160(encoding & 1461501637330902918203684832716283019655932542975));
  }
}
