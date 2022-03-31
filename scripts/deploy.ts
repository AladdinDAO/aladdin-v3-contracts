/* eslint-disable node/no-missing-import */
import { BigNumber, constants } from "ethers";
import { ethers } from "hardhat";
import { Action, encodePoolHint, encodePoolHintV2, PoolType } from "../test/utils";
import {
  AladdinConvexVault,
  AladdinConvexVaultZap,
  AladdinCRV,
  AladdinCRVZap,
  AladdinZap,
  ProxyAdmin,
} from "../typechain";

const config: {
  acrv?: string;
  vault?: string;
  acrvZap?: string;
  vaultZap?: string;
  proxyAdmin?: string;
  aladdinZap?: string;
} = {
  acrv: "0x2b95A1Dcc3D405535f9ed33c219ab38E8d7e0884",
  vault: "0xc8fF37F7d057dF1BB9Ad681b53Fa4726f268E0e8",
  proxyAdmin: "0x12b1326459d72F2Ab081116bf27ca46cD97762A0",
  acrvZap: "0x5EB30ce188B0abb89A942cED6Cbe114F4d852082",
  vaultZap: "0x71Fb0cc62139766383C0F09F1E31375023592841",
  aladdinZap: "0x1104b4DF568fa7Af90B1Bed1D78A2F71e748dc8a",
};

const PLATFORM = "0xc40549aa1D05C30af23a1C4a5af6bA11FCAFe23F";
const ACRV_WITHDRAW_FEE_PERCENTAGE = 2.5e6; // 0.25%
const ACRV_PLATFORM_FEE_PERCENTAGE = 2.5e7; // 2.5%
const ACRV_HARVEST_BOUNTY_PERCENTAGE = 2.5e7; // 2.5%

const ADDRESS: { [name: string]: string } = {
  WETH: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  CRV: "0xD533a949740bb3306d119CC777fa900bA034cd52",
  CVX: "0x4e3FBD56CD56c3e72c1403e103b45Db9da5B9D2B",
  LDO: "0x5A98FcBEA516Cf06857215779Fd812CA3beF1B32",
  FXS: "0x3432B6A60D23Ca0dFCa7761B7ab56459D9C964D0",
  ALCX: "0xdBdb4d16EdA451D0503b854CF79D55697F90c8DF",
  SPELL: "0x090185f2135308BaD17527004364eBcC2D37e5F6",
  stETH: "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84",
  FRAX: "0x853d955aCEf822Db058eb8505911ED77F175b99e",
  TRICRV: "0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490",
  DAI: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
  USDC: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  USDT: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
  WBTC: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",
  CVXFXS: "0xFEEf77d3f69374f66429C91d732A244f074bdf74",
  CVXCRV: "0x62B9c7356A2Dc64a1969e19C23e4f579F9810Aa7",
  rETH: "0xae78736Cd615f374D3085123A210448E74Fc6393",
  wstETH: "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0",
  UST_WORMHOLE: "0xa693B19d2931d498c5B318dF961919BB4aee87a5",
  // pid = 0
  CURVE_STETH_POOL: "0xDC24316b9AE028F1497c275EB9192a3Ea0f67022",
  CURVE_STETH_TOKEN: "0x06325440D014e39736583c165C2963BA99fAf14E",
  // pid = 1
  CURVE_FRAX3CRV_POOL: "0xd632f22692FaC7611d2AA1C0D552930D43CAEd3B",
  CURVE_FRAX3CRV_TOKEN: "0xd632f22692FaC7611d2AA1C0D552930D43CAEd3B",
  // pid = 2
  CURVE_TRICRYPTO_POOL: "0xD51a44d3FaE010294C616388b506AcdA1bfAAE46",
  CURVE_TRICRYPTO_TOKEN: "0xc4AD29ba4B3c580e6D59105FFf484999997675Ff",
  // pid = 3
  CURVE_CVXCRV_POOL: "0x9D0464996170c6B9e75eED71c68B99dDEDf279e8",
  CURVE_CVXCRV_TOKEN: "0x9D0464996170c6B9e75eED71c68B99dDEDf279e8",
  // pid = 4
  CURVE_CRVETH_POOL: "0x8301AE4fc9c624d1D396cbDAa1ed877821D7C511",
  CURVE_CRVETH_TOKEN: "0xEd4064f376cB8d68F770FB1Ff088a3d0F3FF5c4d",
  // pid = 5
  CURVE_CVXETH_POOL: "0xB576491F1E6e5E62f1d8F26062Ee822B40B0E0d4",
  CURVE_CVXETH_TOKEN: "0x3A283D9c08E8b55966afb64C515f5143cf907611",
  // pid = 6
  CURVE_CVXFXS_POOL: "0xd658A338613198204DCa1143Ac3F01A722b5d94A",
  CURVE_CVXFXS_TOKEN: "0xF3A43307DcAFa93275993862Aae628fCB50dC768",
  // pid = 7
  CURVE_TRICRV_POOL: "0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7",
  CURVE_TRICRV_TOKEN: "0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490",
  // pid = 8
  CURVE_UST_WORMHOLE_POOL: "0xCEAF7747579696A2F0bb206a14210e3c9e6fB269",
  CURVE_UST_WORMHOLE_TOKEN: "0xCEAF7747579696A2F0bb206a14210e3c9e6fB269",
  // pid = 9
  CURVE_ROCKETETH_POOL: "0x447Ddd4960d9fdBF6af9a790560d0AF76795CB08",
  CURVE_ROCKETETH_TOKEN: "0x447Ddd4960d9fdBF6af9a790560d0AF76795CB08",
};

