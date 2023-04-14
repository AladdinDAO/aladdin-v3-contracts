/* eslint-disable node/no-missing-import */
import { BigNumber } from "ethers";
import { Action, ADDRESS, encodePoolHintV2, PoolType } from ".";

export interface IVaultConfig {
  token: string;
  composition: string;
  convexCurveID?: number;
  convexFraxID?: number;
  rewarder?: string;
  gauge?: string;
  rewards: string[];
  deposit: {
    [token: string]: BigNumber[];
  };
  withdraw: {
    [token: string]: BigNumber[];
  };
}

export const AVAILABLE_VAULTS: {
  [name: string]: IVaultConfig;
} = {
  steth: {
    token: "CURVE_stETH",
    composition: "ETH+stETH",
    convexCurveID: 25,
    rewarder: "0x0A760466E1B4621579a82a39CB56Dda2F4E70f03",
    rewards: [ADDRESS.CRV, ADDRESS.CVX, ADDRESS.LDO],
    deposit: {
      WETH: [encodePoolHintV2(ADDRESS.CURVE_stETH_POOL, PoolType.CurveETHPool, 2, 0, 0, Action.AddLiquidity)],
      stETH: [encodePoolHintV2(ADDRESS.CURVE_stETH_POOL, PoolType.CurveETHPool, 2, 1, 1, Action.AddLiquidity)],
      // USDC ==(UniV3)==> WETH
      USDC: [
        encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 0, 1, Action.Swap),
        encodePoolHintV2(ADDRESS.CURVE_stETH_POOL, PoolType.CurveETHPool, 2, 0, 0, Action.AddLiquidity),
      ],
    },
    withdraw: {
      WETH: [encodePoolHintV2(ADDRESS.CURVE_stETH_POOL, PoolType.CurveETHPool, 2, 0, 0, Action.RemoveLiquidity)],
      stETH: [encodePoolHintV2(ADDRESS.CURVE_stETH_POOL, PoolType.CurveETHPool, 2, 1, 1, Action.RemoveLiquidity)],
      // WETH ==(UniV3)==> USDC
      USDC: [
        encodePoolHintV2(ADDRESS.CURVE_stETH_POOL, PoolType.CurveETHPool, 2, 0, 0, Action.RemoveLiquidity),
        encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 1, 0, Action.Swap),
      ],
    },
  },
  frax: {
    token: "CURVE_FRAX3CRV",
    composition: "FRAX+3CRV",
    convexCurveID: 32,
    rewarder: "0xB900EF131301B307dB5eFcbed9DBb50A3e209B2e",
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
      // WETH ==(UniV3)==> USDC
      WETH: [
        encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 1, 0, Action.Swap),
        encodePoolHintV2(
          ADDRESS.CURVE_FRAX3CRV_POOL,
          PoolType.CurveFactoryUSDMetaPoolUnderlying,
          4,
          2,
          2,
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
      // USDC ==(UniV3)==> WETH
      WETH: [
        encodePoolHintV2(
          ADDRESS.CURVE_FRAX3CRV_POOL,
          PoolType.CurveFactoryUSDMetaPoolUnderlying,
          4,
          2,
          2,
          Action.RemoveLiquidity
        ),
        encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 0, 1, Action.Swap),
      ],
    },
  },
  tricrypto2: {
    token: "CURVE_TRICRYPTO",
    composition: "USDT+WBTC+WETH",
    convexCurveID: 38,
    rewarder: "0x9D5C5E364D81DaB193b72db9E9BE9D8ee669B652",
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
      // USDT ==(UniV3)==> USDC
      USDC: [
        encodePoolHintV2(ADDRESS.CURVE_TRICRYPTO_POOL, PoolType.CurveTriCryptoPool, 3, 0, 0, Action.RemoveLiquidity),
        encodePoolHintV2(ADDRESS.USDC_USDT_UNIV3, PoolType.UniswapV3, 2, 1, 0, Action.Swap),
      ],
    },
  },
  cvxcrv: {
    token: "CURVE_CVXCRV",
    composition: "CRV+cvxCRV",
    convexCurveID: 41,
    rewarder: "0x03923210e76F42C2F94FBb0c6853052487db521F0",
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
      // CRV ==(CurveV2)==> WETH
      WETH: [
        encodePoolHintV2(ADDRESS.CURVE_CVXCRV_POOL, PoolType.CurveFactoryPlainPool, 2, 0, 0, Action.RemoveLiquidity),
        encodePoolHintV2(ADDRESS.CURVE_CRVETH_POOL, PoolType.CurveCryptoPool, 2, 1, 0, Action.Swap),
      ],
      // CRV ==(CurveV2)==> WETH ==(UniV3)==> USDC
      USDC: [
        encodePoolHintV2(ADDRESS.CURVE_CVXCRV_POOL, PoolType.CurveFactoryPlainPool, 2, 0, 0, Action.RemoveLiquidity),
        encodePoolHintV2(ADDRESS.CURVE_CRVETH_POOL, PoolType.CurveCryptoPool, 2, 1, 0, Action.Swap),
        encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 1, 0, Action.Swap),
      ],
    },
  },
  crveth: {
    token: "CURVE_CRVETH",
    composition: "ETH+CRV",
    convexCurveID: 61,
    rewarder: "0x085A2054c51eA5c91dbF7f90d65e728c0f2A270f",
    rewards: [ADDRESS.CRV, ADDRESS.CVX],
    deposit: {
      WETH: [encodePoolHintV2(ADDRESS.CURVE_CRVETH_POOL, PoolType.CurveCryptoPool, 2, 0, 0, Action.AddLiquidity)],
      CRV: [encodePoolHintV2(ADDRESS.CURVE_CRVETH_POOL, PoolType.CurveCryptoPool, 2, 1, 1, Action.AddLiquidity)],
      // USDC ==(UniV3)==> WETH
      USDC: [
        encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 0, 1, Action.Swap),
        encodePoolHintV2(ADDRESS.CURVE_CRVETH_POOL, PoolType.CurveCryptoPool, 2, 0, 0, Action.AddLiquidity),
      ],
    },
    withdraw: {
      WETH: [encodePoolHintV2(ADDRESS.CURVE_CRVETH_POOL, PoolType.CurveCryptoPool, 2, 0, 0, Action.RemoveLiquidity)],
      CRV: [encodePoolHintV2(ADDRESS.CURVE_CRVETH_POOL, PoolType.CurveCryptoPool, 2, 1, 1, Action.RemoveLiquidity)],
      // WETH ==(UniV3)==> USDC
      USDC: [
        encodePoolHintV2(ADDRESS.CURVE_CRVETH_POOL, PoolType.CurveCryptoPool, 2, 0, 0, Action.RemoveLiquidity),
        encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 1, 0, Action.Swap),
      ],
    },
  },
  cvxeth: {
    token: "CURVE_CVXETH",
    composition: "ETH+CVX",
    convexCurveID: 64,
    rewarder: "0xb1Fb0BA0676A1fFA83882c7F4805408bA232C1fA",
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
      // WETH ==(UniV3)==> USDC
      USDC: [
        encodePoolHintV2(ADDRESS.CURVE_CVXETH_POOL, PoolType.CurveCryptoPool, 2, 0, 0, Action.RemoveLiquidity),
        encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 1, 0, Action.Swap),
      ],
    },
  },
  cvxfxs: {
    token: "CURVE_cvxFXS",
    composition: "FXS+cvxFXS",
    convexCurveID: 72,
    rewarder: "0xf27AFAD0142393e4b3E5510aBc5fe3743Ad669Cb",
    rewards: [ADDRESS.CRV, ADDRESS.CVX, ADDRESS.FXS],
    deposit: {
      FXS: [encodePoolHintV2(ADDRESS.CURVE_cvxFXS_POOL, PoolType.CurveCryptoPool, 2, 0, 0, Action.AddLiquidity)],
      cvxFXS: [encodePoolHintV2(ADDRESS.CURVE_cvxFXS_POOL, PoolType.CurveCryptoPool, 2, 1, 1, Action.AddLiquidity)],
      // WETH ==(UniV3)==> USDC ==(UniV3)==> FRAX ==(UniV2)==> FXS
      WETH: [
        encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 1, 0, Action.Swap),
        encodePoolHintV2(ADDRESS.FRAX_USDC_UNIV3_500, PoolType.UniswapV3, 2, 1, 0, Action.Swap),
        encodePoolHintV2(ADDRESS.FXS_FRAX_UNIV2, PoolType.UniswapV2, 2, 1, 0, Action.Swap),
        encodePoolHintV2(ADDRESS.CURVE_cvxFXS_POOL, PoolType.CurveCryptoPool, 2, 0, 0, Action.AddLiquidity),
      ],
      // USDC ==(UniV3)==> FRAX ==(UniV2)==> FXS
      USDC: [
        encodePoolHintV2(ADDRESS.FRAX_USDC_UNIV3_500, PoolType.UniswapV3, 2, 1, 0, Action.Swap),
        encodePoolHintV2(ADDRESS.FXS_FRAX_UNIV2, PoolType.UniswapV2, 2, 1, 0, Action.Swap),
        encodePoolHintV2(ADDRESS.CURVE_cvxFXS_POOL, PoolType.CurveCryptoPool, 2, 0, 0, Action.AddLiquidity),
      ],
    },
    withdraw: {
      FXS: [encodePoolHintV2(ADDRESS.CURVE_cvxFXS_POOL, PoolType.CurveCryptoPool, 2, 0, 0, Action.RemoveLiquidity)],
      cvxFXS: [encodePoolHintV2(ADDRESS.CURVE_cvxFXS_POOL, PoolType.CurveCryptoPool, 2, 1, 1, Action.RemoveLiquidity)],
      // FXS ==(UniV2)==> FRAX ==(UniV3)==> USDC ==(UniV3)==> WETH
      WETH: [
        encodePoolHintV2(ADDRESS.CURVE_cvxFXS_POOL, PoolType.CurveCryptoPool, 2, 0, 0, Action.RemoveLiquidity),
        encodePoolHintV2(ADDRESS.FXS_FRAX_UNIV2, PoolType.UniswapV2, 2, 0, 1, Action.Swap),
        encodePoolHintV2(ADDRESS.FRAX_USDC_UNIV3_500, PoolType.UniswapV3, 2, 0, 1, Action.Swap),
        encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 0, 1, Action.Swap),
      ],
      // FXS ==(UniV2)==> FRAX ==(UniV3)==> USDC
      USDC: [
        encodePoolHintV2(ADDRESS.CURVE_cvxFXS_POOL, PoolType.CurveCryptoPool, 2, 0, 0, Action.RemoveLiquidity),
        encodePoolHintV2(ADDRESS.FXS_FRAX_UNIV2, PoolType.UniswapV2, 2, 0, 1, Action.Swap),
        encodePoolHintV2(ADDRESS.FRAX_USDC_UNIV3_500, PoolType.UniswapV3, 2, 0, 1, Action.Swap),
      ],
    },
  },
  "3pool": {
    token: "CURVE_TRICRV",
    composition: "DAI+USDC+USDT",
    convexCurveID: 9,
    rewarder: "0x689440f2Ff927E1f24c72F1087E1FAF471eCe1c8",
    rewards: [ADDRESS.CVX, ADDRESS.CRV],
    deposit: {
      DAI: [encodePoolHintV2(ADDRESS.CURVE_TRICRV_POOL, PoolType.CurveBasePool, 3, 0, 0, Action.AddLiquidity)],
      USDC: [encodePoolHintV2(ADDRESS.CURVE_TRICRV_POOL, PoolType.CurveBasePool, 3, 1, 1, Action.AddLiquidity)],
      USDT: [encodePoolHintV2(ADDRESS.CURVE_TRICRV_POOL, PoolType.CurveBasePool, 3, 2, 2, Action.AddLiquidity)],
      // WETH ==(UniV3)==> USDC
      WETH: [
        encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 1, 0, Action.Swap),
        encodePoolHintV2(ADDRESS.CURVE_TRICRV_POOL, PoolType.CurveBasePool, 3, 1, 1, Action.AddLiquidity),
      ],
    },
    withdraw: {
      DAI: [encodePoolHintV2(ADDRESS.CURVE_TRICRV_POOL, PoolType.CurveBasePool, 2, 0, 0, Action.RemoveLiquidity)],
      USDC: [encodePoolHintV2(ADDRESS.CURVE_TRICRV_POOL, PoolType.CurveBasePool, 2, 1, 1, Action.RemoveLiquidity)],
      USDT: [encodePoolHintV2(ADDRESS.CURVE_TRICRV_POOL, PoolType.CurveBasePool, 2, 2, 2, Action.RemoveLiquidity)],
      // USDC ==(UniV3)==> WETH
      WETH: [
        encodePoolHintV2(ADDRESS.CURVE_TRICRV_POOL, PoolType.CurveBasePool, 2, 1, 1, Action.RemoveLiquidity),
        encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 0, 1, Action.Swap),
      ],
    },
  },
  "ust-wormhole": {
    token: "CURVE_UST_WORMHOLE",
    composition: "UST+3CRV",
    convexCurveID: 59,
    rewarder: "0x7e2b9B5244bcFa5108A76D5E7b507CFD5581AD4A",
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
      // WETH ==(UniV3)==> USDC
      WETH: [
        encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 1, 0, Action.Swap),
        encodePoolHintV2(
          ADDRESS.CURVE_UST_WORMHOLE_POOL,
          PoolType.CurveFactoryUSDMetaPoolUnderlying,
          4,
          2,
          2,
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
    composition: "rETH+wstETH",
    convexCurveID: 73,
    rewarder: "0x5c463069b99AfC9333F4dC2203a9f0c6C7658cCc",
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
    composition: "renBTC+WBTC",
    convexCurveID: 6,
    rewarder: "0x8E299C62EeD737a5d5a53539dF37b5356a27b07D",
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
    withdraw: {
      renBTC: [encodePoolHintV2(ADDRESS.CURVE_REN_POOL, PoolType.CurveBasePool, 2, 0, 0, Action.RemoveLiquidity)],
      WBTC: [encodePoolHintV2(ADDRESS.CURVE_REN_POOL, PoolType.CurveBasePool, 2, 1, 1, Action.RemoveLiquidity)],
      // WBTC ==(UniV3)==> WETH
      WETH: [
        encodePoolHintV2(ADDRESS.CURVE_REN_POOL, PoolType.CurveBasePool, 2, 1, 1, Action.RemoveLiquidity),
        encodePoolHintV2(ADDRESS.WBTC_WETH_UNIV3_500, PoolType.UniswapV3, 2, 0, 1, Action.Swap),
      ],
      // WBTC ==(Curve)==> USDT ==(Curve)==> USDC
      USDC: [
        encodePoolHintV2(ADDRESS.CURVE_REN_POOL, PoolType.CurveBasePool, 2, 1, 1, Action.RemoveLiquidity),
        encodePoolHintV2(ADDRESS.CURVE_TRICRYPTO_POOL, PoolType.CurveTriCryptoPool, 3, 1, 0, Action.Swap),
        encodePoolHintV2(ADDRESS.CURVE_TRICRV_POOL, PoolType.CurveBasePool, 3, 2, 1, Action.Swap),
      ],
    },
  },
  pusd: {
    token: "CURVE_PUSD3CRV",
    composition: "PUSd+3CRV",
    convexCurveID: 91,
    rewarder: "0x83a3CE160915675F5bC7cC3CfDA5f4CeBC7B7a5a",
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
      // WETH ==(UniV3)==> USDC
      WETH: [
        encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 1, 0, Action.Swap),
        encodePoolHintV2(
          ADDRESS.CURVE_PUSD3CRV_POOL,
          PoolType.CurveFactoryUSDMetaPoolUnderlying,
          4,
          2,
          2,
          Action.AddLiquidity
        ),
      ],
    },
    withdraw: {
      PUSD: [
        encodePoolHintV2(ADDRESS.CURVE_PUSD3CRV_POOL, PoolType.CurveFactoryMetaPool, 2, 0, 0, Action.RemoveLiquidity),
      ],
      TRICRV: [
        encodePoolHintV2(ADDRESS.CURVE_PUSD3CRV_POOL, PoolType.CurveFactoryMetaPool, 2, 1, 1, Action.RemoveLiquidity),
      ],
      DAI: [
        encodePoolHintV2(
          ADDRESS.CURVE_PUSD3CRV_POOL,
          PoolType.CurveFactoryUSDMetaPoolUnderlying,
          4,
          1,
          1,
          Action.RemoveLiquidity
        ),
      ],
      USDC: [
        encodePoolHintV2(
          ADDRESS.CURVE_PUSD3CRV_POOL,
          PoolType.CurveFactoryUSDMetaPoolUnderlying,
          4,
          2,
          2,
          Action.RemoveLiquidity
        ),
      ],
      USDT: [
        encodePoolHintV2(
          ADDRESS.CURVE_PUSD3CRV_POOL,
          PoolType.CurveFactoryUSDMetaPoolUnderlying,
          4,
          3,
          3,
          Action.RemoveLiquidity
        ),
      ],
      // USDC ==(UniV3)==> WETH
      WETH: [
        encodePoolHintV2(
          ADDRESS.CURVE_PUSD3CRV_POOL,
          PoolType.CurveFactoryUSDMetaPoolUnderlying,
          4,
          2,
          2,
          Action.RemoveLiquidity
        ),
        encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 0, 1, Action.Swap),
      ],
    },
  },
  susd: {
    token: "CURVE_sUSD",
    composition: "DAI+USDC+USDT+sUSD",
    convexCurveID: 4,
    rewarder: "0x22eE18aca7F3Ee920D01F25dA85840D12d98E8Ca",
    rewards: [ADDRESS.CVX, ADDRESS.CRV, ADDRESS.SNX],
    deposit: {
      DAI: [encodePoolHintV2(ADDRESS.CURVE_sUSD_DEPOSIT, PoolType.CurveYPoolUnderlying, 4, 0, 0, Action.AddLiquidity)],
      USDC: [encodePoolHintV2(ADDRESS.CURVE_sUSD_DEPOSIT, PoolType.CurveYPoolUnderlying, 4, 1, 1, Action.AddLiquidity)],
      USDT: [encodePoolHintV2(ADDRESS.CURVE_sUSD_DEPOSIT, PoolType.CurveYPoolUnderlying, 4, 2, 2, Action.AddLiquidity)],
      sUSD: [encodePoolHintV2(ADDRESS.CURVE_sUSD_DEPOSIT, PoolType.CurveYPoolUnderlying, 4, 3, 3, Action.AddLiquidity)],
      // WETH ==(UniV3)==> USDC
      WETH: [
        encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 1, 0, Action.Swap),
        encodePoolHintV2(ADDRESS.CURVE_sUSD_DEPOSIT, PoolType.CurveYPoolUnderlying, 4, 1, 0, Action.AddLiquidity),
      ],
    },
    withdraw: {
      DAI: [
        encodePoolHintV2(ADDRESS.CURVE_sUSD_DEPOSIT, PoolType.CurveYPoolUnderlying, 4, 0, 0, Action.RemoveLiquidity),
      ],
      USDC: [
        encodePoolHintV2(ADDRESS.CURVE_sUSD_DEPOSIT, PoolType.CurveYPoolUnderlying, 4, 1, 1, Action.RemoveLiquidity),
      ],
      USDT: [
        encodePoolHintV2(ADDRESS.CURVE_sUSD_DEPOSIT, PoolType.CurveYPoolUnderlying, 4, 2, 2, Action.RemoveLiquidity),
      ],
      sUSD: [
        encodePoolHintV2(ADDRESS.CURVE_sUSD_DEPOSIT, PoolType.CurveYPoolUnderlying, 4, 3, 3, Action.RemoveLiquidity),
      ],
      // USDC ==(UniV3)==> WETH
      WETH: [
        encodePoolHintV2(ADDRESS.CURVE_sUSD_DEPOSIT, PoolType.CurveYPoolUnderlying, 4, 1, 1, Action.RemoveLiquidity),
        encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 0, 1, Action.Swap),
      ],
    },
  },
  sbtc: {
    token: "CURVE_sBTC",
    composition: "renBTC+WBTC+sBTC",
    convexCurveID: 7,
    rewarder: "0xd727A5A6D1C7b31Ff9Db4Db4d24045B7dF0CFF93",
    rewards: [ADDRESS.CVX, ADDRESS.CRV],
    deposit: {
      renBTC: [encodePoolHintV2(ADDRESS.CURVE_sBTC_POOL, PoolType.CurveBasePool, 3, 0, 0, Action.AddLiquidity)],
      WBTC: [encodePoolHintV2(ADDRESS.CURVE_sBTC_POOL, PoolType.CurveBasePool, 3, 1, 1, Action.AddLiquidity)],
      sBTC: [encodePoolHintV2(ADDRESS.CURVE_sBTC_POOL, PoolType.CurveBasePool, 3, 2, 2, Action.AddLiquidity)],
      // WETH ==(CurveV2)==> WBTC
      WETH: [
        encodePoolHintV2(ADDRESS.CURVE_TRICRYPTO_POOL, PoolType.CurveTriCryptoPool, 3, 2, 1, Action.Swap),
        encodePoolHintV2(ADDRESS.CURVE_sBTC_POOL, PoolType.CurveBasePool, 3, 1, 1, Action.AddLiquidity),
      ],
      // USDC ==(UniV3)==> WETH ==(CurveV2)==> WBTC
      USDC: [
        encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 0, 1, Action.Swap),
        encodePoolHintV2(ADDRESS.CURVE_TRICRYPTO_POOL, PoolType.CurveTriCryptoPool, 3, 2, 1, Action.Swap),
        encodePoolHintV2(ADDRESS.CURVE_sBTC_POOL, PoolType.CurveBasePool, 3, 1, 1, Action.AddLiquidity),
      ],
    },
    withdraw: {
      renBTC: [encodePoolHintV2(ADDRESS.CURVE_sBTC_POOL, PoolType.CurveBasePool, 3, 0, 0, Action.RemoveLiquidity)],
      WBTC: [encodePoolHintV2(ADDRESS.CURVE_sBTC_POOL, PoolType.CurveBasePool, 3, 1, 1, Action.RemoveLiquidity)],
      sBTC: [encodePoolHintV2(ADDRESS.CURVE_sBTC_POOL, PoolType.CurveBasePool, 3, 2, 2, Action.RemoveLiquidity)],
      // WBTC ==(CurveV2)==> WETH
      WETH: [
        encodePoolHintV2(ADDRESS.CURVE_sBTC_POOL, PoolType.CurveBasePool, 3, 1, 1, Action.RemoveLiquidity),
        encodePoolHintV2(ADDRESS.CURVE_TRICRYPTO_POOL, PoolType.CurveTriCryptoPool, 3, 1, 2, Action.Swap),
      ],
      // WBTC ==(CurveV2)==> WETH ==(UniV3)==> USDC
      USDC: [
        encodePoolHintV2(ADDRESS.CURVE_sBTC_POOL, PoolType.CurveBasePool, 3, 1, 1, Action.RemoveLiquidity),
        encodePoolHintV2(ADDRESS.CURVE_TRICRYPTO_POOL, PoolType.CurveTriCryptoPool, 3, 1, 2, Action.Swap),
        encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 1, 0, Action.Swap),
      ],
    },
  },
  seth: {
    token: "CURVE_sETH",
    composition: "ETH+sETH",
    convexCurveID: 23,
    rewarder: "0x192469CadE297D6B21F418cFA8c366b63FFC9f9b",
    rewards: [ADDRESS.CVX, ADDRESS.CRV],
    deposit: {
      sETH: [encodePoolHintV2(ADDRESS.CURVE_sETH_POOL, PoolType.CurveETHPool, 2, 1, 1, Action.AddLiquidity)],
      WETH: [encodePoolHintV2(ADDRESS.CURVE_sETH_POOL, PoolType.CurveETHPool, 2, 0, 0, Action.AddLiquidity)],
      // USDC ==(UniV3)==> WETH
      USDC: [
        encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 0, 1, Action.Swap),
        encodePoolHintV2(ADDRESS.CURVE_sETH_POOL, PoolType.CurveETHPool, 2, 0, 0, Action.AddLiquidity),
      ],
    },
    withdraw: {
      sETH: [encodePoolHintV2(ADDRESS.CURVE_sETH_POOL, PoolType.CurveETHPool, 2, 1, 1, Action.RemoveLiquidity)],
      WETH: [encodePoolHintV2(ADDRESS.CURVE_sETH_POOL, PoolType.CurveETHPool, 2, 0, 0, Action.RemoveLiquidity)],
      // WETH ==(UniV3)==> USDC
      USDC: [
        encodePoolHintV2(ADDRESS.CURVE_sETH_POOL, PoolType.CurveETHPool, 2, 0, 0, Action.RemoveLiquidity),
        encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 1, 0, Action.Swap),
      ],
    },
  },
  fraxusdc: {
    token: "CURVE_FRAXUSDC",
    composition: "FRAX+USDC",
    convexCurveID: 100,
    convexFraxID: 9,
    rewarder: "0x7e880867363A7e321f5d260Cade2B0Bb2F717B02",
    rewards: [ADDRESS.CVX, ADDRESS.CRV],
    deposit: {
      FRAX: [encodePoolHintV2(ADDRESS.CURVE_FRAXUSDC_POOL, PoolType.CurveBasePool, 2, 0, 0, Action.AddLiquidity)],
      USDC: [encodePoolHintV2(ADDRESS.CURVE_FRAXUSDC_POOL, PoolType.CurveBasePool, 2, 1, 1, Action.AddLiquidity)],
      // WETH ==(UniV3)==> USDC
      WETH: [
        encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 1, 0, Action.Swap),
        encodePoolHintV2(ADDRESS.CURVE_FRAXUSDC_POOL, PoolType.CurveBasePool, 2, 1, 0, Action.AddLiquidity),
      ],
    },
    withdraw: {
      FRAX: [encodePoolHintV2(ADDRESS.CURVE_FRAXUSDC_POOL, PoolType.CurveBasePool, 2, 0, 0, Action.RemoveLiquidity)],
      USDC: [encodePoolHintV2(ADDRESS.CURVE_FRAXUSDC_POOL, PoolType.CurveBasePool, 2, 1, 1, Action.RemoveLiquidity)],
      // USDC ==(UniV3)==> WETH
      WETH: [
        encodePoolHintV2(ADDRESS.CURVE_FRAXUSDC_POOL, PoolType.CurveBasePool, 2, 1, 1, Action.RemoveLiquidity),
        encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 0, 1, Action.Swap),
      ],
    },
  },
  mim: {
    token: "CURVE_MIM3CRV",
    composition: "MIM+3CRV",
    convexCurveID: 40,
    rewarder: "0xFd5AbF66b003881b88567EB9Ed9c651F14Dc4771",
    rewards: [ADDRESS.CRV, ADDRESS.CVX, ADDRESS.SPELL],
    deposit: {
      MIM: [encodePoolHintV2(ADDRESS.CURVE_MIM3CRV_POOL, PoolType.CurveFactoryMetaPool, 2, 0, 0, Action.AddLiquidity)],
      TRICRV: [
        encodePoolHintV2(ADDRESS.CURVE_MIM3CRV_POOL, PoolType.CurveFactoryMetaPool, 2, 1, 1, Action.AddLiquidity),
      ],
      DAI: [
        encodePoolHintV2(
          ADDRESS.CURVE_MIM3CRV_POOL,
          PoolType.CurveFactoryUSDMetaPoolUnderlying,
          4,
          1,
          1,
          Action.AddLiquidity
        ),
      ],
      USDC: [
        encodePoolHintV2(
          ADDRESS.CURVE_MIM3CRV_POOL,
          PoolType.CurveFactoryUSDMetaPoolUnderlying,
          4,
          2,
          2,
          Action.AddLiquidity
        ),
      ],
      USDT: [
        encodePoolHintV2(
          ADDRESS.CURVE_MIM3CRV_POOL,
          PoolType.CurveFactoryUSDMetaPoolUnderlying,
          4,
          3,
          3,
          Action.AddLiquidity
        ),
      ],
      // WETH ==(UniV3)==> USDC
      WETH: [
        encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 1, 0, Action.Swap),
        encodePoolHintV2(
          ADDRESS.CURVE_MIM3CRV_POOL,
          PoolType.CurveFactoryUSDMetaPoolUnderlying,
          4,
          2,
          2,
          Action.AddLiquidity
        ),
      ],
    },
    withdraw: {
      MIM: [
        encodePoolHintV2(ADDRESS.CURVE_MIM3CRV_POOL, PoolType.CurveFactoryMetaPool, 2, 0, 0, Action.RemoveLiquidity),
      ],
      TRICRV: [
        encodePoolHintV2(ADDRESS.CURVE_MIM3CRV_POOL, PoolType.CurveFactoryMetaPool, 2, 1, 1, Action.RemoveLiquidity),
      ],
      DAI: [
        encodePoolHintV2(
          ADDRESS.CURVE_MIM3CRV_POOL,
          PoolType.CurveFactoryUSDMetaPoolUnderlying,
          4,
          1,
          1,
          Action.RemoveLiquidity
        ),
      ],
      USDC: [
        encodePoolHintV2(
          ADDRESS.CURVE_MIM3CRV_POOL,
          PoolType.CurveFactoryUSDMetaPoolUnderlying,
          4,
          2,
          2,
          Action.RemoveLiquidity
        ),
      ],
      USDT: [
        encodePoolHintV2(
          ADDRESS.CURVE_MIM3CRV_POOL,
          PoolType.CurveFactoryUSDMetaPoolUnderlying,
          4,
          3,
          3,
          Action.RemoveLiquidity
        ),
      ],
      // USDC ==(UniV3)==> WETH
      WETH: [
        encodePoolHintV2(
          ADDRESS.CURVE_MIM3CRV_POOL,
          PoolType.CurveFactoryUSDMetaPoolUnderlying,
          4,
          2,
          2,
          Action.RemoveLiquidity
        ),
        encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 0, 1, Action.Swap),
      ],
    },
  },
  ironbank: {
    token: "CURVE_IRONBANK",
    composition: "iDAI+iUSDC+iUSDT",
    convexCurveID: 29,
    rewarder: "0x3E03fFF82F77073cc590b656D42FceB12E4910A8",
    rewards: [ADDRESS.CRV, ADDRESS.CVX],
    deposit: {
      cyDAI: [encodePoolHintV2(ADDRESS.CURVE_IRONBANK_POOL, PoolType.CurveAPool, 3, 0, 0, Action.AddLiquidity)],
      cyUSDC: [encodePoolHintV2(ADDRESS.CURVE_IRONBANK_POOL, PoolType.CurveAPool, 3, 1, 1, Action.AddLiquidity)],
      cyUSDT: [encodePoolHintV2(ADDRESS.CURVE_IRONBANK_POOL, PoolType.CurveAPool, 3, 2, 2, Action.AddLiquidity)],
      DAI: [encodePoolHintV2(ADDRESS.CURVE_IRONBANK_POOL, PoolType.CurveAPoolUnderlying, 3, 0, 0, Action.AddLiquidity)],
      USDC: [
        encodePoolHintV2(ADDRESS.CURVE_IRONBANK_POOL, PoolType.CurveAPoolUnderlying, 3, 1, 1, Action.AddLiquidity),
      ],
      USDT: [
        encodePoolHintV2(ADDRESS.CURVE_IRONBANK_POOL, PoolType.CurveAPoolUnderlying, 3, 2, 2, Action.AddLiquidity),
      ],
      // WETH ==(UniV3)==> USDC
      WETH: [
        encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 1, 0, Action.Swap),
        encodePoolHintV2(ADDRESS.CURVE_IRONBANK_POOL, PoolType.CurveAPoolUnderlying, 3, 1, 0, Action.AddLiquidity),
      ],
    },
    withdraw: {
      cyDAI: [encodePoolHintV2(ADDRESS.CURVE_IRONBANK_POOL, PoolType.CurveAPool, 3, 0, 0, Action.RemoveLiquidity)],
      cyUSDC: [encodePoolHintV2(ADDRESS.CURVE_IRONBANK_POOL, PoolType.CurveAPool, 3, 1, 1, Action.RemoveLiquidity)],
      cyUSDT: [encodePoolHintV2(ADDRESS.CURVE_IRONBANK_POOL, PoolType.CurveAPool, 3, 2, 2, Action.RemoveLiquidity)],
      DAI: [
        encodePoolHintV2(ADDRESS.CURVE_IRONBANK_POOL, PoolType.CurveAPoolUnderlying, 3, 0, 0, Action.RemoveLiquidity),
      ],
      USDC: [
        encodePoolHintV2(ADDRESS.CURVE_IRONBANK_POOL, PoolType.CurveAPoolUnderlying, 3, 1, 1, Action.RemoveLiquidity),
      ],
      USDT: [
        encodePoolHintV2(ADDRESS.CURVE_IRONBANK_POOL, PoolType.CurveAPoolUnderlying, 3, 2, 2, Action.RemoveLiquidity),
      ],
      // WETH ==(UniV3)==> USDC
      WETH: [
        encodePoolHintV2(ADDRESS.CURVE_IRONBANK_POOL, PoolType.CurveAPoolUnderlying, 3, 1, 1, Action.RemoveLiquidity),
        encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 0, 1, Action.Swap),
      ],
    },
  },
  fpifrax: {
    token: "CURVE_FPIFRAX",
    composition: "FRAX+FPI",
    convexCurveID: 82,
    convexFraxID: 4,
    rewarder: "0x1A8D59cCbbC81ecD556B86969680faD2F238F18f",
    rewards: [ADDRESS.CRV, ADDRESS.CVX],
    deposit: {
      FRAX: [encodePoolHintV2(ADDRESS.CURVE_FPIFRAX_POOL, PoolType.CurveCryptoPool, 2, 0, 0, Action.AddLiquidity)],
      FPI: [encodePoolHintV2(ADDRESS.CURVE_FPIFRAX_POOL, PoolType.CurveCryptoPool, 2, 1, 1, Action.AddLiquidity)],
      // WETH ==(UniV3)==> USDC ==(UniV3)==> FRAX
      WETH: [
        encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 1, 0, Action.Swap),
        encodePoolHintV2(ADDRESS.FRAX_USDC_UNIV3_500, PoolType.UniswapV3, 2, 1, 0, Action.Swap),
        encodePoolHintV2(ADDRESS.CURVE_FPIFRAX_POOL, PoolType.CurveCryptoPool, 2, 0, 0, Action.AddLiquidity),
      ],
      // USDC ==(UniV3)==> FRAX
      USDC: [
        encodePoolHintV2(ADDRESS.FRAX_USDC_UNIV3_500, PoolType.UniswapV3, 2, 1, 0, Action.Swap),
        encodePoolHintV2(ADDRESS.CURVE_FPIFRAX_POOL, PoolType.CurveCryptoPool, 2, 0, 0, Action.AddLiquidity),
      ],
    },
    withdraw: {
      FRAX: [encodePoolHintV2(ADDRESS.CURVE_FPIFRAX_POOL, PoolType.CurveCryptoPool, 2, 0, 0, Action.RemoveLiquidity)],
      FPI: [encodePoolHintV2(ADDRESS.CURVE_FPIFRAX_POOL, PoolType.CurveCryptoPool, 2, 1, 1, Action.RemoveLiquidity)],
      // FRAX ==(UniV3)==> USDC ==(UniV3)==> WETH
      WETH: [
        encodePoolHintV2(ADDRESS.CURVE_FPIFRAX_POOL, PoolType.CurveCryptoPool, 2, 0, 0, Action.RemoveLiquidity),
        encodePoolHintV2(ADDRESS.FRAX_USDC_UNIV3_500, PoolType.UniswapV3, 2, 0, 1, Action.Swap),
        encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 0, 1, Action.Swap),
      ],
      // FRAX ==(UniV3)==> USDC
      USDC: [
        encodePoolHintV2(ADDRESS.CURVE_FPIFRAX_POOL, PoolType.CurveCryptoPool, 2, 0, 0, Action.RemoveLiquidity),
        encodePoolHintV2(ADDRESS.FRAX_USDC_UNIV3_500, PoolType.UniswapV3, 2, 0, 1, Action.Swap),
      ],
    },
  },
  alusd: {
    token: "CURVE_alUSD3CRV",
    composition: "alUSD+3CRV",
    convexCurveID: 36,
    rewarder: "0x02E2151D4F351881017ABdF2DD2b51150841d5B3",
    rewards: [ADDRESS.CRV, ADDRESS.CVX, ADDRESS.ALCX],
    deposit: {
      alUSD: [
        encodePoolHintV2(ADDRESS.CURVE_alUSD3CRV_POOL, PoolType.CurveFactoryMetaPool, 2, 0, 0, Action.AddLiquidity),
      ],
      TRICRV: [
        encodePoolHintV2(ADDRESS.CURVE_alUSD3CRV_POOL, PoolType.CurveFactoryMetaPool, 2, 1, 1, Action.AddLiquidity),
      ],
      DAI: [
        encodePoolHintV2(
          ADDRESS.CURVE_alUSD3CRV_POOL,
          PoolType.CurveFactoryUSDMetaPoolUnderlying,
          4,
          1,
          1,
          Action.AddLiquidity
        ),
      ],
      USDC: [
        encodePoolHintV2(
          ADDRESS.CURVE_alUSD3CRV_POOL,
          PoolType.CurveFactoryUSDMetaPoolUnderlying,
          4,
          2,
          2,
          Action.AddLiquidity
        ),
      ],
      USDT: [
        encodePoolHintV2(
          ADDRESS.CURVE_alUSD3CRV_POOL,
          PoolType.CurveFactoryUSDMetaPoolUnderlying,
          4,
          3,
          3,
          Action.AddLiquidity
        ),
      ],
      // WETH ==(UniV3)==> USDC
      WETH: [
        encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 1, 0, Action.Swap),
        encodePoolHintV2(
          ADDRESS.CURVE_alUSD3CRV_POOL,
          PoolType.CurveFactoryUSDMetaPoolUnderlying,
          4,
          2,
          2,
          Action.AddLiquidity
        ),
      ],
    },
    withdraw: {
      alUSD: [
        encodePoolHintV2(ADDRESS.CURVE_alUSD3CRV_POOL, PoolType.CurveFactoryMetaPool, 2, 0, 0, Action.RemoveLiquidity),
      ],
      TRICRV: [
        encodePoolHintV2(ADDRESS.CURVE_alUSD3CRV_POOL, PoolType.CurveFactoryMetaPool, 2, 1, 1, Action.RemoveLiquidity),
      ],
      DAI: [
        encodePoolHintV2(
          ADDRESS.CURVE_alUSD3CRV_POOL,
          PoolType.CurveFactoryUSDMetaPoolUnderlying,
          4,
          1,
          1,
          Action.RemoveLiquidity
        ),
      ],
      USDC: [
        encodePoolHintV2(
          ADDRESS.CURVE_alUSD3CRV_POOL,
          PoolType.CurveFactoryUSDMetaPoolUnderlying,
          4,
          2,
          2,
          Action.RemoveLiquidity
        ),
      ],
      USDT: [
        encodePoolHintV2(
          ADDRESS.CURVE_alUSD3CRV_POOL,
          PoolType.CurveFactoryUSDMetaPoolUnderlying,
          4,
          3,
          3,
          Action.RemoveLiquidity
        ),
      ],
      // USDC ==(UniV3)==> WETH
      WETH: [
        encodePoolHintV2(
          ADDRESS.CURVE_alUSD3CRV_POOL,
          PoolType.CurveFactoryUSDMetaPoolUnderlying,
          4,
          2,
          2,
          Action.RemoveLiquidity
        ),
        encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 0, 1, Action.Swap),
      ],
    },
  },
  compound: {
    token: "CURVE_COMPOUND",
    composition: "cDAI+cUSDC",
    convexCurveID: 0,
    rewarder: "0xf34DFF761145FF0B05e917811d488B441F33a968",
    rewards: [ADDRESS.CRV, ADDRESS.CVX],
    deposit: {
      DAI: [
        encodePoolHintV2(ADDRESS.CURVE_COMPOUND_DEPOSIT, PoolType.CurveYPoolUnderlying, 2, 0, 0, Action.AddLiquidity),
      ],
      USDC: [
        encodePoolHintV2(ADDRESS.CURVE_COMPOUND_DEPOSIT, PoolType.CurveYPoolUnderlying, 2, 1, 1, Action.AddLiquidity),
      ],
      // WETH ==(UniV3)==> USDC
      WETH: [
        encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 1, 0, Action.Swap),
        encodePoolHintV2(ADDRESS.CURVE_COMPOUND_DEPOSIT, PoolType.CurveYPoolUnderlying, 2, 1, 1, Action.AddLiquidity),
      ],
    },
    withdraw: {
      DAI: [
        encodePoolHintV2(
          ADDRESS.CURVE_COMPOUND_DEPOSIT,
          PoolType.CurveYPoolUnderlying,
          2,
          0,
          0,
          Action.RemoveLiquidity
        ),
      ],
      USDC: [
        encodePoolHintV2(
          ADDRESS.CURVE_COMPOUND_DEPOSIT,
          PoolType.CurveYPoolUnderlying,
          2,
          1,
          1,
          Action.RemoveLiquidity
        ),
      ],
      // WETH ==(UniV3)==> USDC
      WETH: [
        encodePoolHintV2(
          ADDRESS.CURVE_COMPOUND_DEPOSIT,
          PoolType.CurveYPoolUnderlying,
          2,
          1,
          1,
          Action.RemoveLiquidity
        ),
        encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 0, 1, Action.Swap),
      ],
    },
  },
  dola: {
    token: "CURVE_DOLA3CRV",
    composition: "DOLA+3CRV",
    convexCurveID: 62,
    rewarder: "0x835f69e58087E5B6bffEf182fe2bf959Fe253c3c",
    rewards: [ADDRESS.CRV, ADDRESS.CVX],
    deposit: {
      DOLA: [
        encodePoolHintV2(ADDRESS.CURVE_DOLA3CRV_POOL, PoolType.CurveFactoryMetaPool, 2, 0, 0, Action.AddLiquidity),
      ],
      TRICRV: [
        encodePoolHintV2(ADDRESS.CURVE_DOLA3CRV_POOL, PoolType.CurveFactoryMetaPool, 2, 1, 1, Action.AddLiquidity),
      ],
      DAI: [
        encodePoolHintV2(
          ADDRESS.CURVE_DOLA3CRV_POOL,
          PoolType.CurveFactoryUSDMetaPoolUnderlying,
          4,
          1,
          1,
          Action.AddLiquidity
        ),
      ],
      USDC: [
        encodePoolHintV2(
          ADDRESS.CURVE_DOLA3CRV_POOL,
          PoolType.CurveFactoryUSDMetaPoolUnderlying,
          4,
          2,
          2,
          Action.AddLiquidity
        ),
      ],
      USDT: [
        encodePoolHintV2(
          ADDRESS.CURVE_DOLA3CRV_POOL,
          PoolType.CurveFactoryUSDMetaPoolUnderlying,
          4,
          3,
          3,
          Action.AddLiquidity
        ),
      ],
      // WETH ==(UniV3)==> USDC
      WETH: [
        encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 1, 0, Action.Swap),
        encodePoolHintV2(
          ADDRESS.CURVE_DOLA3CRV_POOL,
          PoolType.CurveFactoryUSDMetaPoolUnderlying,
          4,
          2,
          2,
          Action.AddLiquidity
        ),
      ],
    },
    withdraw: {
      DOLA: [
        encodePoolHintV2(ADDRESS.CURVE_DOLA3CRV_POOL, PoolType.CurveFactoryMetaPool, 2, 0, 0, Action.RemoveLiquidity),
      ],
      TRICRV: [
        encodePoolHintV2(ADDRESS.CURVE_DOLA3CRV_POOL, PoolType.CurveFactoryMetaPool, 2, 1, 1, Action.RemoveLiquidity),
      ],
      DAI: [
        encodePoolHintV2(
          ADDRESS.CURVE_DOLA3CRV_POOL,
          PoolType.CurveFactoryUSDMetaPoolUnderlying,
          4,
          1,
          1,
          Action.RemoveLiquidity
        ),
      ],
      USDC: [
        encodePoolHintV2(
          ADDRESS.CURVE_DOLA3CRV_POOL,
          PoolType.CurveFactoryUSDMetaPoolUnderlying,
          4,
          2,
          2,
          Action.RemoveLiquidity
        ),
      ],
      USDT: [
        encodePoolHintV2(
          ADDRESS.CURVE_DOLA3CRV_POOL,
          PoolType.CurveFactoryUSDMetaPoolUnderlying,
          4,
          3,
          3,
          Action.RemoveLiquidity
        ),
      ],
      // USDC ==(UniV3)==> WETH
      WETH: [
        encodePoolHintV2(
          ADDRESS.CURVE_DOLA3CRV_POOL,
          PoolType.CurveFactoryUSDMetaPoolUnderlying,
          4,
          2,
          2,
          Action.RemoveLiquidity
        ),
        encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 0, 1, Action.Swap),
      ],
    },
  },
  busdv2: {
    token: "CURVE_BUSD3CRV",
    composition: "BUSD+3CRV",
    convexCurveID: 34,
    rewarder: "0xbD223812d360C9587921292D0644D18aDb6a2ad0",
    rewards: [ADDRESS.CRV, ADDRESS.CVX],
    deposit: {
      BUSD: [
        encodePoolHintV2(ADDRESS.CURVE_BUSD3CRV_POOL, PoolType.CurveFactoryMetaPool, 2, 0, 0, Action.AddLiquidity),
      ],
      TRICRV: [
        encodePoolHintV2(ADDRESS.CURVE_BUSD3CRV_POOL, PoolType.CurveFactoryMetaPool, 2, 1, 1, Action.AddLiquidity),
      ],
      DAI: [
        encodePoolHintV2(
          ADDRESS.CURVE_BUSD3CRV_POOL,
          PoolType.CurveFactoryUSDMetaPoolUnderlying,
          4,
          1,
          1,
          Action.AddLiquidity
        ),
      ],
      USDC: [
        encodePoolHintV2(
          ADDRESS.CURVE_BUSD3CRV_POOL,
          PoolType.CurveFactoryUSDMetaPoolUnderlying,
          4,
          2,
          2,
          Action.AddLiquidity
        ),
      ],
      USDT: [
        encodePoolHintV2(
          ADDRESS.CURVE_BUSD3CRV_POOL,
          PoolType.CurveFactoryUSDMetaPoolUnderlying,
          4,
          3,
          3,
          Action.AddLiquidity
        ),
      ],
      // WETH ==(UniV3)==> USDC
      WETH: [
        encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 1, 0, Action.Swap),
        encodePoolHintV2(
          ADDRESS.CURVE_BUSD3CRV_POOL,
          PoolType.CurveFactoryUSDMetaPoolUnderlying,
          4,
          2,
          2,
          Action.AddLiquidity
        ),
      ],
    },
    withdraw: {
      BUSD: [
        encodePoolHintV2(ADDRESS.CURVE_BUSD3CRV_POOL, PoolType.CurveFactoryMetaPool, 2, 0, 0, Action.RemoveLiquidity),
      ],
      TRICRV: [
        encodePoolHintV2(ADDRESS.CURVE_BUSD3CRV_POOL, PoolType.CurveFactoryMetaPool, 2, 1, 1, Action.RemoveLiquidity),
      ],
      DAI: [
        encodePoolHintV2(
          ADDRESS.CURVE_BUSD3CRV_POOL,
          PoolType.CurveFactoryUSDMetaPoolUnderlying,
          4,
          1,
          1,
          Action.RemoveLiquidity
        ),
      ],
      USDC: [
        encodePoolHintV2(
          ADDRESS.CURVE_BUSD3CRV_POOL,
          PoolType.CurveFactoryUSDMetaPoolUnderlying,
          4,
          2,
          2,
          Action.RemoveLiquidity
        ),
      ],
      USDT: [
        encodePoolHintV2(
          ADDRESS.CURVE_BUSD3CRV_POOL,
          PoolType.CurveFactoryUSDMetaPoolUnderlying,
          4,
          3,
          3,
          Action.RemoveLiquidity
        ),
      ],
      // USDC ==(UniV3)==> WETH
      WETH: [
        encodePoolHintV2(
          ADDRESS.CURVE_BUSD3CRV_POOL,
          PoolType.CurveFactoryUSDMetaPoolUnderlying,
          4,
          2,
          2,
          Action.RemoveLiquidity
        ),
        encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 0, 1, Action.Swap),
      ],
    },
  },
  aleth: {
    token: "CURVE_alETH",
    composition: "ETH+alETH",
    convexCurveID: 49,
    rewarder: "0x48Bc302d8295FeA1f8c3e7F57D4dDC9981FEE410",
    rewards: [ADDRESS.CRV, ADDRESS.CVX],
    deposit: {
      WETH: [encodePoolHintV2(ADDRESS.CURVE_alETH_POOL, PoolType.CurveETHPool, 2, 0, 0, Action.AddLiquidity)],
      alETH: [encodePoolHintV2(ADDRESS.CURVE_alETH_POOL, PoolType.CurveETHPool, 2, 1, 1, Action.AddLiquidity)],
      // USDC ==(UniV3)==> WETH
      USDC: [
        encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 0, 1, Action.Swap),
        encodePoolHintV2(ADDRESS.CURVE_alETH_POOL, PoolType.CurveETHPool, 2, 0, 0, Action.AddLiquidity),
      ],
    },
    withdraw: {
      WETH: [encodePoolHintV2(ADDRESS.CURVE_alETH_POOL, PoolType.CurveETHPool, 2, 0, 0, Action.RemoveLiquidity)],
      alETH: [encodePoolHintV2(ADDRESS.CURVE_alETH_POOL, PoolType.CurveETHPool, 2, 1, 1, Action.RemoveLiquidity)],
      // WETH ==(UniV3)==> USDC
      USDC: [
        encodePoolHintV2(ADDRESS.CURVE_alETH_POOL, PoolType.CurveETHPool, 2, 0, 0, Action.RemoveLiquidity),
        encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 1, 0, Action.Swap),
      ],
    },
  },
  "3eur": {
    token: "CURVE_3EUR",
    composition: "agEUR+EURT+EURS",
    convexCurveID: 60,
    rewarder: "0x4a9b7eDD67f58654a2c33B587f98c5709AC7d482",
    rewards: [ADDRESS.CRV, ADDRESS.CVX, ADDRESS.ANGLE],
    deposit: {
      agEUR: [encodePoolHintV2(ADDRESS.CURVE_3EUR_POOL, PoolType.CurveFactoryPlainPool, 3, 0, 0, Action.AddLiquidity)],
      EURT: [encodePoolHintV2(ADDRESS.CURVE_3EUR_POOL, PoolType.CurveFactoryPlainPool, 3, 1, 1, Action.AddLiquidity)],
      EURS: [encodePoolHintV2(ADDRESS.CURVE_3EUR_POOL, PoolType.CurveFactoryPlainPool, 3, 2, 2, Action.AddLiquidity)],
      // USDC ==(UniV3)==> agEUR
      USDC: [
        encodePoolHintV2(ADDRESS.agEUR_USDC_UNIV3_100, PoolType.UniswapV3, 2, 1, 0, Action.Swap),
        encodePoolHintV2(ADDRESS.CURVE_3EUR_POOL, PoolType.CurveFactoryPlainPool, 3, 0, 0, Action.AddLiquidity),
      ],
      // WETH ==(UniV3)==> USDC ==(UniV3)==> agEUR
      WETH: [
        encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 1, 0, Action.Swap),
        encodePoolHintV2(ADDRESS.agEUR_USDC_UNIV3_100, PoolType.UniswapV3, 2, 1, 0, Action.Swap),
        encodePoolHintV2(ADDRESS.CURVE_3EUR_POOL, PoolType.CurveFactoryPlainPool, 3, 0, 0, Action.AddLiquidity),
      ],
    },
    withdraw: {
      agEUR: [
        encodePoolHintV2(ADDRESS.CURVE_3EUR_POOL, PoolType.CurveFactoryPlainPool, 3, 0, 0, Action.RemoveLiquidity),
      ],
      EURT: [
        encodePoolHintV2(ADDRESS.CURVE_3EUR_POOL, PoolType.CurveFactoryPlainPool, 3, 1, 1, Action.RemoveLiquidity),
      ],
      EURS: [
        encodePoolHintV2(ADDRESS.CURVE_3EUR_POOL, PoolType.CurveFactoryPlainPool, 3, 2, 2, Action.RemoveLiquidity),
      ],
      // agEUR ==(UniV3)==> USDC
      USDC: [
        encodePoolHintV2(ADDRESS.CURVE_3EUR_POOL, PoolType.CurveFactoryPlainPool, 3, 0, 0, Action.RemoveLiquidity),
        encodePoolHintV2(ADDRESS.agEUR_USDC_UNIV3_100, PoolType.UniswapV3, 2, 0, 1, Action.Swap),
      ],
      // agEUR ==(UniV3)==> USDC ==(UniV3)==> WETH
      WETH: [
        encodePoolHintV2(ADDRESS.CURVE_3EUR_POOL, PoolType.CurveFactoryPlainPool, 3, 0, 0, Action.RemoveLiquidity),
        encodePoolHintV2(ADDRESS.agEUR_USDC_UNIV3_100, PoolType.UniswapV3, 2, 0, 1, Action.Swap),
        encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 0, 1, Action.Swap),
      ],
    },
  },
  lusd: {
    token: "CURVE_LUSD3CRV",
    composition: "LUSD+3CRV",
    convexCurveID: 33,
    rewarder: "0x2ad92A7aE036a038ff02B96c88de868ddf3f8190",
    rewards: [ADDRESS.CRV, ADDRESS.CVX], // ignore for now ADDRESS.LQTY
    deposit: {
      LUSD: [
        encodePoolHintV2(ADDRESS.CURVE_LUSD3CRV_POOL, PoolType.CurveFactoryMetaPool, 2, 0, 0, Action.AddLiquidity),
      ],
      TRICRV: [
        encodePoolHintV2(ADDRESS.CURVE_LUSD3CRV_POOL, PoolType.CurveFactoryMetaPool, 2, 1, 1, Action.AddLiquidity),
      ],
      DAI: [
        encodePoolHintV2(
          ADDRESS.CURVE_LUSD3CRV_POOL,
          PoolType.CurveFactoryUSDMetaPoolUnderlying,
          4,
          1,
          1,
          Action.AddLiquidity
        ),
      ],
      USDC: [
        encodePoolHintV2(
          ADDRESS.CURVE_LUSD3CRV_POOL,
          PoolType.CurveFactoryUSDMetaPoolUnderlying,
          4,
          2,
          2,
          Action.AddLiquidity
        ),
      ],
      USDT: [
        encodePoolHintV2(
          ADDRESS.CURVE_LUSD3CRV_POOL,
          PoolType.CurveFactoryUSDMetaPoolUnderlying,
          4,
          3,
          3,
          Action.AddLiquidity
        ),
      ],
      // USDC ==(UniV3)==> WETH
      WETH: [
        encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 1, 0, Action.Swap),
        encodePoolHintV2(
          ADDRESS.CURVE_LUSD3CRV_POOL,
          PoolType.CurveFactoryUSDMetaPoolUnderlying,
          4,
          2,
          2,
          Action.AddLiquidity
        ),
      ],
    },
    withdraw: {
      LUSD: [
        encodePoolHintV2(ADDRESS.CURVE_LUSD3CRV_POOL, PoolType.CurveFactoryMetaPool, 2, 0, 0, Action.RemoveLiquidity),
      ],
      TRICRV: [
        encodePoolHintV2(ADDRESS.CURVE_LUSD3CRV_POOL, PoolType.CurveFactoryMetaPool, 2, 1, 1, Action.RemoveLiquidity),
      ],
      DAI: [
        encodePoolHintV2(
          ADDRESS.CURVE_LUSD3CRV_POOL,
          PoolType.CurveFactoryUSDMetaPoolUnderlying,
          4,
          1,
          1,
          Action.RemoveLiquidity
        ),
      ],
      USDC: [
        encodePoolHintV2(
          ADDRESS.CURVE_LUSD3CRV_POOL,
          PoolType.CurveFactoryUSDMetaPoolUnderlying,
          4,
          2,
          2,
          Action.RemoveLiquidity
        ),
      ],
      USDT: [
        encodePoolHintV2(
          ADDRESS.CURVE_LUSD3CRV_POOL,
          PoolType.CurveFactoryUSDMetaPoolUnderlying,
          4,
          3,
          3,
          Action.RemoveLiquidity
        ),
      ],
      // USDC ==(UniV3)==> WETH
      WETH: [
        encodePoolHintV2(
          ADDRESS.CURVE_LUSD3CRV_POOL,
          PoolType.CurveFactoryUSDMetaPoolUnderlying,
          4,
          2,
          2,
          Action.RemoveLiquidity
        ),
        encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 0, 1, Action.Swap),
      ],
    },
  },
  silofrax: {
    token: "CURVE_SILOFRAX",
    composition: "Silo+FRAX",
    convexCurveID: 78,
    rewarder: "0xE259d085f55825624bBA8571eD20984c125Ba720",
    rewards: [ADDRESS.CRV, ADDRESS.CVX],
    deposit: {
      SILO: [encodePoolHintV2(ADDRESS.CURVE_SILOFRAX_POOL, PoolType.CurveCryptoPool, 2, 0, 0, Action.AddLiquidity)],
      FRAX: [encodePoolHintV2(ADDRESS.CURVE_SILOFRAX_POOL, PoolType.CurveCryptoPool, 2, 1, 1, Action.AddLiquidity)],
      // USDC ==(UniV3)==> FRAX
      USDC: [
        encodePoolHintV2(ADDRESS.FRAX_USDC_UNIV3_500, PoolType.UniswapV3, 2, 1, 0, Action.Swap),
        encodePoolHintV2(ADDRESS.CURVE_SILOFRAX_POOL, PoolType.CurveCryptoPool, 2, 1, 1, Action.AddLiquidity),
      ],
      // WETH ==(UniV3)==> USDC ==(UniV3)==> FRAX
      WETH: [
        encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 1, 0, Action.Swap),
        encodePoolHintV2(ADDRESS.FRAX_USDC_UNIV3_500, PoolType.UniswapV3, 2, 1, 0, Action.Swap),
        encodePoolHintV2(ADDRESS.CURVE_SILOFRAX_POOL, PoolType.CurveCryptoPool, 2, 1, 1, Action.AddLiquidity),
      ],
    },
    withdraw: {
      SILO: [encodePoolHintV2(ADDRESS.CURVE_SILOFRAX_POOL, PoolType.CurveCryptoPool, 2, 0, 0, Action.RemoveLiquidity)],
      FRAX: [encodePoolHintV2(ADDRESS.CURVE_SILOFRAX_POOL, PoolType.CurveCryptoPool, 2, 1, 1, Action.RemoveLiquidity)],
      // FRAX ==(UniV3)==> USDC
      USDC: [
        encodePoolHintV2(ADDRESS.CURVE_SILOFRAX_POOL, PoolType.CurveCryptoPool, 2, 1, 1, Action.RemoveLiquidity),
        encodePoolHintV2(ADDRESS.FRAX_USDC_UNIV3_500, PoolType.UniswapV3, 2, 0, 1, Action.Swap),
      ],
      // FRAX  ==(UniV3)==> USDC ==(UniV3)==> WETH
      WETH: [
        encodePoolHintV2(ADDRESS.CURVE_SILOFRAX_POOL, PoolType.CurveCryptoPool, 2, 1, 1, Action.RemoveLiquidity),
        encodePoolHintV2(ADDRESS.FRAX_USDC_UNIV3_500, PoolType.UniswapV3, 2, 0, 1, Action.Swap),
        encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 0, 1, Action.Swap),
      ],
    },
  },
  tusd: {
    token: "CURVE_TUSD3CRV",
    composition: "tusd+3CRV",
    convexCurveID: 31,
    rewarder: "0x308b48F037AAa75406426dACFACA864ebd88eDbA",
    rewards: [ADDRESS.CRV, ADDRESS.CVX],
    deposit: {
      TUSD: [
        encodePoolHintV2(ADDRESS.CURVE_TUSD3CRV_POOL, PoolType.CurveFactoryMetaPool, 2, 0, 0, Action.AddLiquidity),
      ],
      TRICRV: [
        encodePoolHintV2(ADDRESS.CURVE_TUSD3CRV_POOL, PoolType.CurveFactoryMetaPool, 2, 1, 1, Action.AddLiquidity),
      ],
      DAI: [
        encodePoolHintV2(
          ADDRESS.CURVE_TUSD3CRV_POOL,
          PoolType.CurveFactoryUSDMetaPoolUnderlying,
          4,
          1,
          1,
          Action.AddLiquidity
        ),
      ],
      USDC: [
        encodePoolHintV2(
          ADDRESS.CURVE_TUSD3CRV_POOL,
          PoolType.CurveFactoryUSDMetaPoolUnderlying,
          4,
          2,
          2,
          Action.AddLiquidity
        ),
      ],
      USDT: [
        encodePoolHintV2(
          ADDRESS.CURVE_TUSD3CRV_POOL,
          PoolType.CurveFactoryUSDMetaPoolUnderlying,
          4,
          3,
          3,
          Action.AddLiquidity
        ),
      ],
      // WETH ==(UniV3)==> USDC
      WETH: [
        encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 1, 0, Action.Swap),
        encodePoolHintV2(
          ADDRESS.CURVE_TUSD3CRV_POOL,
          PoolType.CurveFactoryUSDMetaPoolUnderlying,
          4,
          2,
          2,
          Action.AddLiquidity
        ),
      ],
    },
    withdraw: {
      TUSD: [
        encodePoolHintV2(ADDRESS.CURVE_TUSD3CRV_POOL, PoolType.CurveFactoryMetaPool, 2, 0, 0, Action.RemoveLiquidity),
      ],
      TRICRV: [
        encodePoolHintV2(ADDRESS.CURVE_TUSD3CRV_POOL, PoolType.CurveFactoryMetaPool, 2, 1, 1, Action.RemoveLiquidity),
      ],
      DAI: [
        encodePoolHintV2(
          ADDRESS.CURVE_TUSD3CRV_POOL,
          PoolType.CurveFactoryUSDMetaPoolUnderlying,
          4,
          1,
          1,
          Action.RemoveLiquidity
        ),
      ],
      USDC: [
        encodePoolHintV2(
          ADDRESS.CURVE_TUSD3CRV_POOL,
          PoolType.CurveFactoryUSDMetaPoolUnderlying,
          4,
          2,
          2,
          Action.RemoveLiquidity
        ),
      ],
      USDT: [
        encodePoolHintV2(
          ADDRESS.CURVE_TUSD3CRV_POOL,
          PoolType.CurveFactoryUSDMetaPoolUnderlying,
          4,
          3,
          3,
          Action.RemoveLiquidity
        ),
      ],
      // USDC ==(UniV3)==> WETH
      WETH: [
        encodePoolHintV2(
          ADDRESS.CURVE_TUSD3CRV_POOL,
          PoolType.CurveFactoryUSDMetaPoolUnderlying,
          4,
          2,
          2,
          Action.RemoveLiquidity
        ),
        encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 0, 1, Action.Swap),
      ],
    },
  },
  susdfraxbp: {
    token: "CURVE_sUSDFRAXBP",
    composition: "sUSD+FRAXBP",
    convexCurveID: 101,
    rewarder: "0x3fABBDfe05487De1720a9420fE2e16d2c3e79A9D",
    rewards: [ADDRESS.CRV, ADDRESS.CVX],
    deposit: {
      sUSD: [
        encodePoolHintV2(ADDRESS.CURVE_sUSDFRAXBP_POOL, PoolType.CurveFactoryMetaPool, 2, 0, 0, Action.AddLiquidity),
      ],
      crvFRAX: [
        encodePoolHintV2(ADDRESS.CURVE_sUSDFRAXBP_POOL, PoolType.CurveFactoryMetaPool, 2, 1, 1, Action.AddLiquidity),
      ],
      FRAX: [
        encodePoolHintV2(
          ADDRESS.CURVE_sUSDFRAXBP_POOL,
          PoolType.CurveFactoryFraxBPMetaPoolUnderlying,
          3,
          1,
          1,
          Action.AddLiquidity
        ),
      ],
      USDC: [
        encodePoolHintV2(
          ADDRESS.CURVE_sUSDFRAXBP_POOL,
          PoolType.CurveFactoryFraxBPMetaPoolUnderlying,
          3,
          2,
          2,
          Action.AddLiquidity
        ),
      ],
      // WETH ==(UniV3)==> USDC
      WETH: [
        encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 1, 0, Action.Swap),
        encodePoolHintV2(
          ADDRESS.CURVE_sUSDFRAXBP_POOL,
          PoolType.CurveFactoryFraxBPMetaPoolUnderlying,
          3,
          2,
          2,
          Action.AddLiquidity
        ),
      ],
    },
    withdraw: {
      sUSD: [
        encodePoolHintV2(ADDRESS.CURVE_sUSDFRAXBP_POOL, PoolType.CurveFactoryMetaPool, 2, 0, 0, Action.RemoveLiquidity),
      ],
      crvFRAX: [
        encodePoolHintV2(ADDRESS.CURVE_sUSDFRAXBP_POOL, PoolType.CurveFactoryMetaPool, 2, 1, 1, Action.RemoveLiquidity),
      ],
      FRAX: [
        encodePoolHintV2(
          ADDRESS.CURVE_sUSDFRAXBP_POOL,
          PoolType.CurveFactoryFraxBPMetaPoolUnderlying,
          3,
          1,
          1,
          Action.RemoveLiquidity
        ),
      ],
      USDC: [
        encodePoolHintV2(
          ADDRESS.CURVE_sUSDFRAXBP_POOL,
          PoolType.CurveFactoryFraxBPMetaPoolUnderlying,
          3,
          2,
          2,
          Action.RemoveLiquidity
        ),
      ],
      // USDC ==(UniV3)==> WETH
      WETH: [
        encodePoolHintV2(
          ADDRESS.CURVE_sUSDFRAXBP_POOL,
          PoolType.CurveFactoryFraxBPMetaPoolUnderlying,
          3,
          2,
          2,
          Action.RemoveLiquidity
        ),
        encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 0, 1, Action.Swap),
      ],
    },
  },
  busdfraxbp: {
    token: "CURVE_BUSDFRAXBP",
    composition: "BUSD+FRAXBP",
    convexCurveID: 105,
    rewarder: "0x9e6Daf019767D5cEAdE416ce77E8d187b5B254F3",
    rewards: [ADDRESS.CRV, ADDRESS.CVX],
    deposit: {
      BUSD: [
        encodePoolHintV2(ADDRESS.CURVE_BUSDFRAXBP_POOL, PoolType.CurveFactoryMetaPool, 2, 0, 0, Action.AddLiquidity),
      ],
      crvFRAX: [
        encodePoolHintV2(ADDRESS.CURVE_BUSDFRAXBP_POOL, PoolType.CurveFactoryMetaPool, 2, 1, 1, Action.AddLiquidity),
      ],
      FRAX: [
        encodePoolHintV2(
          ADDRESS.CURVE_BUSDFRAXBP_POOL,
          PoolType.CurveFactoryFraxBPMetaPoolUnderlying,
          3,
          1,
          1,
          Action.AddLiquidity
        ),
      ],
      USDC: [
        encodePoolHintV2(
          ADDRESS.CURVE_BUSDFRAXBP_POOL,
          PoolType.CurveFactoryFraxBPMetaPoolUnderlying,
          3,
          2,
          2,
          Action.AddLiquidity
        ),
      ],
      // WETH ==(UniV3)==> USDC
      WETH: [
        encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 1, 0, Action.Swap),
        encodePoolHintV2(
          ADDRESS.CURVE_BUSDFRAXBP_POOL,
          PoolType.CurveFactoryFraxBPMetaPoolUnderlying,
          3,
          2,
          2,
          Action.AddLiquidity
        ),
      ],
    },
    withdraw: {
      BUSD: [
        encodePoolHintV2(ADDRESS.CURVE_BUSDFRAXBP_POOL, PoolType.CurveFactoryMetaPool, 2, 0, 0, Action.RemoveLiquidity),
      ],
      crvFRAX: [
        encodePoolHintV2(ADDRESS.CURVE_BUSDFRAXBP_POOL, PoolType.CurveFactoryMetaPool, 2, 1, 1, Action.RemoveLiquidity),
      ],
      FRAX: [
        encodePoolHintV2(
          ADDRESS.CURVE_BUSDFRAXBP_POOL,
          PoolType.CurveFactoryFraxBPMetaPoolUnderlying,
          3,
          1,
          1,
          Action.RemoveLiquidity
        ),
      ],
      USDC: [
        encodePoolHintV2(
          ADDRESS.CURVE_BUSDFRAXBP_POOL,
          PoolType.CurveFactoryFraxBPMetaPoolUnderlying,
          3,
          2,
          2,
          Action.RemoveLiquidity
        ),
      ],
      // USDC ==(UniV3)==> WETH
      WETH: [
        encodePoolHintV2(
          ADDRESS.CURVE_BUSDFRAXBP_POOL,
          PoolType.CurveFactoryFraxBPMetaPoolUnderlying,
          3,
          2,
          2,
          Action.RemoveLiquidity
        ),
        encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 0, 1, Action.Swap),
      ],
    },
  },
  alusdfraxbp: {
    token: "CURVE_alUSDFRAXBP",
    composition: "alUSD+FRAXBP",
    convexCurveID: 106,
    rewarder: "0x26598e3E511ADFadefD70ab2C3475Ff741741104",
    rewards: [ADDRESS.CRV, ADDRESS.CVX],
    deposit: {
      alUSD: [
        encodePoolHintV2(ADDRESS.CURVE_alUSDFRAXBP_POOL, PoolType.CurveFactoryMetaPool, 2, 0, 0, Action.AddLiquidity),
      ],
      crvFRAX: [
        encodePoolHintV2(ADDRESS.CURVE_alUSDFRAXBP_POOL, PoolType.CurveFactoryMetaPool, 2, 1, 1, Action.AddLiquidity),
      ],
      FRAX: [
        encodePoolHintV2(
          ADDRESS.CURVE_alUSDFRAXBP_POOL,
          PoolType.CurveFactoryFraxBPMetaPoolUnderlying,
          3,
          1,
          1,
          Action.AddLiquidity
        ),
      ],
      USDC: [
        encodePoolHintV2(
          ADDRESS.CURVE_alUSDFRAXBP_POOL,
          PoolType.CurveFactoryFraxBPMetaPoolUnderlying,
          3,
          2,
          2,
          Action.AddLiquidity
        ),
      ],
      // WETH ==(UniV3)==> USDC
      WETH: [
        encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 1, 0, Action.Swap),
        encodePoolHintV2(
          ADDRESS.CURVE_alUSDFRAXBP_POOL,
          PoolType.CurveFactoryFraxBPMetaPoolUnderlying,
          3,
          2,
          2,
          Action.AddLiquidity
        ),
      ],
    },
    withdraw: {
      alUSD: [
        encodePoolHintV2(
          ADDRESS.CURVE_alUSDFRAXBP_POOL,
          PoolType.CurveFactoryMetaPool,
          2,
          0,
          0,
          Action.RemoveLiquidity
        ),
      ],
      crvFRAX: [
        encodePoolHintV2(
          ADDRESS.CURVE_alUSDFRAXBP_POOL,
          PoolType.CurveFactoryMetaPool,
          2,
          1,
          1,
          Action.RemoveLiquidity
        ),
      ],
      FRAX: [
        encodePoolHintV2(
          ADDRESS.CURVE_alUSDFRAXBP_POOL,
          PoolType.CurveFactoryFraxBPMetaPoolUnderlying,
          3,
          1,
          1,
          Action.RemoveLiquidity
        ),
      ],
      USDC: [
        encodePoolHintV2(
          ADDRESS.CURVE_alUSDFRAXBP_POOL,
          PoolType.CurveFactoryFraxBPMetaPoolUnderlying,
          3,
          2,
          2,
          Action.RemoveLiquidity
        ),
      ],
      // USDC ==(UniV3)==> WETH
      WETH: [
        encodePoolHintV2(
          ADDRESS.CURVE_alUSDFRAXBP_POOL,
          PoolType.CurveFactoryFraxBPMetaPoolUnderlying,
          3,
          2,
          2,
          Action.RemoveLiquidity
        ),
        encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 0, 1, Action.Swap),
      ],
    },
  },
  tusdfraxbp: {
    token: "CURVE_TUSDFRAXBP",
    composition: "TUSD+FRAXBP",
    convexCurveID: 108,
    rewarder: "0x4a744870fD705971c8c00aC510eAc2206C93d5bb",
    rewards: [ADDRESS.CRV, ADDRESS.CVX],
    deposit: {
      TUSD: [
        encodePoolHintV2(ADDRESS.CURVE_TUSDFRAXBP_POOL, PoolType.CurveFactoryMetaPool, 2, 0, 0, Action.AddLiquidity),
      ],
      crvFRAX: [
        encodePoolHintV2(ADDRESS.CURVE_TUSDFRAXBP_POOL, PoolType.CurveFactoryMetaPool, 2, 1, 1, Action.AddLiquidity),
      ],
      FRAX: [
        encodePoolHintV2(
          ADDRESS.CURVE_TUSDFRAXBP_POOL,
          PoolType.CurveFactoryFraxBPMetaPoolUnderlying,
          3,
          1,
          1,
          Action.AddLiquidity
        ),
      ],
      USDC: [
        encodePoolHintV2(
          ADDRESS.CURVE_TUSDFRAXBP_POOL,
          PoolType.CurveFactoryFraxBPMetaPoolUnderlying,
          3,
          2,
          2,
          Action.AddLiquidity
        ),
      ],
      // WETH ==(UniV3)==> USDC
      WETH: [
        encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 1, 0, Action.Swap),
        encodePoolHintV2(
          ADDRESS.CURVE_TUSDFRAXBP_POOL,
          PoolType.CurveFactoryFraxBPMetaPoolUnderlying,
          3,
          2,
          2,
          Action.AddLiquidity
        ),
      ],
    },
    withdraw: {
      TUSD: [
        encodePoolHintV2(ADDRESS.CURVE_TUSDFRAXBP_POOL, PoolType.CurveFactoryMetaPool, 2, 0, 0, Action.RemoveLiquidity),
      ],
      crvFRAX: [
        encodePoolHintV2(ADDRESS.CURVE_TUSDFRAXBP_POOL, PoolType.CurveFactoryMetaPool, 2, 1, 1, Action.RemoveLiquidity),
      ],
      FRAX: [
        encodePoolHintV2(
          ADDRESS.CURVE_TUSDFRAXBP_POOL,
          PoolType.CurveFactoryFraxBPMetaPoolUnderlying,
          3,
          1,
          1,
          Action.RemoveLiquidity
        ),
      ],
      USDC: [
        encodePoolHintV2(
          ADDRESS.CURVE_TUSDFRAXBP_POOL,
          PoolType.CurveFactoryFraxBPMetaPoolUnderlying,
          3,
          2,
          2,
          Action.RemoveLiquidity
        ),
      ],
      // USDC ==(UniV3)==> WETH
      WETH: [
        encodePoolHintV2(
          ADDRESS.CURVE_TUSDFRAXBP_POOL,
          PoolType.CurveFactoryFraxBPMetaPoolUnderlying,
          3,
          2,
          2,
          Action.RemoveLiquidity
        ),
        encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 0, 1, Action.Swap),
      ],
    },
  },
  lusdfraxbp: {
    token: "CURVE_LUSDFRAXBP",
    composition: "LUSD+FRAXBP",
    convexCurveID: 102,
    rewarder: "0x053e1dad223A206e6BCa24C77786bb69a10e427d",
    rewards: [ADDRESS.CRV, ADDRESS.CVX],
    deposit: {
      LUSD: [
        encodePoolHintV2(ADDRESS.CURVE_LUSDFRAXBP_POOL, PoolType.CurveFactoryMetaPool, 2, 0, 0, Action.AddLiquidity),
      ],
      crvFRAX: [
        encodePoolHintV2(ADDRESS.CURVE_LUSDFRAXBP_POOL, PoolType.CurveFactoryMetaPool, 2, 1, 1, Action.AddLiquidity),
      ],
      FRAX: [
        encodePoolHintV2(
          ADDRESS.CURVE_LUSDFRAXBP_POOL,
          PoolType.CurveFactoryFraxBPMetaPoolUnderlying,
          3,
          1,
          1,
          Action.AddLiquidity
        ),
      ],
      USDC: [
        encodePoolHintV2(
          ADDRESS.CURVE_LUSDFRAXBP_POOL,
          PoolType.CurveFactoryFraxBPMetaPoolUnderlying,
          3,
          2,
          2,
          Action.AddLiquidity
        ),
      ],
      // WETH ==(UniV3)==> USDC
      WETH: [
        encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 1, 0, Action.Swap),
        encodePoolHintV2(
          ADDRESS.CURVE_LUSDFRAXBP_POOL,
          PoolType.CurveFactoryFraxBPMetaPoolUnderlying,
          3,
          2,
          2,
          Action.AddLiquidity
        ),
      ],
    },
    withdraw: {
      LUSD: [
        encodePoolHintV2(ADDRESS.CURVE_LUSDFRAXBP_POOL, PoolType.CurveFactoryMetaPool, 2, 0, 0, Action.RemoveLiquidity),
      ],
      crvFRAX: [
        encodePoolHintV2(ADDRESS.CURVE_LUSDFRAXBP_POOL, PoolType.CurveFactoryMetaPool, 2, 1, 1, Action.RemoveLiquidity),
      ],
      FRAX: [
        encodePoolHintV2(
          ADDRESS.CURVE_LUSDFRAXBP_POOL,
          PoolType.CurveFactoryFraxBPMetaPoolUnderlying,
          3,
          1,
          1,
          Action.RemoveLiquidity
        ),
      ],
      USDC: [
        encodePoolHintV2(
          ADDRESS.CURVE_LUSDFRAXBP_POOL,
          PoolType.CurveFactoryFraxBPMetaPoolUnderlying,
          3,
          2,
          2,
          Action.RemoveLiquidity
        ),
      ],
      // USDC ==(UniV3)==> WETH
      WETH: [
        encodePoolHintV2(
          ADDRESS.CURVE_LUSDFRAXBP_POOL,
          PoolType.CurveFactoryFraxBPMetaPoolUnderlying,
          3,
          2,
          2,
          Action.RemoveLiquidity
        ),
        encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 0, 1, Action.Swap),
      ],
    },
  },
  peth: {
    token: "CURVE_pETH",
    composition: "ETH+pETH",
    convexCurveID: 122,
    rewarder: "0xb235205E1096E0Ad221Fb7621a2E2cbaB875bE75",
    rewards: [ADDRESS.CRV, ADDRESS.CVX, ADDRESS.JPEG],
    deposit: {
      WETH: [encodePoolHintV2(ADDRESS.CURVE_pETH_POOL, PoolType.CurveETHPool, 2, 0, 0, Action.AddLiquidity)],
      pETH: [encodePoolHintV2(ADDRESS.CURVE_pETH_POOL, PoolType.CurveETHPool, 2, 1, 1, Action.AddLiquidity)],
      // USDC ==(UniV3)==> WETH
      USDC: [
        encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 0, 1, Action.Swap),
        encodePoolHintV2(ADDRESS.CURVE_pETH_POOL, PoolType.CurveETHPool, 2, 0, 0, Action.AddLiquidity),
      ],
    },
    withdraw: {
      WETH: [encodePoolHintV2(ADDRESS.CURVE_pETH_POOL, PoolType.CurveETHPool, 2, 0, 0, Action.RemoveLiquidity)],
      pETH: [encodePoolHintV2(ADDRESS.CURVE_pETH_POOL, PoolType.CurveETHPool, 2, 1, 1, Action.RemoveLiquidity)],
      // WETH ==(UniV3)==> USDC
      USDC: [
        encodePoolHintV2(ADDRESS.CURVE_pETH_POOL, PoolType.CurveETHPool, 2, 0, 0, Action.RemoveLiquidity),
        encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 1, 0, Action.Swap),
      ],
    },
  },
  cbeth: {
    token: "CURVE_cbETH",
    composition: "ETH+cbETH",
    convexCurveID: 127,
    rewarder: "0x5d02EcD9B83f1187e92aD5be3d1bd2915CA03699",
    rewards: [ADDRESS.CRV, ADDRESS.CVX],
    deposit: {
      WETH: [encodePoolHintV2(ADDRESS.CURVE_cbETH_POOL, PoolType.CurveCryptoPool, 2, 0, 0, Action.AddLiquidity)],
      cbETH: [encodePoolHintV2(ADDRESS.CURVE_cbETH_POOL, PoolType.CurveCryptoPool, 2, 1, 1, Action.AddLiquidity)],
      // USDC ==(UniV3)==> WETH
      USDC: [
        encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 0, 1, Action.Swap),
        encodePoolHintV2(ADDRESS.CURVE_cbETH_POOL, PoolType.CurveCryptoPool, 2, 0, 0, Action.AddLiquidity),
      ],
    },
    withdraw: {
      WETH: [encodePoolHintV2(ADDRESS.CURVE_cbETH_POOL, PoolType.CurveCryptoPool, 2, 0, 0, Action.RemoveLiquidity)],
      cbETH: [encodePoolHintV2(ADDRESS.CURVE_cbETH_POOL, PoolType.CurveCryptoPool, 2, 1, 1, Action.RemoveLiquidity)],
      // WETH ==(UniV3)==> USDC
      USDC: [
        encodePoolHintV2(ADDRESS.CURVE_cbETH_POOL, PoolType.CurveCryptoPool, 2, 0, 0, Action.RemoveLiquidity),
        encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 1, 0, Action.Swap),
      ],
    },
  },
  frxeth: {
    token: "CURVE_frxETH",
    composition: "ETH+frxETH",
    convexCurveID: 128,
    convexFraxID: 36,
    rewarder: "0xbD5445402B0a287cbC77cb67B2a52e2FC635dce4",
    rewards: [ADDRESS.CRV, ADDRESS.CVX],
    deposit: {
      WETH: [encodePoolHintV2(ADDRESS.CURVE_frxETH_POOL, PoolType.CurveETHPool, 2, 0, 0, Action.AddLiquidity)],
      frxETH: [encodePoolHintV2(ADDRESS.CURVE_frxETH_POOL, PoolType.CurveETHPool, 2, 1, 1, Action.AddLiquidity)],
      // USDC ==(UniV3)==> WETH
      USDC: [
        encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 0, 1, Action.Swap),
        encodePoolHintV2(ADDRESS.CURVE_frxETH_POOL, PoolType.CurveETHPool, 2, 0, 0, Action.AddLiquidity),
      ],
    },
    withdraw: {
      WETH: [encodePoolHintV2(ADDRESS.CURVE_frxETH_POOL, PoolType.CurveETHPool, 2, 0, 0, Action.RemoveLiquidity)],
      frxETH: [encodePoolHintV2(ADDRESS.CURVE_frxETH_POOL, PoolType.CurveETHPool, 2, 1, 1, Action.RemoveLiquidity)],
      // WETH ==(UniV3)==> USDC
      USDC: [
        encodePoolHintV2(ADDRESS.CURVE_frxETH_POOL, PoolType.CurveETHPool, 2, 0, 0, Action.RemoveLiquidity),
        encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 1, 0, Action.Swap),
      ],
    },
  },
  blusd: {
    token: "CURVE_bLUSDLUSD3CRV-f",
    composition: "bLUSD+LUSD3CRV-f",
    convexCurveID: 133,
    rewarder: "0xe5ba5E48114ecF21dF6d0Ba958372ce878592705",
    rewards: [ADDRESS.CRV, ADDRESS.CVX, ADDRESS.LUSD],
    deposit: {
      bLUSD: [
        encodePoolHintV2(ADDRESS["CURVE_bLUSDLUSD3CRV-f_POOL"], PoolType.CurveCryptoPool, 2, 0, 0, Action.AddLiquidity),
      ],
      "LUSD3CRV-f": [
        encodePoolHintV2(ADDRESS["CURVE_bLUSDLUSD3CRV-f_POOL"], PoolType.CurveCryptoPool, 2, 1, 1, Action.AddLiquidity),
      ],
      LUSD: [
        encodePoolHintV2(ADDRESS.CURVE_LUSD3CRV_POOL, PoolType.CurveFactoryMetaPool, 2, 0, 0, Action.AddLiquidity),
        encodePoolHintV2(ADDRESS["CURVE_bLUSDLUSD3CRV-f_POOL"], PoolType.CurveCryptoPool, 2, 1, 1, Action.AddLiquidity),
      ],
      TRICRV: [
        encodePoolHintV2(ADDRESS.CURVE_LUSD3CRV_POOL, PoolType.CurveFactoryMetaPool, 2, 1, 1, Action.AddLiquidity),
        encodePoolHintV2(ADDRESS["CURVE_bLUSDLUSD3CRV-f_POOL"], PoolType.CurveCryptoPool, 2, 1, 1, Action.AddLiquidity),
      ],
      DAI: [
        encodePoolHintV2(
          ADDRESS.CURVE_LUSD3CRV_POOL,
          PoolType.CurveFactoryUSDMetaPoolUnderlying,
          4,
          1,
          1,
          Action.AddLiquidity
        ),
        encodePoolHintV2(ADDRESS["CURVE_bLUSDLUSD3CRV-f_POOL"], PoolType.CurveCryptoPool, 2, 1, 1, Action.AddLiquidity),
      ],
      USDC: [
        encodePoolHintV2(
          ADDRESS.CURVE_LUSD3CRV_POOL,
          PoolType.CurveFactoryUSDMetaPoolUnderlying,
          4,
          2,
          2,
          Action.AddLiquidity
        ),
        encodePoolHintV2(ADDRESS["CURVE_bLUSDLUSD3CRV-f_POOL"], PoolType.CurveCryptoPool, 2, 1, 1, Action.AddLiquidity),
      ],
      USDT: [
        encodePoolHintV2(
          ADDRESS.CURVE_LUSD3CRV_POOL,
          PoolType.CurveFactoryUSDMetaPoolUnderlying,
          4,
          3,
          3,
          Action.AddLiquidity
        ),
        encodePoolHintV2(ADDRESS["CURVE_bLUSDLUSD3CRV-f_POOL"], PoolType.CurveCryptoPool, 2, 1, 1, Action.AddLiquidity),
      ],
      // USDC ==(UniV3)==> WETH
      WETH: [
        encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 1, 0, Action.Swap),
        encodePoolHintV2(
          ADDRESS.CURVE_LUSD3CRV_POOL,
          PoolType.CurveFactoryUSDMetaPoolUnderlying,
          4,
          2,
          2,
          Action.AddLiquidity
        ),
        encodePoolHintV2(ADDRESS["CURVE_bLUSDLUSD3CRV-f_POOL"], PoolType.CurveCryptoPool, 2, 1, 1, Action.AddLiquidity),
      ],
    },
    withdraw: {
      bLUSD: [
        encodePoolHintV2(
          ADDRESS["CURVE_bLUSDLUSD3CRV-f_POOL"],
          PoolType.CurveCryptoPool,
          2,
          0,
          0,
          Action.RemoveLiquidity
        ),
      ],
      "LUSD3CRV-f": [
        encodePoolHintV2(
          ADDRESS["CURVE_bLUSDLUSD3CRV-f_POOL"],
          PoolType.CurveCryptoPool,
          2,
          1,
          1,
          Action.RemoveLiquidity
        ),
      ],
      LUSD: [
        encodePoolHintV2(
          ADDRESS["CURVE_bLUSDLUSD3CRV-f_POOL"],
          PoolType.CurveCryptoPool,
          2,
          1,
          1,
          Action.RemoveLiquidity
        ),
        encodePoolHintV2(ADDRESS.CURVE_LUSD3CRV_POOL, PoolType.CurveFactoryMetaPool, 2, 0, 0, Action.RemoveLiquidity),
      ],
      TRICRV: [
        encodePoolHintV2(
          ADDRESS["CURVE_bLUSDLUSD3CRV-f_POOL"],
          PoolType.CurveCryptoPool,
          2,
          1,
          1,
          Action.RemoveLiquidity
        ),
        encodePoolHintV2(ADDRESS.CURVE_LUSD3CRV_POOL, PoolType.CurveFactoryMetaPool, 2, 1, 1, Action.RemoveLiquidity),
      ],
      DAI: [
        encodePoolHintV2(
          ADDRESS["CURVE_bLUSDLUSD3CRV-f_POOL"],
          PoolType.CurveCryptoPool,
          2,
          1,
          1,
          Action.RemoveLiquidity
        ),
        encodePoolHintV2(
          ADDRESS.CURVE_LUSD3CRV_POOL,
          PoolType.CurveFactoryUSDMetaPoolUnderlying,
          4,
          1,
          1,
          Action.RemoveLiquidity
        ),
      ],
      USDC: [
        encodePoolHintV2(
          ADDRESS["CURVE_bLUSDLUSD3CRV-f_POOL"],
          PoolType.CurveCryptoPool,
          2,
          1,
          1,
          Action.RemoveLiquidity
        ),
        encodePoolHintV2(
          ADDRESS.CURVE_LUSD3CRV_POOL,
          PoolType.CurveFactoryUSDMetaPoolUnderlying,
          4,
          2,
          2,
          Action.RemoveLiquidity
        ),
      ],
      USDT: [
        encodePoolHintV2(
          ADDRESS["CURVE_bLUSDLUSD3CRV-f_POOL"],
          PoolType.CurveCryptoPool,
          2,
          1,
          1,
          Action.RemoveLiquidity
        ),
        encodePoolHintV2(
          ADDRESS.CURVE_LUSD3CRV_POOL,
          PoolType.CurveFactoryUSDMetaPoolUnderlying,
          4,
          3,
          3,
          Action.RemoveLiquidity
        ),
      ],
      // USDC ==(UniV3)==> WETH
      WETH: [
        encodePoolHintV2(
          ADDRESS["CURVE_bLUSDLUSD3CRV-f_POOL"],
          PoolType.CurveCryptoPool,
          2,
          1,
          1,
          Action.RemoveLiquidity
        ),
        encodePoolHintV2(
          ADDRESS.CURVE_LUSD3CRV_POOL,
          PoolType.CurveFactoryUSDMetaPoolUnderlying,
          4,
          2,
          2,
          Action.RemoveLiquidity
        ),
        encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 0, 1, Action.Swap),
      ],
    },
  },
  sbtc2: {
    token: "CURVE_sBTC2",
    composition: "WBTC+sBTC",
    convexCurveID: 135,
    rewarder: "0x2a7b6a16Cf7Be51968b69768c3feCaA7E27524A5",
    rewards: [ADDRESS.CVX, ADDRESS.CRV],
    deposit: {
      WBTC: [encodePoolHintV2(ADDRESS.CURVE_sBTC2_POOL, PoolType.CurveBasePool, 2, 0, 0, Action.AddLiquidity)],
      sBTC: [encodePoolHintV2(ADDRESS.CURVE_sBTC2_POOL, PoolType.CurveBasePool, 2, 1, 1, Action.AddLiquidity)],
      // WETH ==(CurveV2)==> WBTC
      WETH: [
        encodePoolHintV2(ADDRESS.CURVE_TRICRYPTO_POOL, PoolType.CurveTriCryptoPool, 3, 2, 1, Action.Swap),
        encodePoolHintV2(ADDRESS.CURVE_sBTC2_POOL, PoolType.CurveBasePool, 2, 0, 0, Action.AddLiquidity),
      ],
      // USDC ==(UniV3)==> WETH ==(CurveV2)==> WBTC
      USDC: [
        encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 0, 1, Action.Swap),
        encodePoolHintV2(ADDRESS.CURVE_TRICRYPTO_POOL, PoolType.CurveTriCryptoPool, 3, 2, 1, Action.Swap),
        encodePoolHintV2(ADDRESS.CURVE_sBTC2_POOL, PoolType.CurveBasePool, 2, 0, 0, Action.AddLiquidity),
      ],
    },
    withdraw: {
      WBTC: [encodePoolHintV2(ADDRESS.CURVE_sBTC2_POOL, PoolType.CurveBasePool, 2, 0, 0, Action.RemoveLiquidity)],
      sBTC: [encodePoolHintV2(ADDRESS.CURVE_sBTC2_POOL, PoolType.CurveBasePool, 2, 1, 1, Action.RemoveLiquidity)],
      // WBTC ==(CurveV2)==> WETH
      WETH: [
        encodePoolHintV2(ADDRESS.CURVE_sBTC2_POOL, PoolType.CurveBasePool, 2, 0, 0, Action.RemoveLiquidity),
        encodePoolHintV2(ADDRESS.CURVE_TRICRYPTO_POOL, PoolType.CurveTriCryptoPool, 3, 1, 2, Action.Swap),
      ],
      // WBTC ==(CurveV2)==> WETH ==(UniV3)==> USDC
      USDC: [
        encodePoolHintV2(ADDRESS.CURVE_sBTC2_POOL, PoolType.CurveBasePool, 2, 0, 0, Action.RemoveLiquidity),
        encodePoolHintV2(ADDRESS.CURVE_TRICRYPTO_POOL, PoolType.CurveTriCryptoPool, 3, 1, 2, Action.Swap),
        encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 1, 0, Action.Swap),
      ],
    },
  },
  multibtc: {
    token: "CURVE_multiBTC/crvWSBTC",
    composition: "multiBTC+crvWSBTC",
    convexCurveID: 137,
    rewarder: "0x41EAB7eB43b7b055B2Bf508cAcE932b11003029f",
    rewards: [ADDRESS.CVX, ADDRESS.CRV],
    deposit: {
      multiBTC: [
        encodePoolHintV2(
          ADDRESS["CURVE_multiBTC/crvWSBTC_POOL"],
          PoolType.CurveFactoryMetaPool,
          2,
          0,
          0,
          Action.AddLiquidity
        ),
      ],
      crvWSBTC: [
        encodePoolHintV2(
          ADDRESS["CURVE_multiBTC/crvWSBTC_POOL"],
          PoolType.CurveFactoryMetaPool,
          2,
          1,
          1,
          Action.AddLiquidity
        ),
      ],
      // WBTC ==(Curve)==> crvWSBTC
      WBTC: [
        encodePoolHintV2(ADDRESS.CURVE_sBTC2_POOL, PoolType.CurveBasePool, 2, 0, 0, Action.AddLiquidity),
        encodePoolHintV2(
          ADDRESS["CURVE_multiBTC/crvWSBTC_POOL"],
          PoolType.CurveFactoryMetaPool,
          2,
          1,
          1,
          Action.AddLiquidity
        ),
      ],
      // sBTC ==(Curve)==> crvWSBTC
      sBTC: [
        encodePoolHintV2(ADDRESS.CURVE_sBTC2_POOL, PoolType.CurveBasePool, 2, 1, 1, Action.AddLiquidity),
        encodePoolHintV2(
          ADDRESS["CURVE_multiBTC/crvWSBTC_POOL"],
          PoolType.CurveFactoryMetaPool,
          2,
          1,
          1,
          Action.AddLiquidity
        ),
      ],
      // WETH ==(CurveV2)==> WBTC ==(Curve)==> crvWSBTC
      WETH: [
        encodePoolHintV2(ADDRESS.CURVE_TRICRYPTO_POOL, PoolType.CurveTriCryptoPool, 3, 2, 1, Action.Swap),
        encodePoolHintV2(ADDRESS.CURVE_sBTC2_POOL, PoolType.CurveBasePool, 2, 0, 0, Action.AddLiquidity),
        encodePoolHintV2(
          ADDRESS["CURVE_multiBTC/crvWSBTC_POOL"],
          PoolType.CurveFactoryMetaPool,
          2,
          1,
          1,
          Action.AddLiquidity
        ),
      ],
      // USDC ==(UniV3)==> WETH ==(CurveV2)==> WBTC ==(Curve)==> crvWSBTC
      USDC: [
        encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 0, 1, Action.Swap),
        encodePoolHintV2(ADDRESS.CURVE_TRICRYPTO_POOL, PoolType.CurveTriCryptoPool, 3, 2, 1, Action.Swap),
        encodePoolHintV2(ADDRESS.CURVE_sBTC2_POOL, PoolType.CurveBasePool, 2, 0, 0, Action.AddLiquidity),
        encodePoolHintV2(
          ADDRESS["CURVE_multiBTC/crvWSBTC_POOL"],
          PoolType.CurveFactoryMetaPool,
          2,
          1,
          1,
          Action.AddLiquidity
        ),
      ],
    },
    withdraw: {
      multiBTC: [
        encodePoolHintV2(
          ADDRESS["CURVE_multiBTC/crvWSBTC_POOL"],
          PoolType.CurveFactoryMetaPool,
          2,
          0,
          0,
          Action.RemoveLiquidity
        ),
      ],
      crvWSBTC: [
        encodePoolHintV2(
          ADDRESS["CURVE_multiBTC/crvWSBTC_POOL"],
          PoolType.CurveFactoryMetaPool,
          2,
          1,
          1,
          Action.RemoveLiquidity
        ),
      ],
      // crvWSBTC ==(Curve)==> WBTC
      WBTC: [
        encodePoolHintV2(
          ADDRESS["CURVE_multiBTC/crvWSBTC_POOL"],
          PoolType.CurveFactoryMetaPool,
          2,
          1,
          1,
          Action.RemoveLiquidity
        ),
        encodePoolHintV2(ADDRESS.CURVE_sBTC2_POOL, PoolType.CurveBasePool, 2, 0, 0, Action.RemoveLiquidity),
      ],
      // crvWSBTC ==(Curve)==> sBTC
      sBTC: [
        encodePoolHintV2(
          ADDRESS["CURVE_multiBTC/crvWSBTC_POOL"],
          PoolType.CurveFactoryMetaPool,
          2,
          1,
          1,
          Action.RemoveLiquidity
        ),
        encodePoolHintV2(ADDRESS.CURVE_sBTC2_POOL, PoolType.CurveBasePool, 2, 1, 1, Action.RemoveLiquidity),
      ],
      // crvWSBTC ==(Curve)==> WBTC ==(CurveV2)==> WETH
      WETH: [
        encodePoolHintV2(
          ADDRESS["CURVE_multiBTC/crvWSBTC_POOL"],
          PoolType.CurveFactoryMetaPool,
          2,
          1,
          1,
          Action.RemoveLiquidity
        ),
        encodePoolHintV2(ADDRESS.CURVE_sBTC2_POOL, PoolType.CurveBasePool, 2, 0, 0, Action.RemoveLiquidity),
        encodePoolHintV2(ADDRESS.CURVE_TRICRYPTO_POOL, PoolType.CurveTriCryptoPool, 3, 1, 2, Action.Swap),
      ],
      // crvWSBTC ==(Curve)==> WBTC ==(CurveV2)==> WETH ==(UniV3)==> USDC
      USDC: [
        encodePoolHintV2(
          ADDRESS["CURVE_multiBTC/crvWSBTC_POOL"],
          PoolType.CurveFactoryMetaPool,
          2,
          1,
          1,
          Action.RemoveLiquidity
        ),
        encodePoolHintV2(ADDRESS.CURVE_sBTC2_POOL, PoolType.CurveBasePool, 2, 0, 0, Action.RemoveLiquidity),
        encodePoolHintV2(ADDRESS.CURVE_TRICRYPTO_POOL, PoolType.CurveTriCryptoPool, 3, 1, 2, Action.Swap),
        encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 1, 0, Action.Swap),
      ],
    },
  },
  clevcvx: {
    token: "CURVE_CVX/clevCVX",
    composition: "CVX+clevCVX",
    convexCurveID: 139,
    rewarder: "0x706f34D0aB8f4f9838F15b0D155C8Ef42229294B",
    rewards: [ADDRESS.CRV, ADDRESS.CVX],
    deposit: {
      CVX: [
        encodePoolHintV2(
          ADDRESS["CURVE_CVX/clevCVX_POOL"],
          PoolType.CurveFactoryPlainPool,
          2,
          0,
          0,
          Action.AddLiquidity
        ),
      ],
      clevCVX: [
        encodePoolHintV2(
          ADDRESS["CURVE_CVX/clevCVX_POOL"],
          PoolType.CurveFactoryPlainPool,
          2,
          1,
          1,
          Action.AddLiquidity
        ),
      ],
    },
    withdraw: {
      CVX: [
        encodePoolHintV2(
          ADDRESS["CURVE_CVX/clevCVX_POOL"],
          PoolType.CurveFactoryPlainPool,
          2,
          0,
          0,
          Action.RemoveLiquidity
        ),
      ],
      clevCVX: [
        encodePoolHintV2(
          ADDRESS["CURVE_CVX/clevCVX_POOL"],
          PoolType.CurveFactoryPlainPool,
          2,
          1,
          1,
          Action.RemoveLiquidity
        ),
      ],
    },
  },
  clevusd: {
    token: "CURVE_clevUSD/FRAXBP",
    composition: "clevUSD+FRAXBP",
    convexCurveID: 140,
    rewarder: "0x710e85B2793b3AE88Cb1Da3cb25b3d62D810d180",
    rewards: [ADDRESS.CRV, ADDRESS.CVX],
    deposit: {
      clevUSD: [
        encodePoolHintV2(
          ADDRESS["CURVE_clevUSD/FRAXBP_POOL"],
          PoolType.CurveFactoryMetaPool,
          2,
          0,
          0,
          Action.AddLiquidity
        ),
      ],
      crvFRAX: [
        encodePoolHintV2(
          ADDRESS["CURVE_clevUSD/FRAXBP_POOL"],
          PoolType.CurveFactoryMetaPool,
          2,
          1,
          1,
          Action.AddLiquidity
        ),
      ],
      FRAX: [
        encodePoolHintV2(ADDRESS.CURVE_FRAXUSDC_POOL, PoolType.CurveBasePool, 2, 0, 0, Action.AddLiquidity),
        encodePoolHintV2(
          ADDRESS["CURVE_clevUSD/FRAXBP_POOL"],
          PoolType.CurveFactoryMetaPool,
          2,
          1,
          1,
          Action.AddLiquidity
        ),
      ],
      USDC: [
        encodePoolHintV2(ADDRESS.CURVE_FRAXUSDC_POOL, PoolType.CurveBasePool, 2, 1, 1, Action.AddLiquidity),
        encodePoolHintV2(
          ADDRESS["CURVE_clevUSD/FRAXBP_POOL"],
          PoolType.CurveFactoryMetaPool,
          2,
          1,
          1,
          Action.AddLiquidity
        ),
      ],
      // WETH ==(UniV3)==> USDC
      WETH: [
        encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 1, 0, Action.Swap),
        encodePoolHintV2(ADDRESS.CURVE_FRAXUSDC_POOL, PoolType.CurveBasePool, 2, 1, 1, Action.AddLiquidity),
        encodePoolHintV2(
          ADDRESS["CURVE_clevUSD/FRAXBP_POOL"],
          PoolType.CurveFactoryMetaPool,
          2,
          1,
          1,
          Action.AddLiquidity
        ),
      ],
    },
    withdraw: {
      clevUSD: [
        encodePoolHintV2(
          ADDRESS["CURVE_clevUSD/FRAXBP_POOL"],
          PoolType.CurveFactoryMetaPool,
          2,
          0,
          0,
          Action.RemoveLiquidity
        ),
      ],
      crvFRAX: [
        encodePoolHintV2(
          ADDRESS["CURVE_clevUSD/FRAXBP_POOL"],
          PoolType.CurveFactoryMetaPool,
          2,
          1,
          1,
          Action.RemoveLiquidity
        ),
      ],
      FRAX: [
        encodePoolHintV2(
          ADDRESS["CURVE_clevUSD/FRAXBP_POOL"],
          PoolType.CurveFactoryMetaPool,
          2,
          1,
          1,
          Action.RemoveLiquidity
        ),
        encodePoolHintV2(ADDRESS.CURVE_FRAXUSDC_POOL, PoolType.CurveBasePool, 2, 0, 0, Action.RemoveLiquidity),
      ],
      USDC: [
        encodePoolHintV2(
          ADDRESS["CURVE_clevUSD/FRAXBP_POOL"],
          PoolType.CurveFactoryMetaPool,
          2,
          1,
          1,
          Action.RemoveLiquidity
        ),
        encodePoolHintV2(ADDRESS.CURVE_FRAXUSDC_POOL, PoolType.CurveBasePool, 2, 1, 1, Action.RemoveLiquidity),
      ],
      // USDC ==(UniV3)==> WETH
      WETH: [
        encodePoolHintV2(
          ADDRESS["CURVE_clevUSD/FRAXBP_POOL"],
          PoolType.CurveFactoryMetaPool,
          2,
          1,
          1,
          Action.RemoveLiquidity
        ),
        encodePoolHintV2(ADDRESS.CURVE_FRAXUSDC_POOL, PoolType.CurveBasePool, 2, 1, 1, Action.RemoveLiquidity),
        encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 0, 1, Action.Swap),
      ],
    },
  },
  "ETH/CLEV": {
    token: "CURVE_ETH/CLEV",
    composition: "ETH+CLEV",
    convexCurveID: 142,
    rewarder: "0x6be96D00B50375AF852D63DB7d55656B306f398e",
    rewards: [ADDRESS.CRV, ADDRESS.CVX],
    deposit: {
      WETH: [encodePoolHintV2(ADDRESS["CURVE_ETH/CLEV_POOL"], PoolType.CurveCryptoPool, 2, 0, 0, Action.AddLiquidity)],
      CLEV: [encodePoolHintV2(ADDRESS["CURVE_ETH/CLEV_POOL"], PoolType.CurveCryptoPool, 2, 1, 1, Action.AddLiquidity)],
      USDC: [
        encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 0, 1, Action.Swap),
        encodePoolHintV2(ADDRESS["CURVE_ETH/CLEV_POOL"], PoolType.CurveCryptoPool, 2, 0, 0, Action.AddLiquidity),
      ],
    },
    withdraw: {
      WETH: [
        encodePoolHintV2(ADDRESS["CURVE_ETH/CLEV_POOL"], PoolType.CurveCryptoPool, 2, 0, 0, Action.RemoveLiquidity),
      ],
      CLEV: [
        encodePoolHintV2(ADDRESS["CURVE_ETH/CLEV_POOL"], PoolType.CurveCryptoPool, 2, 1, 1, Action.RemoveLiquidity),
      ],
      USDC: [
        encodePoolHintV2(ADDRESS["CURVE_ETH/CLEV_POOL"], PoolType.CurveCryptoPool, 2, 0, 0, Action.RemoveLiquidity),
        encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 1, 0, Action.Swap),
      ],
    },
  },
  "ETH/rETH": {
    token: "CURVE_ETH/rETH",
    composition: "ETH+rETH",
    convexCurveID: 154,
    rewarder: "0x65C8aa24db76e870DEDfC35701eff84de405D1ba",
    rewards: [ADDRESS.CRV, ADDRESS.CVX],
    deposit: {
      WETH: [encodePoolHintV2(ADDRESS["CURVE_ETH/rETH_POOL"], PoolType.CurveCryptoPool, 2, 0, 0, Action.AddLiquidity)],
      rETH: [encodePoolHintV2(ADDRESS["CURVE_ETH/rETH_POOL"], PoolType.CurveCryptoPool, 2, 1, 1, Action.AddLiquidity)],
      USDC: [
        encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 0, 1, Action.Swap),
        encodePoolHintV2(ADDRESS["CURVE_ETH/rETH_POOL"], PoolType.CurveCryptoPool, 2, 0, 0, Action.AddLiquidity),
      ],
    },
    withdraw: {
      WETH: [
        encodePoolHintV2(ADDRESS["CURVE_ETH/rETH_POOL"], PoolType.CurveCryptoPool, 2, 0, 0, Action.RemoveLiquidity),
      ],
      rETH: [
        encodePoolHintV2(ADDRESS["CURVE_ETH/rETH_POOL"], PoolType.CurveCryptoPool, 2, 1, 1, Action.RemoveLiquidity),
      ],
      USDC: [
        encodePoolHintV2(ADDRESS["CURVE_ETH/rETH_POOL"], PoolType.CurveCryptoPool, 2, 0, 0, Action.RemoveLiquidity),
        encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 1, 0, Action.Swap),
      ],
    },
  },
  "GEAR/ETH": {
    token: "CURVE_GEAR/ETH",
    composition: "GEAR+ETH",
    convexCurveID: 136,
    rewarder: "0x502Cc0d946e79CeA4DaafCf21F374C6bce763067",
    rewards: [ADDRESS.CRV, ADDRESS.CVX, ADDRESS.GEAR],
    deposit: {
      GEAR: [encodePoolHintV2(ADDRESS["CURVE_GEAR/ETH_POOL"], PoolType.CurveCryptoPool, 2, 0, 0, Action.AddLiquidity)],
      WETH: [encodePoolHintV2(ADDRESS["CURVE_GEAR/ETH_POOL"], PoolType.CurveCryptoPool, 2, 1, 1, Action.AddLiquidity)],
      USDC: [
        encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 0, 1, Action.Swap),
        encodePoolHintV2(ADDRESS["CURVE_GEAR/ETH_POOL"], PoolType.CurveCryptoPool, 2, 1, 1, Action.AddLiquidity),
      ],
    },
    withdraw: {
      GEAR: [
        encodePoolHintV2(ADDRESS["CURVE_GEAR/ETH_POOL"], PoolType.CurveCryptoPool, 2, 0, 0, Action.RemoveLiquidity),
      ],
      WETH: [
        encodePoolHintV2(ADDRESS["CURVE_GEAR/ETH_POOL"], PoolType.CurveCryptoPool, 2, 1, 1, Action.RemoveLiquidity),
      ],
      USDC: [
        encodePoolHintV2(ADDRESS["CURVE_GEAR/ETH_POOL"], PoolType.CurveCryptoPool, 2, 1, 1, Action.RemoveLiquidity),
        encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 1, 0, Action.Swap),
      ],
    },
  },
  "WETH/stETH": {
    token: "CURVE_WETH/stETH",
    composition: "WETH+stETH",
    convexCurveID: 155,
    rewarder: "0xA61b57C452dadAF252D2f101f5Ba20aA86152992",
    rewards: [ADDRESS.CRV, ADDRESS.CVX],
    deposit: {
      WETH: [
        encodePoolHintV2(
          ADDRESS["CURVE_WETH/stETH_POOL"],
          PoolType.CurveFactoryPlainPool,
          2,
          0,
          0,
          Action.AddLiquidity
        ),
      ],
      stETH: [
        encodePoolHintV2(
          ADDRESS["CURVE_WETH/stETH_POOL"],
          PoolType.CurveFactoryPlainPool,
          2,
          1,
          1,
          Action.AddLiquidity
        ),
      ],
      USDC: [
        encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 0, 1, Action.Swap),
        encodePoolHintV2(
          ADDRESS["CURVE_WETH/stETH_POOL"],
          PoolType.CurveFactoryPlainPool,
          2,
          0,
          0,
          Action.AddLiquidity
        ),
      ],
    },
    withdraw: {
      WETH: [
        encodePoolHintV2(
          ADDRESS["CURVE_WETH/stETH_POOL"],
          PoolType.CurveFactoryPlainPool,
          2,
          0,
          0,
          Action.RemoveLiquidity
        ),
      ],
      stETH: [
        encodePoolHintV2(
          ADDRESS["CURVE_WETH/stETH_POOL"],
          PoolType.CurveFactoryPlainPool,
          2,
          1,
          1,
          Action.RemoveLiquidity
        ),
      ],
      USDC: [
        encodePoolHintV2(
          ADDRESS["CURVE_WETH/stETH_POOL"],
          PoolType.CurveFactoryPlainPool,
          2,
          0,
          0,
          Action.RemoveLiquidity
        ),
        encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 1, 0, Action.Swap),
      ],
    },
  },
  "STG/USDC": {
    token: "CURVE_STG/USDC",
    composition: "STG+USDC",
    convexCurveID: 95,
    rewarder: "0x17E3Bc273cFcB972167059E55104DBCC8f8431bE",
    rewards: [ADDRESS.CRV, ADDRESS.CVX],
    deposit: {
      STG: [encodePoolHintV2(ADDRESS["CURVE_STG/USDC_POOL"], PoolType.CurveCryptoPool, 2, 0, 0, Action.AddLiquidity)],
      USDC: [encodePoolHintV2(ADDRESS["CURVE_STG/USDC_POOL"], PoolType.CurveCryptoPool, 2, 1, 1, Action.AddLiquidity)],
      WETH: [
        encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 1, 0, Action.Swap),
        encodePoolHintV2(ADDRESS["CURVE_STG/USDC_POOL"], PoolType.CurveCryptoPool, 2, 1, 1, Action.AddLiquidity),
      ],
    },
    withdraw: {
      STG: [
        encodePoolHintV2(ADDRESS["CURVE_STG/USDC_POOL"], PoolType.CurveCryptoPool, 2, 0, 0, Action.RemoveLiquidity),
      ],
      USDC: [
        encodePoolHintV2(ADDRESS["CURVE_STG/USDC_POOL"], PoolType.CurveCryptoPool, 2, 1, 1, Action.RemoveLiquidity),
      ],
      WETH: [
        encodePoolHintV2(ADDRESS["CURVE_STG/USDC_POOL"], PoolType.CurveCryptoPool, 2, 1, 1, Action.RemoveLiquidity),
        encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 0, 1, Action.Swap),
      ],
    },
  },
  "ETH/LDO": {
    token: "CURVE_ETH/LDO",
    composition: "ETH+LDO",
    convexCurveID: 149,
    rewarder: "0x8CA990E954611E5E3d2cc51C013fCC372c8c1D38",
    rewards: [ADDRESS.CRV, ADDRESS.CVX, ADDRESS.LDO],
    deposit: {
      WETH: [encodePoolHintV2(ADDRESS["CURVE_ETH/LDO_POOL"], PoolType.CurveCryptoPool, 2, 0, 0, Action.AddLiquidity)],
      LDO: [encodePoolHintV2(ADDRESS["CURVE_ETH/LDO_POOL"], PoolType.CurveCryptoPool, 2, 1, 1, Action.AddLiquidity)],
      USDC: [
        encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 0, 1, Action.Swap),
        encodePoolHintV2(ADDRESS["CURVE_ETH/LDO_POOL"], PoolType.CurveCryptoPool, 2, 0, 0, Action.AddLiquidity),
      ],
    },
    withdraw: {
      WETH: [
        encodePoolHintV2(ADDRESS["CURVE_ETH/LDO_POOL"], PoolType.CurveCryptoPool, 2, 0, 0, Action.RemoveLiquidity),
      ],
      LDO: [encodePoolHintV2(ADDRESS["CURVE_ETH/LDO_POOL"], PoolType.CurveCryptoPool, 2, 1, 1, Action.RemoveLiquidity)],
      USDC: [
        encodePoolHintV2(ADDRESS["CURVE_ETH/LDO_POOL"], PoolType.CurveCryptoPool, 2, 0, 0, Action.RemoveLiquidity),
        encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 1, 0, Action.Swap),
      ],
    },
  },
  "ETH/MATIC": {
    token: "CURVE_ETH/MATIC",
    composition: "ETH+MATIC",
    convexCurveID: 148,
    rewarder: "0x77C43369E50D68B7B3288EEFa7D7ab1F0F6D66b3",
    rewards: [ADDRESS.CRV, ADDRESS.CVX],
    deposit: {
      WETH: [encodePoolHintV2(ADDRESS["CURVE_ETH/MATIC_POOL"], PoolType.CurveCryptoPool, 2, 0, 0, Action.AddLiquidity)],
      MATIC: [
        encodePoolHintV2(ADDRESS["CURVE_ETH/MATIC_POOL"], PoolType.CurveCryptoPool, 2, 1, 1, Action.AddLiquidity),
      ],
      USDC: [
        encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 0, 1, Action.Swap),
        encodePoolHintV2(ADDRESS["CURVE_ETH/MATIC_POOL"], PoolType.CurveCryptoPool, 2, 0, 0, Action.AddLiquidity),
      ],
    },
    withdraw: {
      WETH: [
        encodePoolHintV2(ADDRESS["CURVE_ETH/MATIC_POOL"], PoolType.CurveCryptoPool, 2, 0, 0, Action.RemoveLiquidity),
      ],
      MATIC: [
        encodePoolHintV2(ADDRESS["CURVE_ETH/MATIC_POOL"], PoolType.CurveCryptoPool, 2, 1, 1, Action.RemoveLiquidity),
      ],
      USDC: [
        encodePoolHintV2(ADDRESS["CURVE_ETH/MATIC_POOL"], PoolType.CurveCryptoPool, 2, 0, 0, Action.RemoveLiquidity),
        encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 1, 0, Action.Swap),
      ],
    },
  },
  "ETH/CNC": {
    token: "CURVE_ETH/CNC",
    composition: "ETH+CNC",
    convexCurveID: 152,
    rewarder: "0x1A3c8B2F89B1C2593fa46C30ADA0b4E3D0133fF8",
    rewards: [ADDRESS.CRV, ADDRESS.CVX, ADDRESS.CNC],
    deposit: {
      WETH: [encodePoolHintV2(ADDRESS["CURVE_ETH/CNC_POOL"], PoolType.CurveCryptoPool, 2, 0, 0, Action.AddLiquidity)],
      CNC: [encodePoolHintV2(ADDRESS["CURVE_ETH/CNC_POOL"], PoolType.CurveCryptoPool, 2, 1, 1, Action.AddLiquidity)],
      USDC: [
        encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 0, 1, Action.Swap),
        encodePoolHintV2(ADDRESS["CURVE_ETH/CNC_POOL"], PoolType.CurveCryptoPool, 2, 0, 0, Action.AddLiquidity),
      ],
    },
    withdraw: {
      WETH: [
        encodePoolHintV2(ADDRESS["CURVE_ETH/CNC_POOL"], PoolType.CurveCryptoPool, 2, 0, 0, Action.RemoveLiquidity),
      ],
      CNC: [encodePoolHintV2(ADDRESS["CURVE_ETH/CNC_POOL"], PoolType.CurveCryptoPool, 2, 1, 1, Action.RemoveLiquidity)],
      USDC: [
        encodePoolHintV2(ADDRESS["CURVE_ETH/CNC_POOL"], PoolType.CurveCryptoPool, 2, 0, 0, Action.RemoveLiquidity),
        encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 1, 0, Action.Swap),
      ],
    },
  },
  "tBTC/crvWSBTC": {
    token: "CURVE_tBTC/crvWSBTC",
    composition: "tBTC+crvWSBTC",
    convexCurveID: 146,
    rewarder: "0xcD491E40849a0E3c2fF84093bbbaAa25C1eF8dE6",
    rewards: [ADDRESS.CVX, ADDRESS.CRV],
    deposit: {
      tBTC: [
        encodePoolHintV2(
          ADDRESS["CURVE_tBTC/crvWSBTC_POOL"],
          PoolType.CurveFactoryMetaPool,
          2,
          0,
          0,
          Action.AddLiquidity
        ),
      ],
      crvWSBTC: [
        encodePoolHintV2(
          ADDRESS["CURVE_tBTC/crvWSBTC_POOL"],
          PoolType.CurveFactoryMetaPool,
          2,
          1,
          1,
          Action.AddLiquidity
        ),
      ],
      // WBTC ==(Curve)==> crvWSBTC
      WBTC: [
        encodePoolHintV2(ADDRESS.CURVE_sBTC2_POOL, PoolType.CurveBasePool, 2, 0, 0, Action.AddLiquidity),
        encodePoolHintV2(
          ADDRESS["CURVE_tBTC/crvWSBTC_POOL"],
          PoolType.CurveFactoryMetaPool,
          2,
          1,
          1,
          Action.AddLiquidity
        ),
      ],
      // sBTC ==(Curve)==> crvWSBTC
      sBTC: [
        encodePoolHintV2(ADDRESS.CURVE_sBTC2_POOL, PoolType.CurveBasePool, 2, 1, 1, Action.AddLiquidity),
        encodePoolHintV2(
          ADDRESS["CURVE_tBTC/crvWSBTC_POOL"],
          PoolType.CurveFactoryMetaPool,
          2,
          1,
          1,
          Action.AddLiquidity
        ),
      ],
      // WETH ==(CurveV2)==> WBTC ==(Curve)==> crvWSBTC
      WETH: [
        encodePoolHintV2(ADDRESS.CURVE_TRICRYPTO_POOL, PoolType.CurveTriCryptoPool, 3, 2, 1, Action.Swap),
        encodePoolHintV2(ADDRESS.CURVE_sBTC2_POOL, PoolType.CurveBasePool, 2, 0, 0, Action.AddLiquidity),
        encodePoolHintV2(
          ADDRESS["CURVE_tBTC/crvWSBTC_POOL"],
          PoolType.CurveFactoryMetaPool,
          2,
          1,
          1,
          Action.AddLiquidity
        ),
      ],
      // USDC ==(UniV3)==> WETH ==(CurveV2)==> WBTC ==(Curve)==> crvWSBTC
      USDC: [
        encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 0, 1, Action.Swap),
        encodePoolHintV2(ADDRESS.CURVE_TRICRYPTO_POOL, PoolType.CurveTriCryptoPool, 3, 2, 1, Action.Swap),
        encodePoolHintV2(ADDRESS.CURVE_sBTC2_POOL, PoolType.CurveBasePool, 2, 0, 0, Action.AddLiquidity),
        encodePoolHintV2(
          ADDRESS["CURVE_tBTC/crvWSBTC_POOL"],
          PoolType.CurveFactoryMetaPool,
          2,
          1,
          1,
          Action.AddLiquidity
        ),
      ],
    },
    withdraw: {
      tBTC: [
        encodePoolHintV2(
          ADDRESS["CURVE_tBTC/crvWSBTC_POOL"],
          PoolType.CurveFactoryMetaPool,
          2,
          0,
          0,
          Action.RemoveLiquidity
        ),
      ],
      crvWSBTC: [
        encodePoolHintV2(
          ADDRESS["CURVE_tBTC/crvWSBTC_POOL"],
          PoolType.CurveFactoryMetaPool,
          2,
          1,
          1,
          Action.RemoveLiquidity
        ),
      ],
      // crvWSBTC ==(Curve)==> WBTC
      WBTC: [
        encodePoolHintV2(
          ADDRESS["CURVE_tBTC/crvWSBTC_POOL"],
          PoolType.CurveFactoryMetaPool,
          2,
          1,
          1,
          Action.RemoveLiquidity
        ),
        encodePoolHintV2(ADDRESS.CURVE_sBTC2_POOL, PoolType.CurveBasePool, 2, 0, 0, Action.RemoveLiquidity),
      ],
      // crvWSBTC ==(Curve)==> sBTC
      sBTC: [
        encodePoolHintV2(
          ADDRESS["CURVE_tBTC/crvWSBTC_POOL"],
          PoolType.CurveFactoryMetaPool,
          2,
          1,
          1,
          Action.RemoveLiquidity
        ),
        encodePoolHintV2(ADDRESS.CURVE_sBTC2_POOL, PoolType.CurveBasePool, 2, 1, 1, Action.RemoveLiquidity),
      ],
      // crvWSBTC ==(Curve)==> WBTC ==(CurveV2)==> WETH
      WETH: [
        encodePoolHintV2(
          ADDRESS["CURVE_tBTC/crvWSBTC_POOL"],
          PoolType.CurveFactoryMetaPool,
          2,
          1,
          1,
          Action.RemoveLiquidity
        ),
        encodePoolHintV2(ADDRESS.CURVE_sBTC2_POOL, PoolType.CurveBasePool, 2, 0, 0, Action.RemoveLiquidity),
        encodePoolHintV2(ADDRESS.CURVE_TRICRYPTO_POOL, PoolType.CurveTriCryptoPool, 3, 1, 2, Action.Swap),
      ],
      // crvWSBTC ==(Curve)==> WBTC ==(CurveV2)==> WETH ==(UniV3)==> USDC
      USDC: [
        encodePoolHintV2(
          ADDRESS["CURVE_tBTC/crvWSBTC_POOL"],
          PoolType.CurveFactoryMetaPool,
          2,
          1,
          1,
          Action.RemoveLiquidity
        ),
        encodePoolHintV2(ADDRESS.CURVE_sBTC2_POOL, PoolType.CurveBasePool, 2, 0, 0, Action.RemoveLiquidity),
        encodePoolHintV2(ADDRESS.CURVE_TRICRYPTO_POOL, PoolType.CurveTriCryptoPool, 3, 1, 2, Action.Swap),
        encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 1, 0, Action.Swap),
      ],
    },
  },
  "ETH/CTR": {
    token: "CURVE_ETH/CTR",
    composition: "ETH+CTR",
    convexCurveID: 147,
    rewarder: "0xE1d8E3625c5C54b9dcbb52c2c8E4264c3A01450c",
    rewards: [ADDRESS.CRV, ADDRESS.CVX],
    deposit: {
      WETH: [encodePoolHintV2(ADDRESS["CURVE_ETH/CTR_POOL"], PoolType.CurveCryptoPool, 2, 0, 0, Action.AddLiquidity)],
      CTR: [encodePoolHintV2(ADDRESS["CURVE_ETH/CTR_POOL"], PoolType.CurveCryptoPool, 2, 1, 1, Action.AddLiquidity)],
      USDC: [
        encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 0, 1, Action.Swap),
        encodePoolHintV2(ADDRESS["CURVE_ETH/CTR_POOL"], PoolType.CurveCryptoPool, 2, 0, 0, Action.AddLiquidity),
      ],
    },
    withdraw: {
      WETH: [
        encodePoolHintV2(ADDRESS["CURVE_ETH/CTR_POOL"], PoolType.CurveCryptoPool, 2, 0, 0, Action.RemoveLiquidity),
      ],
      CTR: [encodePoolHintV2(ADDRESS["CURVE_ETH/CTR_POOL"], PoolType.CurveCryptoPool, 2, 1, 1, Action.RemoveLiquidity)],
      USDC: [
        encodePoolHintV2(ADDRESS["CURVE_ETH/CTR_POOL"], PoolType.CurveCryptoPool, 2, 0, 0, Action.RemoveLiquidity),
        encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 1, 0, Action.Swap),
      ],
    },
  },
  "CRV/sdCRV": {
    token: "CURVE_CRV/sdCRV",
    composition: "CRV+sdCRV",
    convexCurveID: 93,
    rewarder: "0xA7FC7e90c45C2657A9069CA99011894a76eaB82D",
    rewards: [ADDRESS.CRV, ADDRESS.CVX],
    deposit: {
      CRV: [
        encodePoolHintV2(ADDRESS["CURVE_CRV/sdCRV_POOL"], PoolType.CurveFactoryPlainPool, 2, 0, 0, Action.AddLiquidity),
      ],
      sdCRV: [
        encodePoolHintV2(ADDRESS["CURVE_CRV/sdCRV_POOL"], PoolType.CurveFactoryPlainPool, 2, 1, 1, Action.AddLiquidity),
      ],
      WETH: [
        encodePoolHintV2(ADDRESS.CURVE_CRVETH_POOL, PoolType.CurveCryptoPool, 2, 0, 1, Action.Swap),
        encodePoolHintV2(ADDRESS["CURVE_CRV/sdCRV_POOL"], PoolType.CurveFactoryPlainPool, 2, 0, 0, Action.AddLiquidity),
      ],
      USDC: [
        encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 0, 1, Action.Swap),
        encodePoolHintV2(ADDRESS.CURVE_CRVETH_POOL, PoolType.CurveCryptoPool, 2, 0, 1, Action.Swap),
        encodePoolHintV2(ADDRESS["CURVE_CRV/sdCRV_POOL"], PoolType.CurveFactoryPlainPool, 2, 0, 0, Action.AddLiquidity),
      ],
    },
    withdraw: {
      CRV: [
        encodePoolHintV2(
          ADDRESS["CURVE_CRV/sdCRV_POOL"],
          PoolType.CurveFactoryPlainPool,
          2,
          0,
          0,
          Action.RemoveLiquidity
        ),
      ],
      sdCRV: [
        encodePoolHintV2(
          ADDRESS["CURVE_CRV/sdCRV_POOL"],
          PoolType.CurveFactoryPlainPool,
          2,
          1,
          1,
          Action.RemoveLiquidity
        ),
      ],
      WETH: [
        encodePoolHintV2(
          ADDRESS["CURVE_CRV/sdCRV_POOL"],
          PoolType.CurveFactoryPlainPool,
          2,
          0,
          0,
          Action.RemoveLiquidity
        ),
        encodePoolHintV2(ADDRESS.CURVE_CRVETH_POOL, PoolType.CurveCryptoPool, 2, 1, 0, Action.Swap),
      ],
      USDC: [
        encodePoolHintV2(
          ADDRESS["CURVE_CRV/sdCRV_POOL"],
          PoolType.CurveFactoryPlainPool,
          2,
          0,
          0,
          Action.RemoveLiquidity
        ),
        encodePoolHintV2(ADDRESS.CURVE_CRVETH_POOL, PoolType.CurveCryptoPool, 2, 1, 0, Action.Swap),
        encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 1, 0, Action.Swap),
      ],
    },
  },
  "USDP/3CRV": {
    token: "CURVE_USDP/3CRV",
    composition: "USDP+3CRV",
    convexCurveID: 57,
    rewarder: "0x500E169c15961DE8798Edb52e0f88a8662d30EC5",
    rewards: [ADDRESS.CRV, ADDRESS.CVX],
    deposit: {
      USDP: [
        encodePoolHintV2(ADDRESS["CURVE_USDP/3CRV_POOL"], PoolType.CurveFactoryMetaPool, 2, 0, 0, Action.AddLiquidity),
      ],
      TRICRV: [
        encodePoolHintV2(ADDRESS["CURVE_USDP/3CRV_POOL"], PoolType.CurveFactoryMetaPool, 2, 1, 1, Action.AddLiquidity),
      ],
      DAI: [
        encodePoolHintV2(
          ADDRESS["CURVE_USDP/3CRV_POOL"],
          PoolType.CurveFactoryUSDMetaPoolUnderlying,
          4,
          1,
          1,
          Action.AddLiquidity
        ),
      ],
      USDC: [
        encodePoolHintV2(
          ADDRESS["CURVE_USDP/3CRV_POOL"],
          PoolType.CurveFactoryUSDMetaPoolUnderlying,
          4,
          2,
          2,
          Action.AddLiquidity
        ),
      ],
      USDT: [
        encodePoolHintV2(
          ADDRESS["CURVE_USDP/3CRV_POOL"],
          PoolType.CurveFactoryUSDMetaPoolUnderlying,
          4,
          3,
          3,
          Action.AddLiquidity
        ),
      ],
      // WETH ==(UniV3)==> USDC
      WETH: [
        encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 1, 0, Action.Swap),
        encodePoolHintV2(
          ADDRESS["CURVE_USDP/3CRV_POOL"],
          PoolType.CurveFactoryUSDMetaPoolUnderlying,
          4,
          2,
          2,
          Action.AddLiquidity
        ),
      ],
    },
    withdraw: {
      USDP: [
        encodePoolHintV2(
          ADDRESS["CURVE_USDP/3CRV_POOL"],
          PoolType.CurveFactoryMetaPool,
          2,
          0,
          0,
          Action.RemoveLiquidity
        ),
      ],
      TRICRV: [
        encodePoolHintV2(
          ADDRESS["CURVE_USDP/3CRV_POOL"],
          PoolType.CurveFactoryMetaPool,
          2,
          1,
          1,
          Action.RemoveLiquidity
        ),
      ],
      DAI: [
        encodePoolHintV2(
          ADDRESS["CURVE_USDP/3CRV_POOL"],
          PoolType.CurveFactoryUSDMetaPoolUnderlying,
          4,
          1,
          1,
          Action.RemoveLiquidity
        ),
      ],
      USDC: [
        encodePoolHintV2(
          ADDRESS["CURVE_USDP/3CRV_POOL"],
          PoolType.CurveFactoryUSDMetaPoolUnderlying,
          4,
          2,
          2,
          Action.RemoveLiquidity
        ),
      ],
      USDT: [
        encodePoolHintV2(
          ADDRESS["CURVE_USDP/3CRV_POOL"],
          PoolType.CurveFactoryUSDMetaPoolUnderlying,
          4,
          3,
          3,
          Action.RemoveLiquidity
        ),
      ],
      // USDC ==(UniV3)==> WETH
      WETH: [
        encodePoolHintV2(
          ADDRESS["CURVE_USDP/3CRV_POOL"],
          PoolType.CurveFactoryUSDMetaPoolUnderlying,
          4,
          2,
          2,
          Action.RemoveLiquidity
        ),
        encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 0, 1, Action.Swap),
      ],
    },
  },
  "CRV/cvxCRV": {
    token: "CURVE_CRV/cvxCRV",
    composition: "CRV+cvxCRV",
    convexCurveID: 157,
    rewarder: "0x39D78f11b246ea4A1f68573c3A5B64E83Cff2cAe",
    rewards: [ADDRESS.CRV, ADDRESS.CVX],
    deposit: {
      CRV: [
        encodePoolHintV2(
          ADDRESS["CURVE_CRV/cvxCRV_POOL"],
          PoolType.CurveFactoryPlainPool,
          2,
          0,
          0,
          Action.AddLiquidity
        ),
      ],
      cvxCRV: [
        encodePoolHintV2(
          ADDRESS["CURVE_CRV/cvxCRV_POOL"],
          PoolType.CurveFactoryPlainPool,
          2,
          1,
          1,
          Action.AddLiquidity
        ),
      ],
      "cvxcrv-f": [
        encodePoolHintV2(ADDRESS.CURVE_CVXCRV_POOL, PoolType.CurveFactoryPlainPool, 2, 1, 1, Action.RemoveLiquidity),
        encodePoolHintV2(
          ADDRESS["CURVE_CRV/cvxCRV_POOL"],
          PoolType.CurveFactoryPlainPool,
          2,
          1,
          1,
          Action.AddLiquidity
        ),
      ],
      // WETH ==(CurveV2)==> CRV
      WETH: [
        encodePoolHintV2(ADDRESS.CURVE_CRVETH_POOL, PoolType.CurveCryptoPool, 2, 0, 1, Action.Swap),
        encodePoolHintV2(
          ADDRESS["CURVE_CRV/cvxCRV_POOL"],
          PoolType.CurveFactoryPlainPool,
          2,
          0,
          0,
          Action.AddLiquidity
        ),
      ],
      // USDC ==(UniV3)==> WETH ==(CurveV2)==> CRV
      USDC: [
        encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 0, 1, Action.Swap),
        encodePoolHintV2(ADDRESS.CURVE_CRVETH_POOL, PoolType.CurveCryptoPool, 2, 0, 1, Action.Swap),
        encodePoolHintV2(
          ADDRESS["CURVE_CRV/cvxCRV_POOL"],
          PoolType.CurveFactoryPlainPool,
          2,
          0,
          0,
          Action.AddLiquidity
        ),
      ],
    },
    withdraw: {
      CRV: [
        encodePoolHintV2(
          ADDRESS["CURVE_CRV/cvxCRV_POOL"],
          PoolType.CurveFactoryPlainPool,
          2,
          0,
          0,
          Action.RemoveLiquidity
        ),
      ],
      cvxCRV: [
        encodePoolHintV2(
          ADDRESS["CURVE_CRV/cvxCRV_POOL"],
          PoolType.CurveFactoryPlainPool,
          2,
          1,
          1,
          Action.RemoveLiquidity
        ),
      ],
      // CRV ==(CurveV2)==> WETH
      WETH: [
        encodePoolHintV2(
          ADDRESS["CURVE_CRV/cvxCRV_POOL"],
          PoolType.CurveFactoryPlainPool,
          2,
          0,
          0,
          Action.RemoveLiquidity
        ),
        encodePoolHintV2(ADDRESS.CURVE_CRVETH_POOL, PoolType.CurveCryptoPool, 2, 1, 0, Action.Swap),
      ],
      // CRV ==(CurveV2)==> WETH ==(UniV3)==> USDC
      USDC: [
        encodePoolHintV2(
          ADDRESS["CURVE_CRV/cvxCRV_POOL"],
          PoolType.CurveFactoryPlainPool,
          2,
          0,
          0,
          Action.RemoveLiquidity
        ),
        encodePoolHintV2(ADDRESS.CURVE_CRVETH_POOL, PoolType.CurveCryptoPool, 2, 1, 0, Action.Swap),
        encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 1, 0, Action.Swap),
      ],
      "cvxcrv-f": [
        encodePoolHintV2(
          ADDRESS["CURVE_CRV/cvxCRV_POOL"],
          PoolType.CurveFactoryPlainPool,
          2,
          1,
          1,
          Action.RemoveLiquidity
        ),
        encodePoolHintV2(ADDRESS.CURVE_CVXCRV_POOL, PoolType.CurveFactoryPlainPool, 2, 1, 1, Action.AddLiquidity),
      ],
    },
  },
  "FPIS/cvxFPIS": {
    token: "CURVE_FPIS/cvxFPIS",
    composition: "FPIS+cvxFPIS",
    convexCurveID: 159,
    rewarder: "0x929c7Ac52ef6D2bB03b9d6c2131BE94E2a1cf5e3",
    rewards: [ADDRESS.CRV, ADDRESS.CVX],
    deposit: {
      FPIS: [
        encodePoolHintV2(
          ADDRESS["CURVE_FPIS/cvxFPIS_POOL"],
          PoolType.CurveFactoryPlainPool,
          2,
          0,
          0,
          Action.AddLiquidity
        ),
      ],
      cvxFPIS: [
        encodePoolHintV2(
          ADDRESS["CURVE_FPIS/cvxFPIS_POOL"],
          PoolType.CurveFactoryPlainPool,
          2,
          1,
          1,
          Action.AddLiquidity
        ),
      ],
    },
    withdraw: {
      FPIS: [
        encodePoolHintV2(
          ADDRESS["CURVE_FPIS/cvxFPIS_POOL"],
          PoolType.CurveFactoryPlainPool,
          2,
          0,
          0,
          Action.RemoveLiquidity
        ),
      ],
      cvxFPIS: [
        encodePoolHintV2(
          ADDRESS["CURVE_FPIS/cvxFPIS_POOL"],
          PoolType.CurveFactoryPlainPool,
          2,
          1,
          1,
          Action.RemoveLiquidity
        ),
      ],
    },
  },
  "eCFX/ETH": {
    token: "CURVE_eCFX/ETH",
    composition: "eCFX+ETH",
    convexCurveID: 160,
    rewarder: "0x4F9a0f637B33B0D35135cda5782797617afef00e",
    rewards: [ADDRESS.CRV, ADDRESS.CVX],
    deposit: {
      eCFX: [encodePoolHintV2(ADDRESS["CURVE_eCFX/ETH_POOL"], PoolType.CurveCryptoPool, 2, 0, 0, Action.AddLiquidity)],
      WETH: [encodePoolHintV2(ADDRESS["CURVE_eCFX/ETH_POOL"], PoolType.CurveCryptoPool, 2, 1, 1, Action.AddLiquidity)],
      USDC: [
        encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 0, 1, Action.Swap),
        encodePoolHintV2(ADDRESS["CURVE_eCFX/ETH_POOL"], PoolType.CurveCryptoPool, 2, 1, 1, Action.AddLiquidity),
      ],
    },
    withdraw: {
      eCFX: [
        encodePoolHintV2(ADDRESS["CURVE_eCFX/ETH_POOL"], PoolType.CurveCryptoPool, 2, 0, 0, Action.RemoveLiquidity),
      ],
      WETH: [
        encodePoolHintV2(ADDRESS["CURVE_eCFX/ETH_POOL"], PoolType.CurveCryptoPool, 2, 1, 1, Action.RemoveLiquidity),
      ],
      USDC: [
        encodePoolHintV2(ADDRESS["CURVE_eCFX/ETH_POOL"], PoolType.CurveCryptoPool, 2, 1, 1, Action.RemoveLiquidity),
        encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 1, 0, Action.Swap),
      ],
    },
  },
};

