/* eslint-disable node/no-missing-import */
import { BigNumber } from "ethers";
import { Action, ADDRESS, encodePoolHintV2, PoolType } from ".";

export const VAULT_CONFIG: {
  [name: string]: {
    token: string;
    convexId: number;
    rewards: string[];
    deposit: {
      [token: string]: BigNumber[];
    };
    withdraw: {
      [token: string]: BigNumber[];
    };
  };
} = {
  steth: {
    token: "CURVE_STETH",
    convexId: 25,
    rewards: [ADDRESS.CRV, ADDRESS.CVX, ADDRESS.LDO],
    deposit: {
      WETH: [encodePoolHintV2(ADDRESS.CURVE_STETH_POOL, PoolType.CurveETHPool, 2, 0, 0, Action.AddLiquidity)],
      stETH: [encodePoolHintV2(ADDRESS.CURVE_STETH_POOL, PoolType.CurveETHPool, 2, 1, 1, Action.AddLiquidity)],
      // USDC ==(UniV3)==> WETH
      USDC: [
        encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 0, 1, Action.Swap),
        encodePoolHintV2(ADDRESS.CURVE_STETH_POOL, PoolType.CurveETHPool, 2, 0, 0, Action.AddLiquidity),
      ],
    },
    withdraw: {
      WETH: [encodePoolHintV2(ADDRESS.CURVE_STETH_POOL, PoolType.CurveETHPool, 2, 0, 0, Action.RemoveLiquidity)],
      stETH: [encodePoolHintV2(ADDRESS.CURVE_STETH_POOL, PoolType.CurveETHPool, 2, 1, 1, Action.RemoveLiquidity)],
      // WETH ==(UniV3)==> WETH
      USDC: [
        encodePoolHintV2(ADDRESS.CURVE_STETH_POOL, PoolType.CurveETHPool, 2, 0, 0, Action.RemoveLiquidity),
        encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 1, 0, Action.Swap),
      ],
    },
  },
  frax: {
    token: "CURVE_FRAX3CRV",
    convexId: 32,
    rewards: [ADDRESS.CRV, ADDRESS.CVX, ADDRESS.FXS],
    deposit: {
      FRAX: [
        encodePoolHintV2(ADDRESS.CURVE_FRAX3CRV_POOL, PoolType.CurveFactoryMetaPool, 2, 0, 0, Action.AddLiquidity),
      ],
      TRICRV: [
        encodePoolHintV2(ADDRESS.CURVE_FRAX3CRV_POOL, PoolType.CurveFactoryMetaPool, 2, 1, 1, Action.AddLiquidity),
      ],
      DAI: [
        encodePoolHintV2(
          ADDRESS.CURVE_FRAX3CRV_POOL,
          PoolType.CurveFactoryUSDMetaPoolUnderlying,
          4,
          1,
          1,
          Action.AddLiquidity
        ),
      ],
      USDC: [
        encodePoolHintV2(
          ADDRESS.CURVE_FRAX3CRV_POOL,
          PoolType.CurveFactoryUSDMetaPoolUnderlying,
          4,
          2,
          2,
          Action.AddLiquidity
        ),
      ],
      USDT: [
        encodePoolHintV2(
          ADDRESS.CURVE_FRAX3CRV_POOL,
          PoolType.CurveFactoryUSDMetaPoolUnderlying,
          4,
          3,
          3,
          Action.AddLiquidity
        ),
      ],
      // WETH ==(UniV3)==> USDT
      WETH: [
        encodePoolHintV2(ADDRESS.WETH_USDT_UNIV3, PoolType.UniswapV3, 2, 0, 1, Action.Swap),
        encodePoolHintV2(
          ADDRESS.CURVE_FRAX3CRV_POOL,
          PoolType.CurveFactoryUSDMetaPoolUnderlying,
          4,
          3,
          3,
          Action.AddLiquidity
        ),
      ],
    },
    withdraw: {
      FRAX: [
        encodePoolHintV2(ADDRESS.CURVE_FRAX3CRV_POOL, PoolType.CurveFactoryMetaPool, 2, 0, 0, Action.RemoveLiquidity),
      ],
      TRICRV: [
        encodePoolHintV2(ADDRESS.CURVE_FRAX3CRV_POOL, PoolType.CurveFactoryMetaPool, 2, 1, 1, Action.RemoveLiquidity),
      ],
      DAI: [
        encodePoolHintV2(
          ADDRESS.CURVE_FRAX3CRV_POOL,
          PoolType.CurveFactoryUSDMetaPoolUnderlying,
          4,
          1,
          1,
          Action.RemoveLiquidity
        ),
      ],
      USDC: [
        encodePoolHintV2(
          ADDRESS.CURVE_FRAX3CRV_POOL,
          PoolType.CurveFactoryUSDMetaPoolUnderlying,
          4,
          2,
          2,
          Action.RemoveLiquidity
        ),
      ],
      USDT: [
        encodePoolHintV2(
          ADDRESS.CURVE_FRAX3CRV_POOL,
          PoolType.CurveFactoryUSDMetaPoolUnderlying,
          4,
          3,
          3,
          Action.RemoveLiquidity
        ),
      ],
    },
  },
  tricrypto2: {
    token: "CURVE_TRICRYPTO",
    convexId: 38,
    rewards: [ADDRESS.CRV, ADDRESS.CVX],
    deposit: {
      USDT: [encodePoolHintV2(ADDRESS.CURVE_TRICRYPTO_POOL, PoolType.CurveTriCryptoPool, 3, 0, 0, Action.AddLiquidity)],
      WBTC: [encodePoolHintV2(ADDRESS.CURVE_TRICRYPTO_POOL, PoolType.CurveTriCryptoPool, 3, 1, 1, Action.AddLiquidity)],
      WETH: [encodePoolHintV2(ADDRESS.CURVE_TRICRYPTO_POOL, PoolType.CurveTriCryptoPool, 3, 2, 2, Action.AddLiquidity)],
      // USDC ==(UniV3)==> USDT
      USDC: [
        encodePoolHintV2(ADDRESS.USDC_USDT_UNIV3, PoolType.UniswapV3, 2, 0, 1, Action.Swap),
        encodePoolHintV2(ADDRESS.CURVE_TRICRYPTO_POOL, PoolType.CurveTriCryptoPool, 3, 0, 0, Action.AddLiquidity),
      ],
    },
    withdraw: {
      USDT: [
        encodePoolHintV2(ADDRESS.CURVE_TRICRYPTO_POOL, PoolType.CurveTriCryptoPool, 3, 0, 0, Action.RemoveLiquidity),
      ],
      WBTC: [
        encodePoolHintV2(ADDRESS.CURVE_TRICRYPTO_POOL, PoolType.CurveTriCryptoPool, 3, 1, 1, Action.RemoveLiquidity),
      ],
      WETH: [
        encodePoolHintV2(ADDRESS.CURVE_TRICRYPTO_POOL, PoolType.CurveTriCryptoPool, 3, 2, 2, Action.RemoveLiquidity),
      ],
    },
  },
  cvxcrv: {
    token: "CURVE_CVXCRV",
    convexId: 41,
    rewards: [ADDRESS.CRV, ADDRESS.CVX],
    deposit: {
      CRV: [encodePoolHintV2(ADDRESS.CURVE_CVXCRV_POOL, PoolType.CurveFactoryPlainPool, 2, 0, 0, Action.AddLiquidity)],
      cvxCRV: [
        encodePoolHintV2(ADDRESS.CURVE_CVXCRV_POOL, PoolType.CurveFactoryPlainPool, 2, 1, 1, Action.AddLiquidity),
      ],
      // WETH ==(CurveV2)==> CRV
      WETH: [
        encodePoolHintV2(ADDRESS.CURVE_CRVETH_POOL, PoolType.CurveCryptoPool, 2, 0, 1, Action.Swap),
        encodePoolHintV2(ADDRESS.CURVE_CVXCRV_POOL, PoolType.CurveFactoryPlainPool, 2, 0, 0, Action.AddLiquidity),
      ],
      // USDC ==(UniV3)==> WETH ==(CurveV2)==> CRV
      USDC: [
        encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 0, 1, Action.Swap),
        encodePoolHintV2(ADDRESS.CURVE_CRVETH_POOL, PoolType.CurveCryptoPool, 2, 0, 1, Action.Swap),
        encodePoolHintV2(ADDRESS.CURVE_CVXCRV_POOL, PoolType.CurveFactoryPlainPool, 2, 0, 0, Action.AddLiquidity),
      ],
    },
    withdraw: {
      CRV: [
        encodePoolHintV2(ADDRESS.CURVE_CVXCRV_POOL, PoolType.CurveFactoryPlainPool, 2, 0, 0, Action.RemoveLiquidity),
      ],
      cvxCRV: [
        encodePoolHintV2(ADDRESS.CURVE_CVXCRV_POOL, PoolType.CurveFactoryPlainPool, 2, 1, 1, Action.RemoveLiquidity),
      ],
    },
  },
  crveth: {
    token: "CURVE_CRVETH",
    convexId: 61,
    rewards: [ADDRESS.CRV, ADDRESS.CVX],
    deposit: {
      WETH: [encodePoolHintV2(ADDRESS.CURVE_CRVETH_POOL, PoolType.CurveCryptoPool, 2, 0, 0, Action.AddLiquidity)],
      CRV: [encodePoolHintV2(ADDRESS.CURVE_CRVETH_POOL, PoolType.CurveCryptoPool, 2, 1, 1, Action.AddLiquidity)],
      // USDC ==(UniV3)==> WETH => CURVE_CRVETH
      USDC: [
        encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 0, 1, Action.Swap),
        encodePoolHintV2(ADDRESS.CURVE_CRVETH_POOL, PoolType.CurveCryptoPool, 2, 0, 0, Action.AddLiquidity),
      ],
    },
    withdraw: {
      WETH: [encodePoolHintV2(ADDRESS.CURVE_CRVETH_POOL, PoolType.CurveCryptoPool, 2, 0, 0, Action.RemoveLiquidity)],
      CRV: [encodePoolHintV2(ADDRESS.CURVE_CRVETH_POOL, PoolType.CurveCryptoPool, 2, 1, 1, Action.RemoveLiquidity)],
    },
  },
  cvxeth: {
    token: "CURVE_CVXETH",
    convexId: 64,
    rewards: [ADDRESS.CRV, ADDRESS.CVX],
    deposit: {
      WETH: [encodePoolHintV2(ADDRESS.CURVE_CVXETH_POOL, PoolType.CurveCryptoPool, 2, 0, 0, Action.AddLiquidity)],
      CVX: [encodePoolHintV2(ADDRESS.CURVE_CVXETH_POOL, PoolType.CurveCryptoPool, 2, 1, 1, Action.AddLiquidity)],
      // USDC ==(UniV3)==> WETH
      USDC: [
        encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 0, 1, Action.Swap),
        encodePoolHintV2(ADDRESS.CURVE_CVXETH_POOL, PoolType.CurveCryptoPool, 2, 0, 0, Action.AddLiquidity),
      ],
    },
    withdraw: {
      WETH: [encodePoolHintV2(ADDRESS.CURVE_CVXETH_POOL, PoolType.CurveCryptoPool, 2, 0, 0, Action.RemoveLiquidity)],
      CVX: [encodePoolHintV2(ADDRESS.CURVE_CVXETH_POOL, PoolType.CurveCryptoPool, 2, 1, 1, Action.RemoveLiquidity)],
    },
  },
  cvxfxs: {
    token: "CURVE_CVXFXS",
    convexId: 72,
    rewards: [ADDRESS.CRV, ADDRESS.CVX, ADDRESS.FXS],
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
  "3pool": {
    token: "CURVE_TRICRV",
    convexId: 9,
    rewards: [ADDRESS.CVX, ADDRESS.CRV],
    deposit: {
      DAI: [encodePoolHintV2(ADDRESS.CURVE_TRICRV_POOL, PoolType.CurveBasePool, 3, 0, 0, Action.AddLiquidity)],
      USDC: [encodePoolHintV2(ADDRESS.CURVE_TRICRV_POOL, PoolType.CurveBasePool, 3, 1, 1, Action.AddLiquidity)],
      USDT: [encodePoolHintV2(ADDRESS.CURVE_TRICRV_POOL, PoolType.CurveBasePool, 3, 2, 2, Action.AddLiquidity)],
      // WETH ==(UniV3)==> USDT
      WETH: [
        encodePoolHintV2(ADDRESS.WETH_USDT_UNIV3, PoolType.UniswapV3, 2, 0, 1, Action.Swap),
        encodePoolHintV2(ADDRESS.CURVE_TRICRV_POOL, PoolType.CurveBasePool, 3, 2, 2, Action.AddLiquidity),
      ],
    },
    withdraw: {
      DAI: [encodePoolHintV2(ADDRESS.CURVE_TRICRV_POOL, PoolType.CurveBasePool, 2, 0, 0, Action.RemoveLiquidity)],
      USDC: [encodePoolHintV2(ADDRESS.CURVE_TRICRV_POOL, PoolType.CurveBasePool, 2, 1, 1, Action.RemoveLiquidity)],
      USDT: [encodePoolHintV2(ADDRESS.CURVE_TRICRV_POOL, PoolType.CurveBasePool, 2, 2, 2, Action.RemoveLiquidity)],
    },
  },
  "ust-wormhole": {
    token: "CURVE_UST_WORMHOLE",
    convexId: 59,
    rewards: [ADDRESS.CVX, ADDRESS.CRV],
    deposit: {
      UST_WORMHOLE: [
        encodePoolHintV2(ADDRESS.CURVE_UST_WORMHOLE_POOL, PoolType.CurveFactoryMetaPool, 2, 0, 0, Action.AddLiquidity),
      ],
      TRICRV: [
        encodePoolHintV2(ADDRESS.CURVE_UST_WORMHOLE_POOL, PoolType.CurveFactoryMetaPool, 2, 1, 1, Action.AddLiquidity),
      ],
      DAI: [
        encodePoolHintV2(
          ADDRESS.CURVE_UST_WORMHOLE_POOL,
          PoolType.CurveFactoryUSDMetaPoolUnderlying,
          4,
          1,
          1,
          Action.AddLiquidity
        ),
      ],
      USDC: [
        encodePoolHintV2(
          ADDRESS.CURVE_UST_WORMHOLE_POOL,
          PoolType.CurveFactoryUSDMetaPoolUnderlying,
          4,
          2,
          2,
          Action.AddLiquidity
        ),
      ],
      USDT: [
        encodePoolHintV2(
          ADDRESS.CURVE_UST_WORMHOLE_POOL,
          PoolType.CurveFactoryUSDMetaPoolUnderlying,
          4,
          3,
          3,
          Action.AddLiquidity
        ),
      ],
      // WETH ==(UniV3)==> USDT

      WETH: [
        encodePoolHintV2(ADDRESS.WETH_USDT_UNIV3, PoolType.UniswapV3, 2, 0, 1, Action.Swap),
        encodePoolHintV2(
          ADDRESS.CURVE_UST_WORMHOLE_POOL,
          PoolType.CurveFactoryUSDMetaPoolUnderlying,
          4,
          3,
          3,
          Action.AddLiquidity
        ),
      ],
      // UST_TERRA ==(UniV3)==> USDC
      UST_TERRA: [
        encodePoolHintV2(ADDRESS.USDC_UST_TERRA_UNIV3, PoolType.UniswapV3, 2, 1, 0, Action.Swap),
        encodePoolHintV2(
          ADDRESS.CURVE_UST_WORMHOLE_POOL,
          PoolType.CurveFactoryUSDMetaPoolUnderlying,
          4,
          2,
          2,
          Action.AddLiquidity
        ),
      ],
    },
    withdraw: {
      UST_WORMHOLE: [
        encodePoolHintV2(
          ADDRESS.CURVE_UST_WORMHOLE_POOL,
          PoolType.CurveFactoryMetaPool,
          2,
          0,
          0,
          Action.RemoveLiquidity
        ),
      ],
      TRICRV: [
        encodePoolHintV2(
          ADDRESS.CURVE_UST_WORMHOLE_POOL,
          PoolType.CurveFactoryMetaPool,
          2,
          1,
          1,
          Action.RemoveLiquidity
        ),
      ],
      DAI: [
        encodePoolHintV2(
          ADDRESS.CURVE_UST_WORMHOLE_POOL,
          PoolType.CurveFactoryUSDMetaPoolUnderlying,
          4,
          1,
          1,
          Action.RemoveLiquidity
        ),
      ],
      USDC: [
        encodePoolHintV2(
          ADDRESS.CURVE_UST_WORMHOLE_POOL,
          PoolType.CurveFactoryUSDMetaPoolUnderlying,
          4,
          2,
          2,
          Action.RemoveLiquidity
        ),
      ],
      USDT: [
        encodePoolHintV2(
          ADDRESS.CURVE_UST_WORMHOLE_POOL,
          PoolType.CurveFactoryUSDMetaPoolUnderlying,
          4,
          3,
          3,
          Action.RemoveLiquidity
        ),
      ],
    },
  },
  "rocket-pool-eth": {
    token: "CURVE_ROCKETETH",
    convexId: 73,
    rewards: [ADDRESS.CVX, ADDRESS.CRV],
    deposit: {
      rETH: [
        encodePoolHintV2(ADDRESS.CURVE_ROCKETETH_POOL, PoolType.CurveFactoryPlainPool, 2, 0, 0, Action.AddLiquidity),
      ],
      wstETH: [
        encodePoolHintV2(ADDRESS.CURVE_ROCKETETH_POOL, PoolType.CurveFactoryPlainPool, 2, 1, 1, Action.AddLiquidity),
      ],
      // stETH ==(LidoWrap)==> wstETH
      stETH: [
        encodePoolHintV2(ADDRESS.wstETH, PoolType.LidoWrap, 2, 0, 0, Action.AddLiquidity),
        encodePoolHintV2(ADDRESS.CURVE_ROCKETETH_POOL, PoolType.CurveFactoryPlainPool, 2, 1, 1, Action.AddLiquidity),
      ],
      // WETH ==(LidoStake)==> stETH ==(LidoWrap)==> wstETH
      WETH: [
        encodePoolHintV2(ADDRESS.stETH, PoolType.LidoStake, 2, 0, 0, Action.AddLiquidity),
        encodePoolHintV2(ADDRESS.wstETH, PoolType.LidoWrap, 2, 0, 0, Action.AddLiquidity),
        encodePoolHintV2(ADDRESS.CURVE_ROCKETETH_POOL, PoolType.CurveFactoryPlainPool, 2, 1, 1, Action.AddLiquidity),
      ],
      // USDC ==(UniV3)==> WETH ==(LidoStake)==> stETH ==(LidoWrap)==> wstETH
      USDC: [
        encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 0, 1, Action.Swap),
        encodePoolHintV2(ADDRESS.stETH, PoolType.LidoStake, 2, 0, 0, Action.AddLiquidity),
        encodePoolHintV2(ADDRESS.wstETH, PoolType.LidoWrap, 2, 0, 0, Action.AddLiquidity),
        encodePoolHintV2(ADDRESS.CURVE_ROCKETETH_POOL, PoolType.CurveFactoryPlainPool, 2, 1, 1, Action.AddLiquidity),
      ],
    },
    withdraw: {
      rETH: [
        encodePoolHintV2(ADDRESS.CURVE_ROCKETETH_POOL, PoolType.CurveFactoryPlainPool, 2, 0, 0, Action.RemoveLiquidity),
      ],
      wstETH: [
        encodePoolHintV2(ADDRESS.CURVE_ROCKETETH_POOL, PoolType.CurveFactoryPlainPool, 2, 1, 1, Action.RemoveLiquidity),
      ],
      // wstETH ==(LidoUnwrap)==> stETH
      stETH: [
        encodePoolHintV2(ADDRESS.CURVE_ROCKETETH_POOL, PoolType.CurveFactoryPlainPool, 2, 1, 1, Action.RemoveLiquidity),
        encodePoolHintV2(ADDRESS.wstETH, PoolType.LidoWrap, 2, 0, 0, Action.RemoveLiquidity),
      ],
    },
  },
  ren: {
    token: "CURVE_REN",
    convexId: 6,
    rewards: [ADDRESS.CVX, ADDRESS.CRV],
    deposit: {
      renBTC: [encodePoolHintV2(ADDRESS.CURVE_REN_POOL, PoolType.CurveBasePool, 2, 0, 0, Action.AddLiquidity)],
      WBTC: [encodePoolHintV2(ADDRESS.CURVE_REN_POOL, PoolType.CurveBasePool, 2, 1, 1, Action.AddLiquidity)],
      // WETH ==(UniV3)==> WBTC
      WETH: [
        encodePoolHintV2(ADDRESS.WBTC_WETH_UNIV3_500, PoolType.UniswapV3, 2, 1, 0, Action.Swap),
        encodePoolHintV2(ADDRESS.CURVE_REN_POOL, PoolType.CurveBasePool, 2, 1, 1, Action.AddLiquidity),
      ],
      // USDC ==(Curve)==> USDT ==(Curve)==> WBTC
      USDC: [
        encodePoolHintV2(ADDRESS.CURVE_TRICRV_POOL, PoolType.CurveBasePool, 3, 1, 2, Action.Swap),
        encodePoolHintV2(ADDRESS.CURVE_TRICRYPTO_POOL, PoolType.CurveTriCryptoPool, 3, 0, 1, Action.Swap),
        encodePoolHintV2(ADDRESS.CURVE_REN_POOL, PoolType.CurveBasePool, 2, 1, 1, Action.AddLiquidity),
      ],
    },
    withdraw: {},
  },
  pusd: {
    token: "CURVE_PUSD3CRV",
    convexId: 91,
    rewards: [ADDRESS.CVX, ADDRESS.CRV],
    deposit: {
      PUSD: [
        encodePoolHintV2(ADDRESS.CURVE_PUSD3CRV_POOL, PoolType.CurveFactoryMetaPool, 2, 0, 0, Action.AddLiquidity),
      ],
      TRICRV: [
        encodePoolHintV2(ADDRESS.CURVE_PUSD3CRV_POOL, PoolType.CurveFactoryMetaPool, 2, 1, 1, Action.AddLiquidity),
      ],
      DAI: [
        encodePoolHintV2(
          ADDRESS.CURVE_PUSD3CRV_POOL,
          PoolType.CurveFactoryUSDMetaPoolUnderlying,
          4,
          1,
          1,
          Action.AddLiquidity
        ),
      ],
      USDC: [
        encodePoolHintV2(
          ADDRESS.CURVE_PUSD3CRV_POOL,
          PoolType.CurveFactoryUSDMetaPoolUnderlying,
          4,
          2,
          2,
          Action.AddLiquidity
        ),
      ],
      USDT: [
        encodePoolHintV2(
          ADDRESS.CURVE_PUSD3CRV_POOL,
          PoolType.CurveFactoryUSDMetaPoolUnderlying,
          4,
          3,
          3,
          Action.AddLiquidity
        ),
      ],
      // WETH ==(UniV3)== USDT
      WETH: [
        encodePoolHintV2(ADDRESS.WETH_USDT_UNIV3, PoolType.UniswapV3, 2, 0, 1, Action.Swap),
        encodePoolHintV2(
          ADDRESS.CURVE_PUSD3CRV_POOL,
          PoolType.CurveFactoryUSDMetaPoolUnderlying,
          4,
          3,
          3,
          Action.AddLiquidity
        ),
      ],
    },
    withdraw: {},
  },
  susd: {
    token: "CURVE_SUSD",
    convexId: 4,
    rewards: [ADDRESS.CVX, ADDRESS.CRV, ADDRESS.SNX],
    deposit: {
      DAI: [encodePoolHintV2(ADDRESS.CURVE_SUSD_DEPOSIT, PoolType.CurveYPoolUnderlying, 4, 0, 0, Action.AddLiquidity)],
      USDC: [encodePoolHintV2(ADDRESS.CURVE_SUSD_DEPOSIT, PoolType.CurveYPoolUnderlying, 4, 1, 0, Action.AddLiquidity)],
      USDT: [encodePoolHintV2(ADDRESS.CURVE_SUSD_DEPOSIT, PoolType.CurveYPoolUnderlying, 4, 2, 0, Action.AddLiquidity)],
      sUSD: [encodePoolHintV2(ADDRESS.CURVE_SUSD_DEPOSIT, PoolType.CurveYPoolUnderlying, 4, 3, 0, Action.AddLiquidity)],
      // WETH ==(UniV3)==> USDC
      WETH: [
        encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 1, 0, Action.Swap),
        encodePoolHintV2(ADDRESS.CURVE_SUSD_DEPOSIT, PoolType.CurveYPoolUnderlying, 4, 1, 0, Action.AddLiquidity),
      ],
    },
    withdraw: {},
  },
  sbtc: {
    token: "CURVE_SBTC",
    convexId: 7,
    rewards: [ADDRESS.CVX, ADDRESS.CRV],
    deposit: {
      renBTC: [encodePoolHintV2(ADDRESS.CURVE_SBTC_POOL, PoolType.CurveBasePool, 3, 0, 0, Action.AddLiquidity)],
      WBTC: [encodePoolHintV2(ADDRESS.CURVE_SBTC_POOL, PoolType.CurveBasePool, 3, 1, 1, Action.AddLiquidity)],
      sBTC: [encodePoolHintV2(ADDRESS.CURVE_SBTC_POOL, PoolType.CurveBasePool, 3, 2, 2, Action.AddLiquidity)],
      // WETH ==(CurveV2)==> WBTC
      WETH: [
        encodePoolHintV2(ADDRESS.CURVE_TRICRYPTO_POOL, PoolType.CurveTriCryptoPool, 3, 2, 1, Action.Swap),
        encodePoolHintV2(ADDRESS.CURVE_SBTC_POOL, PoolType.CurveBasePool, 3, 1, 1, Action.AddLiquidity),
      ],
      // USDC ==(UniV3)==> WETH ==(CurveV2)==> WBTC
      USDC: [
        encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 0, 1, Action.Swap),
        encodePoolHintV2(ADDRESS.CURVE_TRICRYPTO_POOL, PoolType.CurveTriCryptoPool, 3, 2, 1, Action.Swap),
        encodePoolHintV2(ADDRESS.CURVE_SBTC_POOL, PoolType.CurveBasePool, 3, 1, 1, Action.AddLiquidity),
      ],
    },
    withdraw: {},
  },
  seth: {
    token: "CURVE_SETH",
    convexId: 23,
    rewards: [ADDRESS.CVX, ADDRESS.CRV],
    deposit: {
      sETH: [encodePoolHintV2(ADDRESS.CURVE_SETH_POOL, PoolType.CurveETHPool, 2, 1, 1, Action.AddLiquidity)],
      WETH: [encodePoolHintV2(ADDRESS.CURVE_SETH_POOL, PoolType.CurveETHPool, 2, 0, 0, Action.AddLiquidity)],
      // USDC ==(UniV3)==> WETH
      USDC: [
        encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 0, 1, Action.Swap),
        encodePoolHintV2(ADDRESS.CURVE_SETH_POOL, PoolType.CurveETHPool, 2, 0, 0, Action.AddLiquidity),
      ],
    },
    withdraw: {},
  },
  fraxusdc: {
    token: "CURVE_FRAXUSDC",
    convexId: 100,
    rewards: [ADDRESS.CVX, ADDRESS.CRV],
    deposit: {
      FRAX: [encodePoolHintV2(ADDRESS.CURVE_FRAXUSDC_POOL, PoolType.CurveBasePool, 2, 0, 0, Action.AddLiquidity)],
      USDC: [encodePoolHintV2(ADDRESS.CURVE_FRAXUSDC_POOL, PoolType.CurveBasePool, 2, 1, 0, Action.AddLiquidity)],
      // WETH ==(UniV3)==> USDC
      WETH: [
        encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 1, 0, Action.Swap),
        encodePoolHintV2(ADDRESS.CURVE_FRAXUSDC_POOL, PoolType.CurveBasePool, 2, 1, 0, Action.AddLiquidity),
      ],
    },
    withdraw: {},
  },
  mim: {
    token: "CURVE_MIM3CRV",
    convexId: 40,
    rewards: [ADDRESS.CRV, ADDRESS.CVX, ADDRESS.SPELL],
    deposit: {},
    withdraw: {},
  },
  ironbank: {
    token: "CURVE_IRONBANK",
    convexId: 29,
    rewards: [ADDRESS.CRV, ADDRESS.CVX],
    deposit: {},
    withdraw: {},
  },
  fpifrax: {
    token: "CURVE_FPIFRAX",
    convexId: 82,
    rewards: [ADDRESS.CRV, ADDRESS.CVX],
    deposit: {},
    withdraw: {},
  },
  alusd: {
    token: "CURVE_ALUSD3CRV",
    convexId: 36,
    rewards: [ADDRESS.CRV, ADDRESS.CVX, ADDRESS.ALCX],
    deposit: {},
    withdraw: {},
  },
  compound: {
    token: "CURVE_COMPOUND",
    convexId: 0,
    rewards: [ADDRESS.CRV, ADDRESS.CVX],
    deposit: {},
    withdraw: {},
  },
  dola: {
    token: "CURVE_DOLA3CRV",
    convexId: 62,
    rewards: [ADDRESS.CRV, ADDRESS.CVX],
    deposit: {},
    withdraw: {},
  },
  busdv2: {
    token: "CURVE_BUSD3CRV",
    convexId: 34,
    rewards: [ADDRESS.CRV, ADDRESS.CVX],
    deposit: {},
    withdraw: {},
  },
  aleth: {
    token: "CURVE_ALETH",
    convexId: 49,
    rewards: [ADDRESS.CRV, ADDRESS.CVX],
    deposit: {},
    withdraw: {},
  },
  "3eur": {
    token: "CURVE_3EUR",
    convexId: 60,
    rewards: [ADDRESS.CRV, ADDRESS.CVX, ADDRESS.ANGLE],
    deposit: {},
    withdraw: {},
  },
  lusd: {
    token: "CURVE_LUSD3CRV",
    convexId: 33,
    rewards: [ADDRESS.CRV, ADDRESS.CVX], // ignore for now ADDRESS.LQTY
    deposit: {},
    withdraw: {},
  },
};

