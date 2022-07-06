/* eslint-disable node/no-missing-import */
import { BigNumber } from "ethers";
import { Action, ADDRESS, encodePoolHintV2, PoolType } from "./utils";

export const VAULTS: {
  name: string;
  convexId: number;
  rewards: string[];
  withdrawFee: number;
  harvestBounty: number;
  platformFee: number;
}[] = [
  // steth, 0.05% withdraw fee, 1% harvest bounty, 1% platform fee
  {
    name: "steth",
    convexId: 25,
    rewards: [ADDRESS.CRV, ADDRESS.CVX, ADDRESS.LDO],
    withdrawFee: 5e5,
    harvestBounty: 1e7,
    platformFee: 1e7,
  },
  // frax, 0.05% withdraw fee, 1% harvest bounty, 1% platform fee
  {
    name: "frax",
    convexId: 32,
    rewards: [ADDRESS.CRV, ADDRESS.CVX, ADDRESS.FXS],
    withdrawFee: 5e5,
    harvestBounty: 1e7,
    platformFee: 1e7,
  },
  // tricrypto2, 0.10% withdraw fee, 1% harvest bounty, 1% platform fee
  {
    name: "tricrypto2",
    convexId: 38,
    rewards: [ADDRESS.CRV, ADDRESS.CVX],
    withdrawFee: 10e5,
    harvestBounty: 1e7,
    platformFee: 1e7,
  },
  // cvxcrv, 0.30% withdraw fee, 1% harvest bounty, 8% platform fee
  {
    name: "cvxcrv",
    convexId: 41,
    rewards: [ADDRESS.CRV, ADDRESS.CVX],
    withdrawFee: 30e5,
    harvestBounty: 1e7,
    platformFee: 8e7,
  },
  // crveth, 0.30% withdraw fee, 1% harvest bounty, 1% platform fee
  {
    name: "crveth",
    convexId: 61,
    rewards: [ADDRESS.CRV, ADDRESS.CVX],
    withdrawFee: 30e5,
    harvestBounty: 1e7,
    platformFee: 1e7,
  },
  // cvxeth, 0.30% withdraw fee, 1% harvest bounty, 1% platform fee
  {
    name: "cvxeth",
    convexId: 64,
    rewards: [ADDRESS.CRV, ADDRESS.CVX],
    withdrawFee: 30e5,
    harvestBounty: 1e7,
    platformFee: 1e7,
  },
  // cvxfxs, 0.30% withdraw fee, 1% harvest bounty, 1% platform fee
  {
    name: "cvxfxs",
    convexId: 72,
    rewards: [ADDRESS.CVX, ADDRESS.CRV, ADDRESS.FXS],
    withdrawFee: 30e5,
    harvestBounty: 1e7,
    platformFee: 1e7,
  },
  // 3pool, 0.01% withdraw fee, 1% harvest bounty, 1% platform fee
  {
    name: "3pool",
    convexId: 9,
    rewards: [ADDRESS.CVX, ADDRESS.CRV],
    withdrawFee: 1e5,
    harvestBounty: 1e7,
    platformFee: 1e7,
  },
  // ust-wormhole, 0.05% withdraw fee, 1% harvest bounty, 1% platform fee
  {
    name: "ust-wormhole",
    convexId: 59,
    rewards: [ADDRESS.CVX, ADDRESS.CRV],
    withdrawFee: 5e5,
    harvestBounty: 1e7,
    platformFee: 1e7,
  },
  // RocketPoolETH, 0.05% withdraw fee, 1% harvest bounty, 1% platform fee
  {
    name: "RocketPoolETH",
    convexId: 73,
    rewards: [ADDRESS.CVX, ADDRESS.CRV],
    withdrawFee: 5e5,
    harvestBounty: 1e7,
    platformFee: 1e7,
  },
  // ren, 0.05% withdraw fee, 1% harvest bounty, 1% platform fee
  {
    name: "ren",
    convexId: 6,
    rewards: [ADDRESS.CVX, ADDRESS.CRV],
    withdrawFee: 5e5,
    harvestBounty: 1e7,
    platformFee: 1e7,
  },
  // pusd, 0.05% withdraw fee, 1% harvest bounty, 1% platform fee
  {
    name: "pusd",
    convexId: 91,
    rewards: [ADDRESS.CVX, ADDRESS.CRV, ADDRESS.JPEG],
    withdrawFee: 5e5,
    harvestBounty: 1e7,
    platformFee: 1e7,
  },
];