const VAULTS: {
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

  /*
  [36, [CRV, CVX, ALCX]], // alusd
  [40, [CRV, CVX, SPELL]], // mim
  [41, [CRV, CVX]], // cvxcrv
  [49, [CRV, CVX]], // aleth
  [52, [CRV, CVX]], // mim-ust
  [66, [CRV, CVX]], // spelleth
  [67, [CRV, CVX]], // teth
  [68, [CRV, CVX]], // yfieth
  [69, [CRV, CVX]], // fxseth */
];

const ZAP_SWAP_ROUNTES: { from: string; to: string; routes: BigNumber[] }[] = [
  {
    from: "WETH",
    to: "CRV",
    routes: [encodePoolHintV2(ADDRESS.CURVE_CRVETH_POOL, PoolType.CurveCryptoPool, 2, 0, 1, Action.Swap)],
  },
  {
    from: "CVX",
    to: "WETH",
    routes: [encodePoolHintV2(ADDRESS.CURVE_CVXETH_POOL, PoolType.CurveCryptoPool, 2, 1, 0, Action.Swap)],
  },
  {
    from: "LDO",
    to: "WETH",
    routes: [encodePoolHintV2("0xC558F600B34A5f69dD2f0D06Cb8A88d829B7420a", PoolType.UniswapV2, 2, 0, 1, Action.Swap)],
  },
  {
    from: "FXS",
    to: "WETH",
    routes: [encodePoolHintV2("0x61eB53ee427aB4E007d78A9134AaCb3101A2DC23", PoolType.UniswapV2, 2, 0, 1, Action.Swap)],
  },
];

