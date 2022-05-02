/* eslint-disable node/no-missing-import */
import { BigNumber } from "ethers";
import { Action, encodePoolHintV2, PoolType } from "../test/utils";

export const ADDRESS: { [name: string]: string } = {
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
  UST_TERRA: "0xa47c8bf37f92aBed4A126BDA807A7b7498661acD",
  LYRA: "0x01BA67AAC7f75f647D94220Cc98FB30FCc5105Bf",
  SNX: "0xC011a73ee8576Fb46F5E1c5751cA3B9Fe0af2a6F",
  GRO: "0x3Ec8798B81485A254928B70CDA1cf0A2BB0B74D7",
  FLX: "0x6243d8CEA23066d098a15582d81a598b4e8391F4",
  ANGLE: "0x31429d1856aD1377A8A0079410B297e1a9e214c2",
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
  // Uniswap V2 pool
  LDO_WETH_UNIV2: "0xC558F600B34A5f69dD2f0D06Cb8A88d829B7420a",
  FXS_WETH_UNIV2: "0x61eB53ee427aB4E007d78A9134AaCb3101A2DC23",
  FXS_FRAX_UNIV2: "0xE1573B9D29e2183B1AF0e743Dc2754979A40D237",
  WETH_ALCX_UNIV2: "0xC3f279090a47e80990Fe3a9c30d24Cb117EF91a8",
  SPELL_WETH_UNIV2: "0xb5De0C3753b6E1B4dBA616Db82767F17513E6d4E",
  LYRA_WETH_UNIV2: "0x52DaC05FC0000e9F01CE9A1E91592BfbFcE87350",
  GRO_USDC_UNIV2: "0x21C5918CcB42d20A2368bdCA8feDA0399EbfD2f6",
  FLX_WETH_UNIV2: "0xd6F3768E62Ef92a9798E5A8cEdD2b78907cEceF9",
  ANGLE_WETH_UNIV2: "0xFb55AF0ef0DcdeC92Bd3752E7a9237dfEfB8AcC0",
  // Uniswap V3 pool
  USDC_WETH_UNIV3: "0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640",
  USDC_USDT_UNIV3: "0x3416cF6C708Da44DB2624D63ea0AAef7113527C6",
  WETH_USDT_UNIV3: "0x4e68Ccd3E89f51C3074ca5072bbAC773960dFa36",
  USDC_UST_TERRA_UNIV3: "0x18D96B617a3e5C42a2Ada4bC5d1B48e223f17D0D",
  USDC_UST_WORMHOLE_UNIV3: "0xA87B2FF0759f5B82c7EC86444A70f25C6BfFCCbf",
  FRAX_USDC_UNIV3: "0xc63B0708E2F7e69CB8A1df0e1389A98C35A76D52",
  // Balancer V2
  SNX_WETH_BALANCER: "0x072f14B85ADd63488DDaD88f855Fda4A99d6aC9B",
};

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