export const IFO_VAULTS: {
  name: string;
  convexId: number;
  rewards: string[];
  withdrawFee: number;
  harvestBounty: number;
  platformFee: number;
}[] = [
  // steth, 0.05% withdraw fee, 1% harvest bounty, 1% platform fee
  {
    name: "steth",
    convexId: 25,
    rewards: [ADDRESS.CRV, ADDRESS.CVX, ADDRESS.LDO],
    withdrawFee: 5e5,
    harvestBounty: 1e7,
    platformFee: 1e7,
  },
  // frax, 0.05% withdraw fee, 1% harvest bounty, 1% platform fee
  {
    name: "frax",
    convexId: 32,
    rewards: [ADDRESS.CRV, ADDRESS.CVX, ADDRESS.FXS],
    withdrawFee: 5e5,
    harvestBounty: 1e7,
    platformFee: 1e7,
  },
  // tricrypto2, 0.10% withdraw fee, 1% harvest bounty, 1% platform fee
  {
    name: "tricrypto2",
    convexId: 38,
    rewards: [ADDRESS.CRV, ADDRESS.CVX],
    withdrawFee: 10e5,
    harvestBounty: 1e7,
    platformFee: 1e7,
  },
  // cvxcrv, 0.30% withdraw fee, 1% harvest bounty, 8% platform fee
  {
    name: "cvxcrv",
    convexId: 41,
    rewards: [ADDRESS.CRV, ADDRESS.CVX],
    withdrawFee: 30e5,
    harvestBounty: 1e7,
    platformFee: 8e7,
  },
  // crveth, 0.30% withdraw fee, 1% harvest bounty, 1% platform fee
  {
    name: "crveth",
    convexId: 61,
    rewards: [ADDRESS.CRV, ADDRESS.CVX],
    withdrawFee: 30e5,
    harvestBounty: 1e7,
    platformFee: 1e7,
  },
  // cvxeth, 0.30% withdraw fee, 1% harvest bounty, 1% platform fee
  {
    name: "cvxeth",
    convexId: 64,
    rewards: [ADDRESS.CRV, ADDRESS.CVX],
    withdrawFee: 30e5,
    harvestBounty: 1e7,
    platformFee: 1e7,
  },
  // cvxfxs, 0.30% withdraw fee, 1% harvest bounty, 1% platform fee
  {
    name: "cvxfxs",
    convexId: 72,
    rewards: [ADDRESS.CVX, ADDRESS.CRV, ADDRESS.FXS],
    withdrawFee: 30e5,
    harvestBounty: 1e7,
    platformFee: 1e7,
  },
  // 3pool, 0.01% withdraw fee, 1% harvest bounty, 1% platform fee
  {
    name: "3pool",
    convexId: 9,
    rewards: [ADDRESS.CVX, ADDRESS.CRV],
    withdrawFee: 1e5,
    harvestBounty: 1e7,
    platformFee: 1e7,
  },
  // ust-wormhole, 0.05% withdraw fee, 1% harvest bounty, 1% platform fee
  {
    name: "ust-wormhole",
    convexId: 59,
    rewards: [ADDRESS.CVX, ADDRESS.CRV],
    withdrawFee: 5e5,
    harvestBounty: 1e7,
    platformFee: 1e7,
  },
  // RocketPoolETH, 0.05% withdraw fee, 1% harvest bounty, 1% platform fee
  {
    name: "RocketPoolETH",
    convexId: 73,
    rewards: [ADDRESS.CVX, ADDRESS.CRV],
    withdrawFee: 5e5,
    harvestBounty: 1e7,
    platformFee: 1e7,
  },
  // ren, 0.05% withdraw fee, 1% harvest bounty, 1% platform fee
  {
    name: "ren",
    convexId: 6,
    rewards: [ADDRESS.CVX, ADDRESS.CRV],
    withdrawFee: 5e5,
    harvestBounty: 1e7,
    platformFee: 1e7,
  },
];

