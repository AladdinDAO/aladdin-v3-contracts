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

  uint256 private constant PRECISION = 1e18;

  uint256 private constant HALF_PRECISION = 1e9;

  uint256 private constant E96 = 2**96;

  address private constant wstETH = 0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0;

  address private constant weETH = 0xCd5fE23C85820F7B72D0926FC9b05b43E359b7ee;

  address private constant ezETH = 0xbf5495Efe5DB9ce00f80364C8B423567e58d2110;

  address private constant ezETH_RATE_PROVIDER = 0x387dBc0fB00b26fb085aa658527D5BE98302c84C;

  address private constant BALANCER_VAULT = 0xBA12222222228d8Ba445958a75a0704d566BF2C8;

  /**********
   * Events *
   **********/

  event UpdateReader(uint256 poolType, address oldReader, address newReader);

  /**********
   * Errors *
   **********/

  error ErrorInvalidEncoding();

  error ErrorUnsupportedPoolType();

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
    } else {
      revert ErrorUnsupportedPoolType();
    }
  }

  /****************************
   * Public Mutated Functions *
   ****************************/

  function updateReader(uint256 poolType, address newReader) external onlyOwner {
    address oldReader = readers[poolType];
    readers[poolType] = newReader;

    emit UpdateReader(poolType, oldReader, newReader);
  }

  /**********************
   * Internal Functions *
   **********************/

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
    // (base*base_scale)/(quote*quote_scale) = (sqrtPriceX96^2 * base_scale) / (2^192 * quote_scale)
    // (sqrtPriceX96^2 * base_scale * 10^18) / (2^192 * quote_scale)
    // ((sqrtPriceX96 * 10^9) / 2^96)^2 * base_scale / quote_scale
    if (base_scale > quote_scale) {
      uint256 scale = Math.sqrt(base_scale / quote_scale);
      uint256 price = (sqrtPriceX96 * HALF_PRECISION * scale) / E96;
      return price * price;
    } else {
      uint256 price = (sqrtPriceX96 * HALF_PRECISION) / E96;
      return (price * price) / (quote_scale / base_scale);
    }
  }

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
      realBalances[j] = (balances[j] * scales[j]) / PRECISION;
      j += 1;
    }
    (uint256 amp, , ) = IBalancerPool(pool).getAmplificationParameter();
    uint256 invariant = StableMath.calculateInvariant(amp, realBalances);
    return StableMath.calculateSpotPrice(base_index, quote_index, amp, invariant, realBalances);
  }

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

  function _getSpotPriceByCurvePlainWithOracle(uint256 encoding) internal view returns (uint256) {
    address pool = _getPool(encoding);
    uint256 base_index = (encoding >> 160) & 1;
    uint256 last_price = ICurvePoolOracle(pool).get_p();
    if (base_index == 0) {
      last_price = (PRECISION * PRECISION) / last_price;
    }
    return last_price;
  }

  function _getSpotPriceByCurvePlainNG(uint256 encoding) internal view returns (uint256) {
    address pool = _getPool(encoding);
    uint256 base_index = (encoding >> 160) & 7;
    uint256 quote_index = (encoding >> 163) & 7;
    if (quote_index == 0) {
      return ICurvePoolOracle(pool).get_p(base_index - 1);
    } else if (base_index == 0) {
      return (PRECISION * PRECISION) / ICurvePoolOracle(pool).get_p(quote_index - 1);
    } else {
      uint256 base_price = ICurvePoolOracle(pool).get_p(base_index - 1);
      uint256 quote_price = ICurvePoolOracle(pool).get_p(quote_index - 1);
      return (base_price * PRECISION) / quote_price;
    }
  }

  function _getSpotPriceByCurveCrypto(uint256 encoding) internal view returns (uint256) {
    address pool = _getPool(encoding);
    uint256 base_index = (encoding >> 160) & 1;
    uint256 last_price = ICurvePoolOracle(pool).last_prices();
    if (base_index == 0) {
      last_price = (PRECISION * PRECISION) / last_price;
    }
    return last_price;
  }

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

  function _getSpotPriceByERC4626(uint256 encoding) internal view returns (uint256) {
    address pool = _getPool(encoding);
    uint256 base_is_underlying = (encoding >> 160) & 1;
    return base_is_underlying == 1 ? IERC4626(pool).convertToShares(1 ether) : IERC4626(pool).convertToAssets(1 ether);
  }

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

  /// @dev Internal function to get the address of pool.
  /// @param encoding The route encoding.
  function _getPool(uint256 encoding) internal pure returns (address) {
    return address(uint160(encoding & 1461501637330902918203684832716283019655932542975));
  }
}
