import { ADDRESS } from "./address";
import { SpotPricePoolType, encodeSpotPricePool, encodeSpotPriceSources } from "./codec";
import { TOKENS } from "./tokens";

/* eslint-disable prettier/prettier */
// prettier-ignore
export const SpotPricePool: { [name: string]: bigint } = {
  "CVX/WETH-CrvCrypto": encodeSpotPricePool(ADDRESS.CURVE_CVXETH_POOL, SpotPricePoolType.CurveCrypto, {base_index: 1}),
  "CVX/frxETH-CrvCrypto-234": encodeSpotPricePool(ADDRESS["CURVE_frxETH/CVX_POOL"], SpotPricePoolType.CurveCrypto, {base_index: 1}),
  "WBTC/USDC-CrvTriCrypto-0": encodeSpotPricePool(ADDRESS["CURVE_TRICRYPTO_USDC/WBTC/WETH_0_POOL"], SpotPricePoolType.CurveTriCrypto, {base_index: 1, quote_index: 0}),
  "WBTC/USDC-UniV3-0.3%": encodeSpotPricePool(ADDRESS["UniV3_WBTC/USDC_3000"], SpotPricePoolType.UniswapV3, {base_index: 0, base_scale: 10, quote_scale: 12}),
  "WBTC/WETH-UniV3-0.3%": encodeSpotPricePool(ADDRESS["UniV3_WBTC/WETH_3000"], SpotPricePoolType.UniswapV3, {base_index: 0, base_scale: 10, quote_scale: 0}),
  "WETH/USDC-UniV2": encodeSpotPricePool(ADDRESS["UniV2_USDC/WETH"], SpotPricePoolType.UniswapV2, {base_index: 1, base_scale: 0, quote_scale: 12}),
  "WETH/USDC-UniV3-0.05%": encodeSpotPricePool(ADDRESS["UniV3_USDC/WETH_500"], SpotPricePoolType.UniswapV3, {base_index: 1, base_scale: 0, quote_scale: 12}),
  "WETH/USDC-UniV3-0.3%": encodeSpotPricePool(ADDRESS["UniV3_USDC/WETH_3000"], SpotPricePoolType.UniswapV3, {base_index: 1, base_scale: 0, quote_scale: 12}),
  "WETH/USDC-CrvTriCrypto-0": encodeSpotPricePool(ADDRESS["CURVE_TRICRYPTO_USDC/WBTC/WETH_0_POOL"], SpotPricePoolType.CurveTriCrypto, {base_index: 2, quote_index: 0}),
  "eETH/WETH-CrvNG-22": encodeSpotPricePool(ADDRESS["CURVE_STABLE_NG_weETH/WETH_22_POOL"], SpotPricePoolType.CurvePlainNG, {base_index: 0, quote_index: 1, use_cache: true}),
  "eETH/weETH-LSD": encodeSpotPricePool(TOKENS.weETH.address, SpotPricePoolType.ETHLSD, {base_is_ETH: true}),
  "ezETH/WETH-BalV2-S": encodeSpotPricePool(ADDRESS["BalancerV2_ezETH/WETH_Stable"], SpotPricePoolType.BalancerV2Stable, {base_index: 0, quote_index: 1}),
  "ezETH/WETH-BalV2-C": encodeSpotPricePool(ADDRESS["BalancerV2_ezETH/WETH_Stable"], SpotPricePoolType.BalancerV2CachedRate, {base_index: 1}),
  "ezETH/WETH-CrvNG-79": encodeSpotPricePool(ADDRESS["CURVE_STABLE_NG_ezETH/WETH_79_POOL"], SpotPricePoolType.CurvePlainNG, {base_index: 0, quote_index: 1, use_cache: true}),
  "frxETH/WETH-CrvBase": encodeSpotPricePool(ADDRESS["CRV_BASE_ETH/frxETH_POOL"], SpotPricePoolType.CurvePlainWithOracle, {base_index: 1, use_cache: false}),
  "frxETH/WETH-CrvCrvUSD-15": encodeSpotPricePool(ADDRESS["CURVE_CRVUSD_WETH/frxETH_15_POOL"], SpotPricePoolType.CurvePlainWithOracle, {base_index: 1, use_cache: true}),
  "frxETH/stETH-CrvPlain-274": encodeSpotPricePool(ADDRESS["CRV_PLAIN_stETH/frxETH_274_POOL"], SpotPricePoolType.CurvePlain, {tokens: 2, base_index: 1, quote_index: 0, has_amm_precise: true, scales: [0, 0]}),
  "stETH/WETH-BalV2-S": encodeSpotPricePool(ADDRESS["BalV2_wstETH/WETH_Stable"], SpotPricePoolType.BalancerV2Stable, {base_index: 0, quote_index: 1}),
  "stETH/WETH-CrvBase": encodeSpotPricePool(ADDRESS["CRV_BASE_ETH/stETH_POOL"], SpotPricePoolType.CurvePlain, {tokens: 2, base_index: 1, quote_index: 0, has_amm_precise: true, scales: [0, 0]}),
  "stETH/WETH-CrvPlain-303": encodeSpotPricePool(ADDRESS["CRV_PLAIN_ETH/stETH_303_POOL"], SpotPricePoolType.CurvePlainWithOracle, {base_index: 1, use_cache: true}),
  "stETH/wstETH-LSD": encodeSpotPricePool(TOKENS.wstETH.address, SpotPricePoolType.ETHLSD, {base_is_ETH: true}),
  "weETH/WETH-UniV3-0.05%": encodeSpotPricePool(ADDRESS["UniV3_WETH/weETH_500"], SpotPricePoolType.UniswapV3, {base_index: 1, base_scale: 0, quote_scale: 0}),
  "weETH/wstETH-UniV3-0.05%": encodeSpotPricePool(ADDRESS["UniV3_wstETH/weETH_500"], SpotPricePoolType.UniswapV3, {base_index: 1, base_scale: 0, quote_scale: 0}),
  "wstETH/WETH-UniV3-0.01%": encodeSpotPricePool(ADDRESS["UniV3_wstETH/WETH_100"], SpotPricePoolType.UniswapV3, {base_index: 0, base_scale: 0, quote_scale: 0}),
  "wstETH/stETH-LSD": encodeSpotPricePool(TOKENS.wstETH.address, SpotPricePoolType.ETHLSD, {base_is_ETH: false}),
};