export const ZAP_SWAP_ROUNTES: { from: string; to: string; routes: BigNumber[] }[] = [
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
    routes: [encodePoolHintV2(ADDRESS.LDO_WETH_UNIV2, PoolType.UniswapV2, 2, 0, 1, Action.Swap)],
  },
  {
    from: "FXS",
    to: "WETH",
    routes: [encodePoolHintV2(ADDRESS.FXS_WETH_UNIV2, PoolType.UniswapV2, 2, 0, 1, Action.Swap)],
  },
  {
    from: "CVXCRV", // cvxCRV => CRV => WETH => CVX
    to: "CVX",
    routes: [
      encodePoolHintV2(ADDRESS.CURVE_CVXCRV_POOL, PoolType.CurveFactoryPlainPool, 2, 1, 0, Action.Swap),
      encodePoolHintV2(ADDRESS.CURVE_CRVETH_POOL, PoolType.CurveCryptoPool, 2, 1, 0, Action.Swap),
      encodePoolHintV2(ADDRESS.CURVE_CVXETH_POOL, PoolType.CurveCryptoPool, 2, 0, 1, Action.Swap),
    ],
  },
  {
    from: "FXS", // FXS ==(Sushi)==> WETH == (CurveV2) => CVX
    to: "CVX",
    routes: [
      encodePoolHintV2(ADDRESS.FXS_WETH_UNIV2, PoolType.UniswapV2, 2, 0, 1, Action.Swap),
      encodePoolHintV2(ADDRESS.CURVE_CVXETH_POOL, PoolType.CurveCryptoPool, 2, 0, 1, Action.Swap),
    ],
  },
  {
    from: "UST_WORMHOLE", // UST ==(UniV3)==> USDC ==(UniV3)==> WETH ==(CurveV2)=> CVX
    to: "CVX",
    routes: [
      encodePoolHintV2(ADDRESS.USDC_UST_WORMHOLE_UNIV3, PoolType.UniswapV3, 2, 1, 0, Action.Swap),
      encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 0, 1, Action.Swap),
      encodePoolHintV2(ADDRESS.CURVE_CVXETH_POOL, PoolType.CurveCryptoPool, 2, 0, 1, Action.Swap),
    ],
  },
  {
    from: "LDO", // LDO ==(Sushi)==> WETH == (CurveV2) => CVX
    to: "CVX",
    routes: [
      encodePoolHintV2(ADDRESS.LDO_WETH_UNIV2, PoolType.UniswapV2, 2, 0, 1, Action.Swap),
      encodePoolHintV2(ADDRESS.CURVE_CVXETH_POOL, PoolType.CurveCryptoPool, 2, 0, 1, Action.Swap),
    ],
  },
  {
    from: "ALCX", // ALCX ==(Sushi)==> WETH == (CurveV2) => CVX
    to: "CVX",
    routes: [
      encodePoolHintV2(ADDRESS.WETH_ALCX_UNIV2, PoolType.UniswapV2, 2, 1, 0, Action.Swap),
      encodePoolHintV2(ADDRESS.CURVE_CVXETH_POOL, PoolType.CurveCryptoPool, 2, 0, 1, Action.Swap),
    ],
  },
  {
    from: "SPELL", // SPELL ==(Sushi)==> WETH == (CurveV2) => CVX
    to: "CVX",
    routes: [
      encodePoolHintV2(ADDRESS.SPELL_WETH_UNIV2, PoolType.UniswapV2, 2, 0, 1, Action.Swap),
      encodePoolHintV2(ADDRESS.CURVE_CVXETH_POOL, PoolType.CurveCryptoPool, 2, 0, 1, Action.Swap),
    ],
  },
  {
    from: "LYRA", // LYRA ==(Sushi)==> WETH == (CurveV2) => CVX
    to: "CVX",
    routes: [
      encodePoolHintV2(ADDRESS.LYRA_WETH_UNIV2, PoolType.UniswapV2, 2, 0, 1, Action.Swap),
      encodePoolHintV2(ADDRESS.CURVE_CVXETH_POOL, PoolType.CurveCryptoPool, 2, 0, 1, Action.Swap),
    ],
  },
  {
    from: "SNX", // SNX ==(Balancer)==> WETH == (CurveV2) => CVX
    to: "CVX",
    routes: [
      encodePoolHintV2(ADDRESS.SNX_WETH_BALANCER, PoolType.BalancerV2, 2, 0, 1, Action.Swap),
      encodePoolHintV2(ADDRESS.CURVE_CVXETH_POOL, PoolType.CurveCryptoPool, 2, 0, 1, Action.Swap),
    ],
  },
  {
    from: "GRO", // GRO ==(UniV2) ==> USDC ==(UniV3)==> WETH ==(CurveV2)=> CVX
    to: "CVX",
    routes: [
      encodePoolHintV2(ADDRESS.GRO_USDC_UNIV2, PoolType.UniswapV2, 2, 0, 1, Action.Swap),
      encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 0, 1, Action.Swap),
      encodePoolHintV2(ADDRESS.CURVE_CVXETH_POOL, PoolType.CurveCryptoPool, 2, 0, 1, Action.Swap),
    ],
  },
  {
    from: "FLX", // FLX ==(UniV2)==> WETH == (CurveV2) => CVX
    to: "CVX",
    routes: [
      encodePoolHintV2(ADDRESS.FLX_WETH_UNIV2, PoolType.UniswapV2, 2, 0, 1, Action.Swap),
      encodePoolHintV2(ADDRESS.CURVE_CVXETH_POOL, PoolType.CurveCryptoPool, 2, 0, 1, Action.Swap),
    ],
  },
  {
    from: "ANGLE", // ANGLE ==(Sushi)==> WETH == (CurveV2) => CVX
    to: "CVX",
    routes: [
      encodePoolHintV2(ADDRESS.ANGLE_WETH_UNIV2, PoolType.UniswapV2, 2, 0, 1, Action.Swap),
      encodePoolHintV2(ADDRESS.CURVE_CVXETH_POOL, PoolType.CurveCryptoPool, 2, 0, 1, Action.Swap),
    ],
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
};