export const ACRV_VAULTS: {
  name: string;
  fees: {
    withdraw: number;
    harvest: number;
    platform: number;
  };
}[] = [
  { name: "steth", fees: { withdraw: 5e5, harvest: 1e7, platform: 1e7 } }, // 0
  { name: "frax", fees: { withdraw: 5e5, harvest: 1e7, platform: 1e7 } }, // 1
  { name: "tricrypto2", fees: { withdraw: 1e6, harvest: 1e7, platform: 1e7 } }, // 2
  { name: "cvxcrv", fees: { withdraw: 3e6, harvest: 1e7, platform: 8e7 } }, // 3
  { name: "crveth", fees: { withdraw: 3e6, harvest: 1e7, platform: 1e7 } }, // 4
  { name: "cvxeth", fees: { withdraw: 3e6, harvest: 1e7, platform: 1e7 } }, // 5
  { name: "cvxfxs", fees: { withdraw: 3e6, harvest: 1e7, platform: 1e7 } }, // 6
  { name: "3pool", fees: { withdraw: 1e5, harvest: 1e7, platform: 1e7 } }, // 7
  { name: "ust-wormhole", fees: { withdraw: 5e5, harvest: 1e7, platform: 1e7 } }, // 8
  { name: "rocket-pool-eth", fees: { withdraw: 5e5, harvest: 1e7, platform: 1e7 } }, // 9
  { name: "ren", fees: { withdraw: 5e5, harvest: 1e7, platform: 1e7 } }, // 10
  { name: "pusd", fees: { withdraw: 5e5, harvest: 1e7, platform: 1e7 } }, // 11
  { name: "susd", fees: { withdraw: 5e5, harvest: 1e7, platform: 1e7 } }, // 12
  { name: "sbtc", fees: { withdraw: 5e5, harvest: 1e7, platform: 1e7 } }, // 13
  { name: "seth", fees: { withdraw: 5e5, harvest: 1e7, platform: 1e7 } }, // 14
  { name: "fraxusdc", fees: { withdraw: 5e5, harvest: 1e7, platform: 1e7 } }, // 15
];