// prettier-ignore
export const SpotPriceEncodings: { [pair: string]: string } = {
  "CVX/WETH": encodeSpotPriceSources([
    [SpotPricePool["CVX/WETH-CrvCrypto"]],
    // [SpotPricePool["CVX/frxETH-CrvCrypto-234"], SpotPricePool["frxETH/WETH-CrvCrvUSD-15"]]
  ]),
  "WBTC/USDC": encodeSpotPriceSources([
    [SpotPricePool["WBTC/WETH-UniV3-0.3%"], SpotPricePool["WETH/USDC-UniV3-0.05%"]],
    [SpotPricePool["WBTC/USDC-CrvTriCrypto-0"]],
    [SpotPricePool["WBTC/USDC-UniV3-0.3%"]],
  ]),
  "WETH/USDC": encodeSpotPriceSources([
    [SpotPricePool["WETH/USDC-UniV2"]],
    [SpotPricePool["WETH/USDC-UniV3-0.05%"]],
    [SpotPricePool["WETH/USDC-UniV3-0.3%"]],
    // [SpotPricePool["WETH/USDC-CrvTriCrypto-0"]],
  ]),
  "eETH/WETH": encodeSpotPriceSources([
    [SpotPricePool["weETH/WETH-UniV3-0.05%"], SpotPricePool["eETH/weETH-LSD"]],
    [SpotPricePool["eETH/weETH-LSD"], SpotPricePool["weETH/wstETH-UniV3-0.05%"], SpotPricePool["wstETH/WETH-UniV3-0.01%"]],
    [SpotPricePool["eETH/WETH-CrvNG-22"]],
  ]),
  "ezETH/WETH": encodeSpotPriceSources([
    [SpotPricePool["ezETH/WETH-CrvNG-79"]],
    [SpotPricePool["ezETH/WETH-BalV2-S"]]
  ]),
  "frxETH/WETH": encodeSpotPriceSources([
    [SpotPricePool["frxETH/WETH-CrvBase"]],
    [SpotPricePool["frxETH/WETH-CrvCrvUSD-15"]],
    [SpotPricePool["frxETH/stETH-CrvPlain-274"], SpotPricePool["stETH/WETH-CrvBase"]]
  ]),
  "stETH/WETH": encodeSpotPriceSources([
    [SpotPricePool["stETH/wstETH-LSD"], SpotPricePool["wstETH/WETH-UniV3-0.01%"]],
    [SpotPricePool["stETH/WETH-BalV2-S"]],
    [SpotPricePool["stETH/WETH-CrvPlain-303"]],
    [SpotPricePool["stETH/WETH-CrvBase"]],
  ]),
}
/* eslint-enable prettier/prettier */
