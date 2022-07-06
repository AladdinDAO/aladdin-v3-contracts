/* eslint-disable node/no-missing-import */
import { BigNumber } from "ethers";
import { Action, ADDRESS, encodePoolHintV2, PoolType } from ".";

export const VAULT_CONFIG: {
  [name: string]: {
    token: string;
    fees: {
      withdraw: number;
      harvest: number;
      platform: number;
    };
    deposit: {
      [token: string]: BigNumber[];
    };
    withdraw: {
      [token: string]: BigNumber[];
    };
  };
} = {
  cvxfxs: {
    token: "CURVE_CVXFXS",
    fees: {
      withdraw: 30e5, // 0.30%
      harvest: 1e7, // 1%
      platform: 1e7, // 1%
    },
    deposit: {
      FXS: [encodePoolHintV2(ADDRESS.CURVE_CVXFXS_POOL, PoolType.CurveCryptoPool, 2, 0, 0, Action.AddLiquidity)],
      cvxFXS: [encodePoolHintV2(ADDRESS.CURVE_CVXFXS_POOL, PoolType.CurveCryptoPool, 2, 1, 1, Action.AddLiquidity)],
      // WETH ==(UniV3)==> USDC ==(UniV3)==> FRAX ==(UniV2)==> FXS
      WETH: [
        encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 1, 0, Action.Swap),
        encodePoolHintV2(ADDRESS.FRAX_USDC_UNIV3, PoolType.UniswapV3, 2, 1, 0, Action.Swap),
        encodePoolHintV2(ADDRESS.FXS_FRAX_UNIV2, PoolType.UniswapV2, 2, 1, 0, Action.Swap),
        encodePoolHintV2(ADDRESS.CURVE_CVXFXS_POOL, PoolType.CurveCryptoPool, 2, 0, 0, Action.AddLiquidity),
      ],
      // USDC ==(UniV3)==> FRAX ==(UniV2)==> FXS
      USDC: [
        encodePoolHintV2(ADDRESS.FRAX_USDC_UNIV3, PoolType.UniswapV3, 2, 1, 0, Action.Swap),
        encodePoolHintV2(ADDRESS.FXS_FRAX_UNIV2, PoolType.UniswapV2, 2, 1, 0, Action.Swap),
        encodePoolHintV2(ADDRESS.CURVE_CVXFXS_POOL, PoolType.CurveCryptoPool, 2, 0, 0, Action.AddLiquidity),
      ],
    },
    withdraw: {
      FXS: [encodePoolHintV2(ADDRESS.CURVE_CVXFXS_POOL, PoolType.CurveCryptoPool, 2, 0, 0, Action.RemoveLiquidity)],
      cvxFXS: [encodePoolHintV2(ADDRESS.CURVE_CVXFXS_POOL, PoolType.CurveCryptoPool, 2, 1, 1, Action.RemoveLiquidity)],
      // WETH <==(UniV3)== USDC <==(UniV3)== FRAX <==(UniV2)== FXS
      WETH: [
        encodePoolHintV2(ADDRESS.CURVE_CVXFXS_POOL, PoolType.CurveCryptoPool, 2, 0, 0, Action.RemoveLiquidity),
        encodePoolHintV2(ADDRESS.FXS_FRAX_UNIV2, PoolType.UniswapV2, 2, 0, 1, Action.Swap),
        encodePoolHintV2(ADDRESS.FRAX_USDC_UNIV3, PoolType.UniswapV3, 2, 0, 1, Action.Swap),
        encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 0, 1, Action.Swap),
      ],
      // USDC <==(UniV3)== FRAX <==(UniV2)== FXS
      USDC: [
        encodePoolHintV2(ADDRESS.CURVE_CVXFXS_POOL, PoolType.CurveCryptoPool, 2, 0, 0, Action.RemoveLiquidity),
        encodePoolHintV2(ADDRESS.FXS_FRAX_UNIV2, PoolType.UniswapV2, 2, 0, 1, Action.Swap),
        encodePoolHintV2(ADDRESS.FRAX_USDC_UNIV3, PoolType.UniswapV3, 2, 0, 1, Action.Swap),
      ],
    },
  },
};