export const IFO_VAULTS: {
  name: string;
  fees: {
    withdraw: number;
    harvest: number;
    platform: number;
  };
}[] = [
  { name: "steth", fees: { withdraw: 5e5, harvest: 1e7, platform: 1e8 } }, // 0
  { name: "frax", fees: { withdraw: 5e5, harvest: 1e7, platform: 1e8 } }, // 1
  { name: "tricrypto2", fees: { withdraw: 1e6, harvest: 1e7, platform: 1e8 } }, // 2
  { name: "cvxcrv", fees: { withdraw: 3e6, harvest: 1e7, platform: 1e8 } }, // 3
  { name: "crveth", fees: { withdraw: 3e6, harvest: 1e7, platform: 1e8 } }, // 4
  { name: "cvxeth", fees: { withdraw: 3e6, harvest: 1e7, platform: 1e8 } }, // 5
  { name: "cvxfxs", fees: { withdraw: 3e6, harvest: 1e7, platform: 1e8 } }, // 6
  { name: "3pool", fees: { withdraw: 1e5, harvest: 1e7, platform: 1e8 } }, // 7
  { name: "ironbank", fees: { withdraw: 5e5, harvest: 1e7, platform: 1e8 } }, // 8
  { name: "rocket-pool-eth", fees: { withdraw: 5e5, harvest: 1e7, platform: 1e8 } }, // 9
  { name: "ren", fees: { withdraw: 1e5, harvest: 1e7, platform: 1e8 } }, // 10
  { name: "mim", fees: { withdraw: 5e5, harvest: 1e7, platform: 1e8 } }, // 11
  { name: "susd", fees: { withdraw: 5e5, harvest: 1e7, platform: 1e8 } }, // 12
  { name: "sbtc", fees: { withdraw: 5e5, harvest: 1e7, platform: 1e8 } }, // 13
  { name: "seth", fees: { withdraw: 5e5, harvest: 1e7, platform: 1e8 } }, // 14
  { name: "fraxusdc", fees: { withdraw: 5e5, harvest: 1e7, platform: 1e8 } }, // 15
  { name: "fpifrax", fees: { withdraw: 5e5, harvest: 1e7, platform: 1e8 } }, // 16
  { name: "alusd", fees: { withdraw: 5e5, harvest: 1e7, platform: 1e8 } }, // 17
  { name: "compound", fees: { withdraw: 1e5, harvest: 1e7, platform: 1e8 } }, // 18
  { name: "dola", fees: { withdraw: 5e5, harvest: 1e7, platform: 1e8 } }, // 19
  { name: "busdv2", fees: { withdraw: 5e5, harvest: 1e7, platform: 1e8 } }, // 20
  { name: "aleth", fees: { withdraw: 5e5, harvest: 1e7, platform: 1e8 } }, // 21
  { name: "3eur-pool", fees: { withdraw: 5e5, harvest: 1e7, platform: 1e8 } }, // 22
  { name: "lusd", fees: { withdraw: 5e5, harvest: 1e7, platform: 1e8 } }, // 23
];