export const DEPLOYED_VAULTS: {
  [compounder: string]: {
    name: string;
    strategy: string;
    fees: {
      withdraw: number;
      harvest: number;
      platform: number;
    };
  }[];
} = {
  LegacyACRV: [
    { name: "steth", strategy: "ConvexCurve", fees: { withdraw: 0, harvest: 1e7, platform: 10e7 } }, // 0
    { name: "frax", strategy: "ConvexCurve", fees: { withdraw: 0, harvest: 1e7, platform: 10e7 } }, // 1
    { name: "tricrypto2", strategy: "ConvexCurve", fees: { withdraw: 0.1e7, harvest: 1e7, platform: 10e7 } }, // 2
    { name: "cvxcrv", strategy: "ConvexCurve", fees: { withdraw: 0, harvest: 1e7, platform: 10e7 } }, // 3
    { name: "crveth", strategy: "ConvexCurve", fees: { withdraw: 0, harvest: 1e7, platform: 10e7 } }, // 4
    { name: "cvxeth", strategy: "ConvexCurve", fees: { withdraw: 0, harvest: 1e7, platform: 10e7 } }, // 5
    { name: "cvxfxs", strategy: "ConvexCurve", fees: { withdraw: 0, harvest: 1e7, platform: 10e7 } }, // 6
    { name: "3pool", strategy: "ConvexCurve", fees: { withdraw: 0, harvest: 1e7, platform: 10e7 } }, // 7
    { name: "ust-wormhole", strategy: "ConvexCurve", fees: { withdraw: 0, harvest: 1e7, platform: 10e7 } }, // 8
    { name: "rocket-pool-eth", strategy: "ConvexCurve", fees: { withdraw: 0, harvest: 10e7, platform: 10e7 } }, // 9
    { name: "ren", strategy: "ConvexCurve", fees: { withdraw: 0, harvest: 1e7, platform: 10e7 } }, // 10
    { name: "pusd", strategy: "ConvexCurve", fees: { withdraw: 0, harvest: 1e7, platform: 10e7 } }, // 11
    { name: "susd", strategy: "ConvexCurve", fees: { withdraw: 0, harvest: 1e7, platform: 10e7 } }, // 12
    { name: "sbtc", strategy: "ConvexCurve", fees: { withdraw: 0, harvest: 1e7, platform: 10e7 } }, // 13
    { name: "seth", strategy: "ConvexCurve", fees: { withdraw: 0, harvest: 1e7, platform: 10e7 } }, // 14
    { name: "fraxusdc", strategy: "ConvexCurve", fees: { withdraw: 0, harvest: 1e7, platform: 10e7 } }, // 15
  ],
  aCRV: [
    { name: "steth", strategy: "ConvexCurve", fees: { withdraw: 0, harvest: 1e7, platform: 10e7 } }, // 0
    { name: "frax", strategy: "ConvexCurve", fees: { withdraw: 0, harvest: 1e7, platform: 10e7 } }, // 1
    { name: "tricrypto2", strategy: "ConvexCurve", fees: { withdraw: 0.1e7, harvest: 1e7, platform: 10e7 } }, // 2
    { name: "cvxcrv", strategy: "ConvexCurve", fees: { withdraw: 0, harvest: 1e7, platform: 10e7 } }, // 3
    { name: "crveth", strategy: "ConvexCurve", fees: { withdraw: 0, harvest: 1e7, platform: 10e7 } }, // 4
    { name: "cvxeth", strategy: "ConvexCurve", fees: { withdraw: 0, harvest: 1e7, platform: 10e7 } }, // 5
    { name: "cvxfxs", strategy: "ConvexCurve", fees: { withdraw: 0, harvest: 1e7, platform: 10e7 } }, // 6
    { name: "3pool", strategy: "ConvexCurve", fees: { withdraw: 0, harvest: 1e7, platform: 10e7 } }, // 7
    { name: "ironbank", strategy: "ConvexCurve", fees: { withdraw: 0, harvest: 1e7, platform: 10e7 } }, // 8
    { name: "mim", strategy: "ConvexCurve", fees: { withdraw: 0, harvest: 1e7, platform: 10e7 } }, // 9
    { name: "ren", strategy: "ConvexCurve", fees: { withdraw: 0, harvest: 1e7, platform: 10e7 } }, // 10
    { name: "pusd", strategy: "ConvexCurve", fees: { withdraw: 0, harvest: 1e7, platform: 10e7 } }, // 11
    { name: "susd", strategy: "ConvexCurve", fees: { withdraw: 0, harvest: 1e7, platform: 10e7 } }, // 12
    { name: "sbtc", strategy: "ConvexCurve", fees: { withdraw: 0, harvest: 1e7, platform: 10e7 } }, // 13
    { name: "seth", strategy: "ConvexCurve", fees: { withdraw: 0, harvest: 1e7, platform: 10e7 } }, // 14
    { name: "fraxusdc", strategy: "ConvexCurve", fees: { withdraw: 0, harvest: 1e7, platform: 10e7 } }, // 15
    { name: "fpifrax", strategy: "ConvexCurve", fees: { withdraw: 0, harvest: 1e7, platform: 10e7 } }, // 16
    { name: "alusd", strategy: "ConvexCurve", fees: { withdraw: 0, harvest: 1e7, platform: 10e7 } }, // 17
    { name: "compound", strategy: "ConvexCurve", fees: { withdraw: 0, harvest: 1e7, platform: 10e7 } }, // 18
    { name: "dola", strategy: "ConvexCurve", fees: { withdraw: 0, harvest: 1e7, platform: 10e7 } }, // 19
    { name: "busdv2", strategy: "ConvexCurve", fees: { withdraw: 0, harvest: 1e7, platform: 10e7 } }, // 20
    { name: "aleth", strategy: "ConvexCurve", fees: { withdraw: 0, harvest: 1e7, platform: 10e7 } }, // 21
    { name: "3eur", strategy: "ConvexCurve", fees: { withdraw: 0, harvest: 1e7, platform: 10e7 } }, // 22
    { name: "lusd", strategy: "ConvexCurve", fees: { withdraw: 0, harvest: 1e7, platform: 10e7 } }, // 23
    { name: "silofrax", strategy: "ConvexCurve", fees: { withdraw: 0, harvest: 1e7, platform: 10e7 } }, // 24
    { name: "tusd", strategy: "ConvexCurve", fees: { withdraw: 0, harvest: 1e7, platform: 10e7 } }, // 25
    { name: "susdfraxbp", strategy: "ConvexCurve", fees: { withdraw: 0, harvest: 1e7, platform: 10e7 } }, // 26
    { name: "busdfraxbp", strategy: "ConvexCurve", fees: { withdraw: 0, harvest: 1e7, platform: 10e7 } }, // 27
    { name: "alusdfraxbp", strategy: "ConvexCurve", fees: { withdraw: 0, harvest: 1e7, platform: 10e7 } }, // 28
    { name: "tusdfraxbp", strategy: "ConvexCurve", fees: { withdraw: 0, harvest: 1e7, platform: 10e7 } }, // 29
    { name: "lusdfraxbp", strategy: "ConvexCurve", fees: { withdraw: 0, harvest: 1e7, platform: 10e7 } }, // 30
    { name: "peth", strategy: "ConvexCurve", fees: { withdraw: 0, harvest: 1e7, platform: 10e7 } }, // 31
    { name: "cbeth", strategy: "ConvexCurve", fees: { withdraw: 0, harvest: 1e7, platform: 10e7 } }, // 32
    { name: "frxeth", strategy: "ConvexCurve", fees: { withdraw: 0, harvest: 1e7, platform: 10e7 } }, // 33
    { name: "blusd", strategy: "ConvexCurve", fees: { withdraw: 0, harvest: 1e7, platform: 10e7 } }, // 34
    { name: "sbtc2", strategy: "ConvexCurve", fees: { withdraw: 0, harvest: 1e7, platform: 10e7 } }, // 35
    { name: "multibtc", strategy: "ConvexCurve", fees: { withdraw: 0, harvest: 1e7, platform: 10e7 } }, // 36
    { name: "clevcvx", strategy: "ConvexCurve", fees: { withdraw: 0, harvest: 1e7, platform: 10e7 } }, // 37
    { name: "clevusd", strategy: "ConvexCurve", fees: { withdraw: 0, harvest: 1e7, platform: 10e7 } }, // 38
    { name: "ETH/CLEV", strategy: "ConvexCurve", fees: { withdraw: 0, harvest: 1e7, platform: 10e7 } }, // 39
    { name: "ETH/rETH", strategy: "ConvexCurve", fees: { withdraw: 0, harvest: 1e7, platform: 10e7 } }, // 40
    { name: "GEAR/ETH", strategy: "ConvexCurve", fees: { withdraw: 0, harvest: 1e7, platform: 10e7 } }, // 41
    { name: "WETH/stETH", strategy: "ConvexCurve", fees: { withdraw: 0, harvest: 1e7, platform: 10e7 } }, // 42
    { name: "STG/USDC", strategy: "ConvexCurve", fees: { withdraw: 0, harvest: 1e7, platform: 10e7 } }, // 43
    { name: "ETH/LDO", strategy: "ConvexCurve", fees: { withdraw: 0, harvest: 1e7, platform: 10e7 } }, // 44
    { name: "ETH/MATIC", strategy: "ConvexCurve", fees: { withdraw: 0, harvest: 1e7, platform: 10e7 } }, // 45
    { name: "ETH/CNC", strategy: "ConvexCurve", fees: { withdraw: 0, harvest: 1e7, platform: 10e7 } }, // 46
    { name: "tBTC/crvWSBTC", strategy: "ConvexCurve", fees: { withdraw: 0, harvest: 1e7, platform: 10e7 } }, // 47
    { name: "ETH/CTR", strategy: "ConvexCurve", fees: { withdraw: 0, harvest: 1e7, platform: 10e7 } }, // 48
    { name: "USDP/3CRV", strategy: "ConvexCurve", fees: { withdraw: 0, harvest: 1e7, platform: 10e7 } }, // 49
    { name: "CRV/cvxCRV", strategy: "ConvexCurve", fees: { withdraw: 0, harvest: 1e7, platform: 10e7 } }, // 50
    { name: "eCFX/ETH", strategy: "ConvexCurve", fees: { withdraw: 0, harvest: 1e7, platform: 10e7 } }, // 51
  ],
  aFXS: [
    { name: "frax", strategy: "ConvexCurve", fees: { withdraw: 0, harvest: 1e7, platform: 10e7 } }, // 0
    { name: "cvxfxs", strategy: "ConvexCurve", fees: { withdraw: 0, harvest: 1e7, platform: 10e7 } }, // 1
    { name: "fraxusdc", strategy: "ConvexCurve", fees: { withdraw: 0, harvest: 1e7, platform: 10e7 } }, // 2
    { name: "susdfraxbp", strategy: "ConvexCurve", fees: { withdraw: 0, harvest: 1e7, platform: 10e7 } }, // 3
    { name: "tusd", strategy: "ConvexCurve", fees: { withdraw: 0, harvest: 1e7, platform: 10e7 } }, // 4
    { name: "busdfraxbp", strategy: "ConvexCurve", fees: { withdraw: 0, harvest: 1e7, platform: 10e7 } }, // 5
    { name: "alusdfraxbp", strategy: "ConvexCurve", fees: { withdraw: 0, harvest: 1e7, platform: 10e7 } }, // 6
    { name: "silofrax", strategy: "ConvexCurve", fees: { withdraw: 0, harvest: 1e7, platform: 10e7 } }, // 7
    { name: "tusdfraxbp", strategy: "ConvexCurve", fees: { withdraw: 0, harvest: 1e7, platform: 10e7 } }, // 8
    { name: "frxeth", strategy: "ConvexCurve", fees: { withdraw: 0, harvest: 1e7, platform: 10e7 } }, // 9
    { name: "clevusd", strategy: "ConvexCurve", fees: { withdraw: 0, harvest: 1e7, platform: 10e7 } }, // 10
    { name: "ETH/CLEV", strategy: "ConvexCurve", fees: { withdraw: 0, harvest: 1e7, platform: 10e7 } }, // 11
    { name: "FPIS/cvxFPIS", strategy: "ConvexCurve", fees: { withdraw: 0, harvest: 1e7, platform: 10e7 } }, // 12
  ],
  afrxETH: [
    { name: "frax", strategy: "ConvexCurve", fees: { withdraw: 0, harvest: 1e7, platform: 10e7 } }, // 0
    { name: "tricrypto2", strategy: "ConvexCurve", fees: { withdraw: 0, harvest: 1e7, platform: 10e7 } }, // 1
    { name: "fraxusdc", strategy: "ConvexCurve", fees: { withdraw: 0, harvest: 1e7, platform: 10e7 } }, // 2
    { name: "mim", strategy: "ConvexCurve", fees: { withdraw: 0, harvest: 1e7, platform: 10e7 } }, // 3
    { name: "fpifrax", strategy: "ConvexCurve", fees: { withdraw: 0, harvest: 1e7, platform: 10e7 } }, // 4
    { name: "3eur", strategy: "ConvexCurve", fees: { withdraw: 0, harvest: 1e7, platform: 10e7 } }, // 5
    { name: "lusd", strategy: "ConvexCurve", fees: { withdraw: 0, harvest: 1e7, platform: 10e7 } }, // 6
    { name: "tusd", strategy: "ConvexCurve", fees: { withdraw: 0, harvest: 1e7, platform: 10e7 } }, // 7
    { name: "busdfraxbp", strategy: "ConvexCurve", fees: { withdraw: 0, harvest: 1e7, platform: 10e7 } }, // 8
    { name: "alusdfraxbp", strategy: "ConvexCurve", fees: { withdraw: 0, harvest: 1e7, platform: 10e7 } }, // 9
    { name: "tusdfraxbp", strategy: "ConvexCurve", fees: { withdraw: 0, harvest: 1e7, platform: 10e7 } }, // 10
    { name: "lusdfraxbp", strategy: "ConvexCurve", fees: { withdraw: 0, harvest: 1e7, platform: 10e7 } }, // 11
    { name: "blusd", strategy: "ConvexCurve", fees: { withdraw: 0, harvest: 1e7, platform: 10e7 } }, // 12
    { name: "sbtc2", strategy: "ConvexCurve", fees: { withdraw: 0, harvest: 1e7, platform: 10e7 } }, // 13
    { name: "multibtc", strategy: "ConvexCurve", fees: { withdraw: 0, harvest: 1e7, platform: 10e7 } }, // 14
    { name: "ETH/CLEV", strategy: "ConvexCurve", fees: { withdraw: 0, harvest: 1e7, platform: 10e7 } }, // 15
    { name: "GEAR/ETH", strategy: "ConvexCurve", fees: { withdraw: 0, harvest: 1e7, platform: 10e7 } }, // 16
    { name: "STG/USDC", strategy: "ConvexCurve", fees: { withdraw: 0, harvest: 1e7, platform: 10e7 } }, // 17
    { name: "ETH/LDO", strategy: "ConvexCurve", fees: { withdraw: 0, harvest: 1e7, platform: 10e7 } }, // 18
    { name: "ETH/MATIC", strategy: "ConvexCurve", fees: { withdraw: 0, harvest: 1e7, platform: 10e7 } }, // 19
    { name: "ETH/CNC", strategy: "ConvexCurve", fees: { withdraw: 0, harvest: 1e7, platform: 10e7 } }, // 20
    { name: "tBTC/crvWSBTC", strategy: "ConvexCurve", fees: { withdraw: 0, harvest: 1e7, platform: 10e7 } }, // 21
    { name: "CRV/sdCRV", strategy: "ConvexCurve", fees: { withdraw: 0, harvest: 1e7, platform: 10e7 } }, // 22
    { name: "USDP/3CRV", strategy: "ConvexCurve", fees: { withdraw: 0, harvest: 1e7, platform: 10e7 } }, // 23
  ],
};