export const ZAP_VAULT_ROUTES: {
  [pool: string]: {
    name: string;
    add: { token: string; routes: BigNumber[] }[];
    remove: { token: string; routes: BigNumber[] }[];
  };
} = {
  steth: {
    name: "CURVE_STETH",
    add: [
      {
        token: "WETH",
        routes: [encodePoolHintV2(ADDRESS.CURVE_STETH_POOL, PoolType.CurveETHPool, 2, 0, 0, Action.AddLiquidity)],
      },
      {
        token: "stETH",
        routes: [encodePoolHintV2(ADDRESS.CURVE_STETH_POOL, PoolType.CurveETHPool, 2, 1, 1, Action.AddLiquidity)],
      },
      {
        token: "USDC", // USDC => WETH => CURVE_STETH
        routes: [
          encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 0, 1, Action.Swap),
          encodePoolHintV2(ADDRESS.CURVE_STETH_POOL, PoolType.CurveETHPool, 2, 0, 0, Action.AddLiquidity),
        ],
      },
    ],
    remove: [
      {
        token: "WETH",
        routes: [encodePoolHintV2(ADDRESS.CURVE_STETH_POOL, PoolType.CurveETHPool, 2, 0, 0, Action.RemoveLiquidity)],
      },
      {
        token: "stETH",
        routes: [encodePoolHintV2(ADDRESS.CURVE_STETH_POOL, PoolType.CurveETHPool, 2, 1, 1, Action.RemoveLiquidity)],
      },
    ],
  },
  frax: {
    name: "CURVE_FRAX3CRV",
    add: [
      {
        token: "FRAX",
        routes: [
          encodePoolHintV2(ADDRESS.CURVE_FRAX3CRV_POOL, PoolType.CurveFactoryMetaPool, 2, 0, 0, Action.AddLiquidity),
        ],
      },
      {
        token: "TRICRV",
        routes: [
          encodePoolHintV2(ADDRESS.CURVE_FRAX3CRV_POOL, PoolType.CurveFactoryMetaPool, 2, 1, 1, Action.AddLiquidity),
        ],
      },
      {
        token: "DAI",
        routes: [
          encodePoolHintV2(
            ADDRESS.CURVE_FRAX3CRV_POOL,
            PoolType.CurveFactoryUSDMetaPoolUnderlying,
            4,
            1,
            1,
            Action.AddLiquidity
          ),
        ],
      },
      {
        token: "USDC",
        routes: [
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
      {
        token: "USDT",
        routes: [
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
      {
        token: "WETH", // WETH => USDT => FRAX3CRV
        routes: [
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
    ],
    remove: [
      {
        token: "FRAX",
        routes: [
          encodePoolHintV2(ADDRESS.CURVE_FRAX3CRV_POOL, PoolType.CurveFactoryMetaPool, 2, 0, 0, Action.RemoveLiquidity),
        ],
      },
      {
        token: "TRICRV",
        routes: [
          encodePoolHintV2(ADDRESS.CURVE_FRAX3CRV_POOL, PoolType.CurveFactoryMetaPool, 2, 1, 1, Action.RemoveLiquidity),
        ],
      },
      {
        token: "DAI",
        routes: [
          encodePoolHintV2(
            ADDRESS.CURVE_FRAX3CRV_POOL,
            PoolType.CurveFactoryUSDMetaPoolUnderlying,
            4,
            1,
            1,
            Action.RemoveLiquidity
          ),
        ],
      },
      {
        token: "USDC",
        routes: [
          encodePoolHintV2(
            ADDRESS.CURVE_FRAX3CRV_POOL,
            PoolType.CurveFactoryUSDMetaPoolUnderlying,
            4,
            2,
            2,
            Action.RemoveLiquidity
          ),
        ],
      },
      {
        token: "USDT",
        routes: [
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
    ],
  },
  tricrypto2: {
    name: "CURVE_TRICRYPTO",
    add: [
      {
        token: "USDT",
        routes: [
          encodePoolHintV2(ADDRESS.CURVE_TRICRYPTO_POOL, PoolType.CurveTriCryptoPool, 3, 0, 0, Action.AddLiquidity),
        ],
      },
      {
        token: "WBTC",
        routes: [
          encodePoolHintV2(ADDRESS.CURVE_TRICRYPTO_POOL, PoolType.CurveTriCryptoPool, 3, 1, 1, Action.AddLiquidity),
        ],
      },
      {
        token: "WETH",
        routes: [
          encodePoolHintV2(ADDRESS.CURVE_TRICRYPTO_POOL, PoolType.CurveTriCryptoPool, 3, 2, 2, Action.AddLiquidity),
        ],
      },
      {
        token: "USDC", // USDC => USDT => CURVE_TRICRYPTO
        routes: [
          encodePoolHintV2(ADDRESS.USDC_USDT_UNIV3, PoolType.UniswapV3, 2, 0, 1, Action.Swap),
          encodePoolHintV2(ADDRESS.CURVE_TRICRYPTO_POOL, PoolType.CurveTriCryptoPool, 3, 0, 0, Action.AddLiquidity),
        ],
      },
    ],
    remove: [
      {
        token: "USDT",
        routes: [
          encodePoolHintV2(ADDRESS.CURVE_TRICRYPTO_POOL, PoolType.CurveTriCryptoPool, 3, 0, 0, Action.RemoveLiquidity),
        ],
      },
      {
        token: "WBTC",
        routes: [
          encodePoolHintV2(ADDRESS.CURVE_TRICRYPTO_POOL, PoolType.CurveTriCryptoPool, 3, 1, 1, Action.RemoveLiquidity),
        ],
      },
      {
        token: "WETH",
        routes: [
          encodePoolHintV2(ADDRESS.CURVE_TRICRYPTO_POOL, PoolType.CurveTriCryptoPool, 3, 2, 2, Action.RemoveLiquidity),
        ],
      },
    ],
  },
  cvxcrv: {
    name: "CURVE_CVXCRV",
    add: [
      {
        token: "CRV",
        routes: [
          encodePoolHintV2(ADDRESS.CURVE_CVXCRV_POOL, PoolType.CurveFactoryPlainPool, 2, 0, 0, Action.AddLiquidity),
        ],
      },
      {
        token: "CVXCRV",
        routes: [
          encodePoolHintV2(ADDRESS.CURVE_CVXCRV_POOL, PoolType.CurveFactoryPlainPool, 2, 1, 1, Action.AddLiquidity),
        ],
      },
      {
        token: "WETH", // WETH => CRV => CURVE_CVXCRV
        routes: [
          encodePoolHintV2(ADDRESS.CURVE_CRVETH_POOL, PoolType.CurveCryptoPool, 2, 0, 1, Action.Swap),
          encodePoolHintV2(ADDRESS.CURVE_CVXCRV_POOL, PoolType.CurveFactoryPlainPool, 2, 0, 0, Action.AddLiquidity),
        ],
      },
      {
        token: "USDC", // USDC => WETH => CRV => CURVE_CVXCRV
        routes: [
          encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 0, 1, Action.Swap),
          encodePoolHintV2(ADDRESS.CURVE_CRVETH_POOL, PoolType.CurveCryptoPool, 2, 0, 1, Action.Swap),
          encodePoolHintV2(ADDRESS.CURVE_CVXCRV_POOL, PoolType.CurveFactoryPlainPool, 2, 0, 0, Action.AddLiquidity),
        ],
      },
    ],
    remove: [
      {
        token: "CRV",
        routes: [
          encodePoolHintV2(ADDRESS.CURVE_CVXCRV_POOL, PoolType.CurveFactoryPlainPool, 2, 0, 0, Action.RemoveLiquidity),
        ],
      },
      {
        token: "CVXCRV",
        routes: [
          encodePoolHintV2(ADDRESS.CURVE_CVXCRV_POOL, PoolType.CurveFactoryPlainPool, 2, 1, 1, Action.RemoveLiquidity),
        ],
      },
    ],
  },
  crveth: {
    name: "CURVE_CRVETH",
    add: [
      {
        token: "WETH",
        routes: [encodePoolHintV2(ADDRESS.CURVE_CRVETH_POOL, PoolType.CurveCryptoPool, 2, 0, 0, Action.AddLiquidity)],
      },
      {
        token: "CRV",
        routes: [encodePoolHintV2(ADDRESS.CURVE_CRVETH_POOL, PoolType.CurveCryptoPool, 2, 1, 1, Action.AddLiquidity)],
      },
      {
        token: "USDC", // USDC => WETH => CURVE_CRVETH
        routes: [
          encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 0, 1, Action.Swap),
          encodePoolHintV2(ADDRESS.CURVE_CRVETH_POOL, PoolType.CurveCryptoPool, 2, 0, 0, Action.AddLiquidity),
        ],
      },
    ],
    remove: [
      {
        token: "WETH",
        routes: [
          encodePoolHintV2(ADDRESS.CURVE_CRVETH_POOL, PoolType.CurveCryptoPool, 2, 0, 0, Action.RemoveLiquidity),
        ],
      },
      {
        token: "CRV",
        routes: [
          encodePoolHintV2(ADDRESS.CURVE_CRVETH_POOL, PoolType.CurveCryptoPool, 2, 1, 1, Action.RemoveLiquidity),
        ],
      },
    ],
  },
  cvxeth: {
    name: "CURVE_CVXETH",
    add: [
      {
        token: "WETH",
        routes: [encodePoolHintV2(ADDRESS.CURVE_CVXETH_POOL, PoolType.CurveCryptoPool, 2, 0, 0, Action.AddLiquidity)],
      },
      {
        token: "CVX",
        routes: [encodePoolHintV2(ADDRESS.CURVE_CVXETH_POOL, PoolType.CurveCryptoPool, 2, 1, 1, Action.AddLiquidity)],
      },
      {
        token: "USDC", // USDC => WETH => CURVE_CVXETH
        routes: [
          encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 0, 1, Action.Swap),
          encodePoolHintV2(ADDRESS.CURVE_CVXETH_POOL, PoolType.CurveCryptoPool, 2, 0, 0, Action.AddLiquidity),
        ],
      },
    ],
    remove: [
      {
        token: "WETH",
        routes: [
          encodePoolHintV2(ADDRESS.CURVE_CVXETH_POOL, PoolType.CurveCryptoPool, 2, 0, 0, Action.RemoveLiquidity),
        ],
      },
      {
        token: "CVX",
        routes: [
          encodePoolHintV2(ADDRESS.CURVE_CVXETH_POOL, PoolType.CurveCryptoPool, 2, 1, 1, Action.RemoveLiquidity),
        ],
      },
    ],
  },
  cvxfxs: {
    name: "CURVE_CVXFXS",
    add: [
      {
        token: "FXS",
        routes: [encodePoolHintV2(ADDRESS.CURVE_CVXFXS_POOL, PoolType.CurveCryptoPool, 2, 0, 0, Action.AddLiquidity)],
      },
      {
        token: "CVXFXS",
        routes: [encodePoolHintV2(ADDRESS.CURVE_CVXFXS_POOL, PoolType.CurveCryptoPool, 2, 1, 1, Action.AddLiquidity)],
      },
      {
        token: "WETH", // WETH => USDC => FRAX => FXS
        routes: [
          encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 1, 0, Action.Swap),
          encodePoolHintV2(ADDRESS.FRAX_USDC_UNIV3, PoolType.UniswapV3, 2, 1, 0, Action.Swap),
          encodePoolHintV2(ADDRESS.FXS_FRAX_UNIV2, PoolType.UniswapV2, 2, 1, 0, Action.Swap),
          encodePoolHintV2(ADDRESS.CURVE_CVXFXS_POOL, PoolType.CurveCryptoPool, 2, 0, 0, Action.AddLiquidity),
        ],
      },
      {
        token: "USDC", // USDC => FRAX => FXS
        routes: [
          encodePoolHintV2(ADDRESS.FRAX_USDC_UNIV3, PoolType.UniswapV3, 2, 1, 0, Action.Swap),
          encodePoolHintV2(ADDRESS.FXS_FRAX_UNIV2, PoolType.UniswapV2, 2, 1, 0, Action.Swap),
          encodePoolHintV2(ADDRESS.CURVE_CVXFXS_POOL, PoolType.CurveCryptoPool, 2, 0, 0, Action.AddLiquidity),
        ],
      },
    ],
    remove: [
      {
        token: "FXS",
        routes: [
          encodePoolHintV2(ADDRESS.CURVE_CVXFXS_POOL, PoolType.CurveCryptoPool, 2, 0, 0, Action.RemoveLiquidity),
        ],
      },
      {
        token: "CVXFXS",
        routes: [
          encodePoolHintV2(ADDRESS.CURVE_CVXFXS_POOL, PoolType.CurveCryptoPool, 2, 1, 1, Action.RemoveLiquidity),
        ],
      },
    ],
  },
  "3pool": {
    name: "CURVE_TRICRV",
    add: [
      {
        token: "DAI",
        routes: [encodePoolHintV2(ADDRESS.CURVE_TRICRV_POOL, PoolType.CurveBasePool, 3, 0, 0, Action.AddLiquidity)],
      },
      {
        token: "USDC",
        routes: [encodePoolHintV2(ADDRESS.CURVE_TRICRV_POOL, PoolType.CurveBasePool, 3, 1, 1, Action.AddLiquidity)],
      },
      {
        token: "USDT",
        routes: [encodePoolHintV2(ADDRESS.CURVE_TRICRV_POOL, PoolType.CurveBasePool, 3, 2, 2, Action.AddLiquidity)],
      },
      {
        token: "WETH", // WETH => USDT => 3CRV
        routes: [
          encodePoolHintV2(ADDRESS.WETH_USDT_UNIV3, PoolType.UniswapV3, 2, 0, 1, Action.Swap),
          encodePoolHintV2(ADDRESS.CURVE_TRICRV_POOL, PoolType.CurveBasePool, 3, 2, 2, Action.AddLiquidity),
        ],
      },
    ],
    remove: [
      {
        token: "DAI",
        routes: [encodePoolHintV2(ADDRESS.CURVE_TRICRV_POOL, PoolType.CurveBasePool, 2, 0, 0, Action.RemoveLiquidity)],
      },
      {
        token: "USDC",
        routes: [encodePoolHintV2(ADDRESS.CURVE_TRICRV_POOL, PoolType.CurveBasePool, 2, 1, 1, Action.RemoveLiquidity)],
      },
      {
        token: "USDT",
        routes: [encodePoolHintV2(ADDRESS.CURVE_TRICRV_POOL, PoolType.CurveBasePool, 2, 2, 2, Action.RemoveLiquidity)],
      },
    ],
  },
  "ust-wormhole": {
    name: "CURVE_UST_WORMHOLE",
    add: [
      {
        token: "UST_WORMHOLE",
        routes: [
          encodePoolHintV2(
            ADDRESS.CURVE_UST_WORMHOLE_POOL,
            PoolType.CurveFactoryMetaPool,
            2,
            0,
            0,
            Action.AddLiquidity
          ),
        ],
      },
      {
        token: "TRICRV",
        routes: [
          encodePoolHintV2(
            ADDRESS.CURVE_UST_WORMHOLE_POOL,
            PoolType.CurveFactoryMetaPool,
            2,
            1,
            1,
            Action.AddLiquidity
          ),
        ],
      },
      {
        token: "DAI",
        routes: [
          encodePoolHintV2(
            ADDRESS.CURVE_UST_WORMHOLE_POOL,
            PoolType.CurveFactoryUSDMetaPoolUnderlying,
            4,
            1,
            1,
            Action.AddLiquidity
          ),
        ],
      },
      {
        token: "USDC",
        routes: [
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
      {
        token: "USDT",
        routes: [
          encodePoolHintV2(
            ADDRESS.CURVE_UST_WORMHOLE_POOL,
            PoolType.CurveFactoryUSDMetaPoolUnderlying,
            4,
            3,
            3,
            Action.AddLiquidity
          ),
        ],
      },
      {
        token: "WETH", // WETH => USDT => CURVE_UST_WORMHOLE
        routes: [
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
      },
      {
        token: "UST_TERRA", // UST_TERRA => USDC => CURVE_UST_WORMHOLE
        routes: [
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
    ],
    remove: [
      {
        token: "UST_WORMHOLE",
        routes: [
          encodePoolHintV2(
            ADDRESS.CURVE_UST_WORMHOLE_POOL,
            PoolType.CurveFactoryMetaPool,
            2,
            0,
            0,
            Action.RemoveLiquidity
          ),
        ],
      },
      {
        token: "TRICRV",
        routes: [
          encodePoolHintV2(
            ADDRESS.CURVE_UST_WORMHOLE_POOL,
            PoolType.CurveFactoryMetaPool,
            2,
            1,
            1,
            Action.RemoveLiquidity
          ),
        ],
      },
      {
        token: "DAI",
        routes: [
          encodePoolHintV2(
            ADDRESS.CURVE_UST_WORMHOLE_POOL,
            PoolType.CurveFactoryUSDMetaPoolUnderlying,
            4,
            1,
            1,
            Action.RemoveLiquidity
          ),
        ],
      },
      {
        token: "USDC",
        routes: [
          encodePoolHintV2(
            ADDRESS.CURVE_UST_WORMHOLE_POOL,
            PoolType.CurveFactoryUSDMetaPoolUnderlying,
            4,
            2,
            2,
            Action.RemoveLiquidity
          ),
        ],
      },
      {
        token: "USDT",
        routes: [
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
    ],
  },
  RocketPoolETH: {
    name: "CURVE_ROCKETETH",
    add: [
      {
        token: "rETH",
        routes: [
          encodePoolHintV2(ADDRESS.CURVE_ROCKETETH_POOL, PoolType.CurveFactoryPlainPool, 2, 0, 0, Action.AddLiquidity),
        ],
      },
      {
        token: "wstETH",
        routes: [
          encodePoolHintV2(ADDRESS.CURVE_ROCKETETH_POOL, PoolType.CurveFactoryPlainPool, 2, 1, 1, Action.AddLiquidity),
        ],
      },
      {
        token: "stETH",
        routes: [
          encodePoolHintV2(ADDRESS.wstETH, PoolType.LidoWrap, 2, 0, 0, Action.AddLiquidity),
          encodePoolHintV2(ADDRESS.CURVE_ROCKETETH_POOL, PoolType.CurveFactoryPlainPool, 2, 1, 1, Action.AddLiquidity),
        ],
      },
      {
        token: "WETH", // WETH => stETH => wstETh => CURVE_ROCKETETH
        routes: [
          encodePoolHintV2(ADDRESS.stETH, PoolType.LidoStake, 2, 0, 0, Action.AddLiquidity),
          encodePoolHintV2(ADDRESS.wstETH, PoolType.LidoWrap, 2, 0, 0, Action.AddLiquidity),
          encodePoolHintV2(ADDRESS.CURVE_ROCKETETH_POOL, PoolType.CurveFactoryPlainPool, 2, 1, 1, Action.AddLiquidity),
        ],
      },
      {
        token: "USDC", // USDC => WETH => stETH => wstETh => CURVE_ROCKETETH
        routes: [
          encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 0, 1, Action.Swap),
          encodePoolHintV2(ADDRESS.stETH, PoolType.LidoStake, 2, 0, 0, Action.AddLiquidity),
          encodePoolHintV2(ADDRESS.wstETH, PoolType.LidoWrap, 2, 0, 0, Action.AddLiquidity),
          encodePoolHintV2(ADDRESS.CURVE_ROCKETETH_POOL, PoolType.CurveFactoryPlainPool, 2, 1, 1, Action.AddLiquidity),
        ],
      },
    ],
    remove: [
      {
        token: "rETH",
        routes: [
          encodePoolHintV2(
            ADDRESS.CURVE_ROCKETETH_POOL,
            PoolType.CurveFactoryPlainPool,
            2,
            0,
            0,
            Action.RemoveLiquidity
          ),
        ],
      },
      {
        token: "wstETH",
        routes: [
          encodePoolHintV2(
            ADDRESS.CURVE_ROCKETETH_POOL,
            PoolType.CurveFactoryPlainPool,
            2,
            1,
            1,
            Action.RemoveLiquidity
          ),
        ],
      },
      {
        token: "stETH",
        routes: [
          encodePoolHintV2(
            ADDRESS.CURVE_ROCKETETH_POOL,
            PoolType.CurveFactoryPlainPool,
            2,
            1,
            1,
            Action.RemoveLiquidity
          ),
          encodePoolHintV2(ADDRESS.wstETH, PoolType.LidoWrap, 2, 0, 0, Action.RemoveLiquidity),
        ],
      },
    ],
  },
  ren: {
    name: "CURVE_REN",
    add: [
      {
        token: "renBTC", // renBTC ==(Curve/Add)==> CURVE_REN
        routes: [encodePoolHintV2(ADDRESS.CURVE_REN_POOL, PoolType.CurveBasePool, 2, 0, 0, Action.AddLiquidity)],
      },
      {
        token: "WBTC", // WBTC ==(Curve/Add)==> CURVE_REN
        routes: [encodePoolHintV2(ADDRESS.CURVE_REN_POOL, PoolType.CurveBasePool, 2, 1, 1, Action.AddLiquidity)],
      },
      {
        token: "WETH", // WETH ==(UniV3/Swap/500)==> WBTC ==(Curve/Add)==> CURVE_REN
        routes: [
          encodePoolHintV2(ADDRESS.WBTC_WETH_UNIV3_500, PoolType.UniswapV3, 2, 1, 0, Action.Swap),
          encodePoolHintV2(ADDRESS.CURVE_REN_POOL, PoolType.CurveBasePool, 2, 1, 1, Action.AddLiquidity),
        ],
      },
      {
        token: "USDC", // USDC ==(Curve/Swap)==> USDT ==(Curve/Swap)==> WBTC ==(Curve/Add)==> CURVE_REN
        routes: [
          encodePoolHintV2(ADDRESS.CURVE_TRICRV_POOL, PoolType.CurveBasePool, 3, 1, 2, Action.Swap),
          encodePoolHintV2(ADDRESS.CURVE_TRICRYPTO_POOL, PoolType.CurveTriCryptoPool, 3, 0, 1, Action.Swap),
          encodePoolHintV2(ADDRESS.CURVE_REN_POOL, PoolType.CurveBasePool, 2, 1, 1, Action.AddLiquidity),
        ],
      },
    ],
    remove: [],
  },
  pusd: {
    name: "CURVE_PUSD3CRV",
    add: [
      {
        token: "PUSD",
        routes: [
          encodePoolHintV2(ADDRESS.CURVE_PUSD3CRV_POOL, PoolType.CurveFactoryMetaPool, 2, 0, 0, Action.AddLiquidity),
        ],
      },
      {
        token: "TRICRV",
        routes: [
          encodePoolHintV2(ADDRESS.CURVE_PUSD3CRV_POOL, PoolType.CurveFactoryMetaPool, 2, 1, 1, Action.AddLiquidity),
        ],
      },
      {
        token: "DAI",
        routes: [
          encodePoolHintV2(
            ADDRESS.CURVE_PUSD3CRV_POOL,
            PoolType.CurveFactoryUSDMetaPoolUnderlying,
            4,
            1,
            1,
            Action.AddLiquidity
          ),
        ],
      },
      {
        token: "USDC",
        routes: [
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
      {
        token: "USDT",
        routes: [
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
      {
        token: "WETH", // WETH => USDT => FRAX3CRV
        routes: [
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
    ],
    remove: [],
  },
};