const ZAP_VAULT_ROUTES: {
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
  rocketeth: {
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
        token: "WETH",
        routes: [
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
};

let proxyAdmin: ProxyAdmin;
let acrv: AladdinCRV;
let acrvZap: AladdinCRVZap;
let vault: AladdinConvexVault;
let vaultZap: AladdinConvexVaultZap;
let aladdinZap: AladdinZap;

async function addVaults() {
  for (const { convexId, rewards, withdrawFee, harvestBounty, platformFee } of VAULTS) {
    console.log("Adding pool with pid:", convexId, "rewards:", rewards.join("/"));
    const tx = await vault.addPool(convexId, rewards, withdrawFee, platformFee, harvestBounty);
    console.log("wait for tx:", tx.hash);
    await tx.wait();
    console.log("Added with tx:", tx.hash);
  }
}

// deprecated in current version
// eslint-disable-next-line no-unused-vars
async function setupRoutes() {
  let tx = await vaultZap.updateRoute(ADDRESS.WETH, ADDRESS.CRV, [
    encodePoolHint("0x8301AE4fc9c624d1D396cbDAa1ed877821D7C511", 4, 0, 1),
  ]);
  console.log("wait for tx:", tx.hash);
  await tx.wait();
  tx = await vaultZap.updateRoute(ADDRESS.CVX, ADDRESS.WETH, [
    encodePoolHint("0xB576491F1E6e5E62f1d8F26062Ee822B40B0E0d4", 4, 1, 0),
  ]);
  console.log("wait for tx:", tx.hash);
  await tx.wait();
  tx = await vaultZap.updateRoute(ADDRESS.LDO, ADDRESS.WETH, [
    encodePoolHint("0xC558F600B34A5f69dD2f0D06Cb8A88d829B7420a", 0, 0, 1),
  ]);
  console.log("wait for tx:", tx.hash);
  await tx.wait();
  tx = await vaultZap.updateRoute(ADDRESS.FXS, ADDRESS.WETH, [
    encodePoolHint("0xCD8286b48936cDAC20518247dBD310ab681A9fBf", 1, 0, 1),
  ]);
  console.log("wait for tx:", tx.hash);
  await tx.wait();
}

async function setupRouteForAladdinZap() {
  console.log("update pool tokens");
  const tx = await aladdinZap.updatePoolTokens(
    [
      ADDRESS.CURVE_STETH_POOL,
      ADDRESS.CURVE_FRAX3CRV_POOL,
      ADDRESS.CURVE_TRICRYPTO_POOL,
      ADDRESS.CURVE_CVXCRV_POOL,
      ADDRESS.CURVE_CRVETH_POOL,
      ADDRESS.CURVE_CVXETH_POOL,
      ADDRESS.CURVE_CVXFXS_POOL,
      ADDRESS.CURVE_TRICRV_POOL,
      ADDRESS.CURVE_UST_WORMHOLE_POOL,
      ADDRESS.CURVE_ROCKETETH_POOL,
    ],
    [
      ADDRESS.CURVE_STETH_TOKEN,
      ADDRESS.CURVE_FRAX3CRV_TOKEN,
      ADDRESS.CURVE_TRICRYPTO_TOKEN,
      ADDRESS.CURVE_CVXCRV_TOKEN,
      ADDRESS.CURVE_CRVETH_TOKEN,
      ADDRESS.CURVE_CVXETH_TOKEN,
      ADDRESS.CURVE_CVXFXS_TOKEN,
      ADDRESS.CURVE_TRICRV_TOKEN,
      ADDRESS.CURVE_UST_WORMHOLE_TOKEN,
      ADDRESS.CURVE_ROCKETETH_TOKEN,
    ]
  );
  console.log("waiting tx:", tx.hash);
  await tx.wait();

  // swap routes
  for (const { from, to, routes } of ZAP_SWAP_ROUNTES) {
    let update: boolean;
    try {
      update = (await aladdinZap.routes(ADDRESS[from], ADDRESS[to], 0)).eq(constants.AddressZero);
    } catch (error) {
      update = true;
    }
    if (update) {
      console.log(`update ${from} => ${to} Swap routes`);
      const tx = await aladdinZap.updateRoute(ADDRESS[from], ADDRESS[to], routes);
      console.log("waiting tx:", tx.hash);
      await tx.wait();
    }
  }
  const pools = [
    "steth",
    "frax",
    "tricrypto2",
    "cvxcrv",
    "crveth",
    "cvxeth",
    "cvxfxs",
    "3pool",
    "ust-wormhole",
    "rocketeth",
  ];
  for (const pool of pools) {
    const info = ZAP_VAULT_ROUTES[pool];
    console.log(`setup routes for pool[${pool}], name[${info.name}]`);
    // deposit
    for (const { token, routes } of info.add) {
      let update: boolean;
      try {
        update = (await aladdinZap.routes(ADDRESS[token], ADDRESS[`${info.name}_TOKEN`], 0)).eq(constants.AddressZero);
      } catch (error) {
        update = true;
      }
      if (update) {
        console.log(`update ${token} => ${info.name}_TOKEN Deposit routes`);
        const tx = await aladdinZap.updateRoute(ADDRESS[token], ADDRESS[`${info.name}_TOKEN`], routes);
        console.log("waiting tx:", tx.hash);
        await tx.wait();
      }
    }
    // withdraw
    for (const { token, routes } of info.remove) {
      let update: boolean;
      try {
        update = (await aladdinZap.routes(ADDRESS[`${info.name}_TOKEN`], ADDRESS[token], 0)).eq(constants.AddressZero);
      } catch (error) {
        update = true;
      }
      if (update) {
        console.log(`update ${info.name}_TOKEN => ${token} Withdraw routes`);
        const tx = await aladdinZap.updateRoute(ADDRESS[`${info.name}_TOKEN`], ADDRESS[token], routes);
        console.log("waiting tx:", tx.hash);
        await tx.wait();
      }
    }
  }
}

async function main() {
  const [deployer] = await ethers.getSigners();

  if (config.proxyAdmin) {
    proxyAdmin = await ethers.getContractAt("ProxyAdmin", config.proxyAdmin, deployer);
    console.log("Found ProxyAdmin at:", proxyAdmin.address);
  } else {
    const ProxyAdmin = await ethers.getContractFactory("ProxyAdmin", deployer);
    proxyAdmin = await ProxyAdmin.deploy();
    await proxyAdmin.deployed();
    console.log("Deploy ProxyAdmin at:", proxyAdmin.address);
  }

  if (config.acrvZap) {
    acrvZap = await ethers.getContractAt("AladdinCRVZap", config.acrvZap, deployer);
    console.log("Found AladdinCRVZap at:", acrvZap.address);
  } else {
    const AladdinCRVZap = await ethers.getContractFactory("AladdinCRVZap", deployer);
    acrvZap = await AladdinCRVZap.deploy();
    await acrvZap.deployed();
    console.log("Deploy AladdinCRVZap at:", acrvZap.address);
  }

  if (config.vaultZap) {
    vaultZap = await ethers.getContractAt("AladdinConvexVaultZap", config.vaultZap, deployer);
    console.log("Found AladdinConvexVaultZap at:", vaultZap.address);
  } else {
    const AladdinConvexVaultZap = await ethers.getContractFactory("AladdinConvexVaultZap", deployer);
    vaultZap = await AladdinConvexVaultZap.deploy();
    await vaultZap.deployed();
    console.log("Deploy AladdinConvexVaultZap at:", vaultZap.address);
  }

  if (config.acrv) {
    acrv = await ethers.getContractAt("AladdinCRV", config.acrv, deployer);
    console.log("Found AladdinCRV at:", acrv.address);
  } else {
    const AladdinCRV = await ethers.getContractFactory("AladdinCRV", deployer);
    const acrvImpl = await AladdinCRV.deploy();
    await acrvImpl.deployed();
    console.log("Deploy AladdinCRV Impl at:", acrvImpl.address);

    const data = acrvImpl.interface.encodeFunctionData("initialize", [
      acrvZap.address,
      PLATFORM,
      ACRV_WITHDRAW_FEE_PERCENTAGE,
      ACRV_PLATFORM_FEE_PERCENTAGE,
      ACRV_HARVEST_BOUNTY_PERCENTAGE,
    ]);
    const TransparentUpgradeableProxy = await ethers.getContractFactory("TransparentUpgradeableProxy", deployer);
    const proxy = await TransparentUpgradeableProxy.deploy(acrvImpl.address, proxyAdmin.address, data);
    await proxy.deployed();
    acrv = await ethers.getContractAt("AladdinCRV", proxy.address, deployer);
    console.log("Deploy AladdinCRV at:", acrv.address);
  }

  if (config.vault) {
    vault = await ethers.getContractAt("AladdinConvexVault", config.vault, deployer);
    console.log("Found AladdinConvexVault at:", vault.address);
  } else {
    const AladdinConvexVault = await ethers.getContractFactory("AladdinConvexVault", deployer);
    const vaultImpl = await AladdinConvexVault.deploy();
    console.log("Deploy AladdinConvexVault Impl at:", vaultImpl.address);

    const data = vaultImpl.interface.encodeFunctionData("initialize", [acrv.address, vaultZap.address, PLATFORM]);
    const TransparentUpgradeableProxy = await ethers.getContractFactory("TransparentUpgradeableProxy", deployer);
    const proxy = await TransparentUpgradeableProxy.deploy(vaultImpl.address, proxyAdmin.address, data);
    await proxy.deployed();
    vault = await ethers.getContractAt("AladdinConvexVault", proxy.address, deployer);
    console.log("Deploy AladdinConvexVault at:", vault.address);
  }

  if (config.aladdinZap) {
    aladdinZap = await ethers.getContractAt("AladdinZap", config.aladdinZap, deployer);
    console.log("Found AladdinZap at:", aladdinZap.address);
  } else {
    const AladdinZap = await ethers.getContractFactory("AladdinZap", deployer);
    const impl = await AladdinZap.deploy();
    await impl.deployed();
    console.log("Deploy AladdinZap Impl at:", impl.address);

    const data = impl.interface.encodeFunctionData("initialize");
    const TransparentUpgradeableProxy = await ethers.getContractFactory("TransparentUpgradeableProxy", deployer);
    const proxy = await TransparentUpgradeableProxy.deploy(impl.address, proxyAdmin.address, data);
    await proxy.deployed();
    aladdinZap = await ethers.getContractAt("AladdinZap", proxy.address, deployer);
    console.log("Deploy AladdinZap at:", proxy.address);
  }

  await addVaults();
  await setupRouteForAladdinZap();
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
