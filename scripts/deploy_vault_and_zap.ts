/* eslint-disable node/no-missing-import */
import { ethers } from "hardhat";
import { Action, encodePoolHintV2, PoolType } from "../test/utils";
import { AladdinConvexVault, AladdinZap } from "../typechain";

// pid = 0
const CURVE_STETH_POOL = "0xDC24316b9AE028F1497c275EB9192a3Ea0f67022";
const CURVE_STETH_TOKEN = "0x06325440D014e39736583c165C2963BA99fAf14E";
// pid = 1
const CURVE_FRAX3CRV_POOL = "0xd632f22692FaC7611d2AA1C0D552930D43CAEd3B";
const CURVE_FRAX3CRV_TOKEN = "0xd632f22692FaC7611d2AA1C0D552930D43CAEd3B";
// pid = 2
const CURVE_TRICRYPTO_POOL = "0xD51a44d3FaE010294C616388b506AcdA1bfAAE46";
const CURVE_TRICRYPTO_TOKEN = "0xc4AD29ba4B3c580e6D59105FFf484999997675Ff";
// pid = 3
const CURVE_CVXCRV_POOL = "0x9D0464996170c6B9e75eED71c68B99dDEDf279e8";
const CURVE_CVXCRV_TOKEN = "0x9D0464996170c6B9e75eED71c68B99dDEDf279e8";
// pid = 4
const CURVE_CRVETH_POOL = "0x8301AE4fc9c624d1D396cbDAa1ed877821D7C511";
const CURVE_CRVETH_TOKEN = "0xEd4064f376cB8d68F770FB1Ff088a3d0F3FF5c4d";
// pid = 5
const CURVE_CVXETH_POOL = "0xB576491F1E6e5E62f1d8F26062Ee822B40B0E0d4";
const CURVE_CVXETH_TOKEN = "0x3A283D9c08E8b55966afb64C515f5143cf907611";
// pid = 6
const CURVE_CVXFXS_POOL = "0xd658A338613198204DCa1143Ac3F01A722b5d94A";
const CURVE_CVXFXS_TOKEN = "0xF3A43307DcAFa93275993862Aae628fCB50dC768";
// pid = 7
const CURVE_TRICRV_POOL = "0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7";
const CURVE_TRICRV_TOKEN = "0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490";
// pid = 8
const CURVE_UST_WORMHOLE_POOL = "0xCEAF7747579696A2F0bb206a14210e3c9e6fB269";
const CURVE_UST_WORMHOLE_TOKEN = "0xCEAF7747579696A2F0bb206a14210e3c9e6fB269";
// pid = 9
const CURVE_ROCKETETH_POOL = "0x447Ddd4960d9fdBF6af9a790560d0AF76795CB08";
const CURVE_ROCKETETH_TOKEN = "0x447Ddd4960d9fdBF6af9a790560d0AF76795CB08";

const STETH = "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84";
const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
const FRAX = "0x853d955aCEf822Db058eb8505911ED77F175b99e";
const TRICRV = "0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490";
const DAI = "0x6B175474E89094C44Da98b954EedeAC495271d0F";
const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const USDT = "0xdAC17F958D2ee523a2206206994597C13D831ec7";
const WBTC = "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599";
const FXS = "0x3432B6A60D23Ca0dFCa7761B7ab56459D9C964D0";
const CVXFXS = "0xFEEf77d3f69374f66429C91d732A244f074bdf74";
const CRV = "0xD533a949740bb3306d119CC777fa900bA034cd52";
const CVXCRV = "0x62B9c7356A2Dc64a1969e19C23e4f579F9810Aa7";
const CVX = "0x4e3FBD56CD56c3e72c1403e103b45Db9da5B9D2B";
const LDO = "0x5A98FcBEA516Cf06857215779Fd812CA3beF1B32";
const rETH = "0xae78736Cd615f374D3085123A210448E74Fc6393";
const wstETH = "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0";
const UST_WORMHOLE = "0xa693B19d2931d498c5B318dF961919BB4aee87a5";

async function setupRoutes(zap: AladdinZap) {
  console.log("update pool tokens");
  await zap.updatePoolTokens(
    [
      CURVE_STETH_POOL,
      CURVE_FRAX3CRV_POOL,
      CURVE_TRICRYPTO_POOL,
      CURVE_CVXCRV_POOL,
      CURVE_CRVETH_POOL,
      CURVE_CVXETH_POOL,
      CURVE_CVXFXS_POOL,
      CURVE_TRICRV_POOL,
      CURVE_UST_WORMHOLE_POOL,
      CURVE_ROCKETETH_POOL,
    ],
    [
      CURVE_STETH_TOKEN,
      CURVE_FRAX3CRV_TOKEN,
      CURVE_TRICRYPTO_TOKEN,
      CURVE_CVXCRV_TOKEN,
      CURVE_CRVETH_TOKEN,
      CURVE_CVXETH_TOKEN,
      CURVE_CVXFXS_TOKEN,
      CURVE_TRICRV_TOKEN,
      CURVE_UST_WORMHOLE_TOKEN,
      CURVE_ROCKETETH_TOKEN,
    ]
  );
  // steth
  console.log("update WETH => CURVE_STETH AddLiquidity routes");
  await zap.updateRoute(WETH, CURVE_STETH_TOKEN, [
    encodePoolHintV2(CURVE_STETH_POOL, PoolType.CurveETHPool, 2, 0, 0, Action.AddLiquidity),
  ]);
  console.log("update STETH => CURVE_STETH AddLiquidity routes");
  await zap.updateRoute(STETH, CURVE_STETH_TOKEN, [
    encodePoolHintV2(CURVE_STETH_POOL, PoolType.CurveETHPool, 2, 1, 1, Action.AddLiquidity),
  ]);
  console.log("update CURVE_STETH => WETH RemoveLiquidity routes");
  await zap.updateRoute(CURVE_STETH_TOKEN, WETH, [
    encodePoolHintV2(CURVE_STETH_POOL, PoolType.CurveETHPool, 2, 0, 0, Action.RemoveLiquidity),
  ]);
  console.log("update CURVE_STETH => STETH RemoveLiquidity routes");
  await zap.updateRoute(CURVE_STETH_TOKEN, STETH, [
    encodePoolHintV2(CURVE_STETH_POOL, PoolType.CurveETHPool, 2, 1, 1, Action.RemoveLiquidity),
  ]);
  // frax
  console.log("update FRAX => CURVE_FRAX3CRV AddLiquidity routes");
  await zap.updateRoute(FRAX, CURVE_FRAX3CRV_TOKEN, [
    encodePoolHintV2(CURVE_FRAX3CRV_POOL, PoolType.CurveFactoryMetaPool, 2, 0, 0, Action.AddLiquidity),
  ]);
  console.log("update 3CRV => CURVE_FRAX3CRV AddLiquidity routes");
  await zap.updateRoute(TRICRV, CURVE_FRAX3CRV_TOKEN, [
    encodePoolHintV2(CURVE_FRAX3CRV_POOL, PoolType.CurveFactoryMetaPool, 2, 1, 1, Action.AddLiquidity),
  ]);
  console.log("update DAI => CURVE_FRAX3CRV AddLiquidity routes");
  await zap.updateRoute(DAI, CURVE_FRAX3CRV_TOKEN, [
    encodePoolHintV2(CURVE_FRAX3CRV_POOL, PoolType.CurveFactoryUSDMetaPoolUnderlying, 4, 1, 1, Action.AddLiquidity),
  ]);
  console.log("update USDC => CURVE_FRAX3CRV AddLiquidity routes");
  await zap.updateRoute(USDC, CURVE_FRAX3CRV_TOKEN, [
    encodePoolHintV2(CURVE_FRAX3CRV_POOL, PoolType.CurveFactoryUSDMetaPoolUnderlying, 4, 2, 2, Action.AddLiquidity),
  ]);
  console.log("update USDT => CURVE_FRAX3CRV AddLiquidity routes");
  await zap.updateRoute(USDT, CURVE_FRAX3CRV_TOKEN, [
    encodePoolHintV2(CURVE_FRAX3CRV_POOL, PoolType.CurveFactoryUSDMetaPoolUnderlying, 4, 3, 3, Action.AddLiquidity),
  ]);
  console.log("update CURVE_FRAX3CRV => FRAX RemoveLiquidity routes");
  await zap.updateRoute(CURVE_FRAX3CRV_TOKEN, FRAX, [
    encodePoolHintV2(CURVE_FRAX3CRV_POOL, PoolType.CurveFactoryMetaPool, 2, 0, 0, Action.RemoveLiquidity),
  ]);
  console.log("update CURVE_FRAX3CRV => 3CRV RemoveLiquidity routes");
  await zap.updateRoute(CURVE_FRAX3CRV_TOKEN, TRICRV, [
    encodePoolHintV2(CURVE_FRAX3CRV_POOL, PoolType.CurveFactoryMetaPool, 2, 1, 1, Action.RemoveLiquidity),
  ]);
  console.log("update CURVE_FRAX3CRV => DAI RemoveLiquidity routes");
  await zap.updateRoute(CURVE_FRAX3CRV_TOKEN, DAI, [
    encodePoolHintV2(CURVE_FRAX3CRV_POOL, PoolType.CurveFactoryUSDMetaPoolUnderlying, 4, 1, 1, Action.RemoveLiquidity),
  ]);
  console.log("update CURVE_FRAX3CRV => USDC RemoveLiquidity routes");
  await zap.updateRoute(CURVE_FRAX3CRV_TOKEN, USDC, [
    encodePoolHintV2(CURVE_FRAX3CRV_POOL, PoolType.CurveFactoryUSDMetaPoolUnderlying, 4, 2, 2, Action.RemoveLiquidity),
  ]);
  console.log("update CURVE_FRAX3CRV => USDT RemoveLiquidity routes");
  await zap.updateRoute(CURVE_FRAX3CRV_TOKEN, USDT, [
    encodePoolHintV2(CURVE_FRAX3CRV_POOL, PoolType.CurveFactoryUSDMetaPoolUnderlying, 4, 3, 3, Action.RemoveLiquidity),
  ]);
  // tricrypto2
  console.log("update USDT => CURVE_TRICRYPTO AddLiquidity routes");
  await zap.updateRoute(USDT, CURVE_TRICRYPTO_TOKEN, [
    encodePoolHintV2(CURVE_TRICRYPTO_POOL, PoolType.CurveTriCryptoPool, 3, 0, 0, Action.AddLiquidity),
  ]);
  console.log("update WBTC => CURVE_TRICRYPTO AddLiquidity routes");
  await zap.updateRoute(WBTC, CURVE_TRICRYPTO_TOKEN, [
    encodePoolHintV2(CURVE_TRICRYPTO_POOL, PoolType.CurveTriCryptoPool, 3, 1, 1, Action.AddLiquidity),
  ]);
  console.log("update WETH => CURVE_TRICRYPTO AddLiquidity routes");
  await zap.updateRoute(WETH, CURVE_TRICRYPTO_TOKEN, [
    encodePoolHintV2(CURVE_TRICRYPTO_POOL, PoolType.CurveTriCryptoPool, 3, 2, 2, Action.AddLiquidity),
  ]);
  console.log("update CURVE_TRICRYPTO => USDT RemoveLiquidity routes");
  await zap.updateRoute(CURVE_TRICRYPTO_TOKEN, USDT, [
    encodePoolHintV2(CURVE_TRICRYPTO_POOL, PoolType.CurveTriCryptoPool, 3, 0, 0, Action.RemoveLiquidity),
  ]);
  console.log("update CURVE_TRICRYPTO => WBTC RemoveLiquidity routes");
  await zap.updateRoute(CURVE_TRICRYPTO_TOKEN, WBTC, [
    encodePoolHintV2(CURVE_TRICRYPTO_POOL, PoolType.CurveTriCryptoPool, 3, 1, 1, Action.RemoveLiquidity),
  ]);
  console.log("update CURVE_TRICRYPTO => WETH RemoveLiquidity routes");
  await zap.updateRoute(CURVE_TRICRYPTO_TOKEN, WETH, [
    encodePoolHintV2(CURVE_TRICRYPTO_POOL, PoolType.CurveTriCryptoPool, 3, 2, 2, Action.RemoveLiquidity),
  ]);
  // cvxcrv
  console.log("update CRV => CURVE_CVXCRV AddLiquidity routes");
  await zap.updateRoute(CRV, CURVE_CVXCRV_TOKEN, [
    encodePoolHintV2(CURVE_CVXCRV_POOL, PoolType.CurveBasePool, 2, 0, 0, Action.AddLiquidity),
  ]);
  console.log("update CVXCRV => CURVE_CVXCRV AddLiquidity routes");
  await zap.updateRoute(CVXCRV, CURVE_CVXCRV_TOKEN, [
    encodePoolHintV2(CURVE_CVXCRV_POOL, PoolType.CurveBasePool, 2, 1, 1, Action.AddLiquidity),
  ]);
  console.log("update CURVE_CVXCRV_TOKEN => CRV RemoveLiquidity routes");
  await zap.updateRoute(CURVE_CVXCRV_TOKEN, CRV, [
    encodePoolHintV2(CURVE_CVXCRV_POOL, PoolType.CurveFactoryPlainPool, 2, 0, 0, Action.RemoveLiquidity),
  ]);
  console.log("update CURVE_CVXCRV_TOKEN => CVXCRV RemoveLiquidity routes");
  await zap.updateRoute(CURVE_CVXCRV_TOKEN, CVXCRV, [
    encodePoolHintV2(CURVE_CVXCRV_POOL, PoolType.CurveFactoryPlainPool, 2, 1, 1, Action.RemoveLiquidity),
  ]);
  // crveth
  console.log("update WETH => CURVE_CRVETH AddLiquidity routes");
  await zap.updateRoute(WETH, CURVE_CRVETH_TOKEN, [
    encodePoolHintV2(CURVE_CRVETH_POOL, PoolType.CurveCryptoPool, 2, 0, 0, Action.AddLiquidity),
  ]);
  console.log("update CRV => CURVE_CRVETH AddLiquidity routes");
  await zap.updateRoute(CRV, CURVE_CRVETH_TOKEN, [
    encodePoolHintV2(CURVE_CRVETH_POOL, PoolType.CurveCryptoPool, 2, 1, 1, Action.AddLiquidity),
  ]);
  console.log("update CURVE_CRVETH => WETH RemoveLiquidity routes");
  await zap.updateRoute(CURVE_CRVETH_TOKEN, WETH, [
    encodePoolHintV2(CURVE_CRVETH_POOL, PoolType.CurveCryptoPool, 2, 0, 0, Action.RemoveLiquidity),
  ]);
  console.log("update CURVE_CRVETH => CRV RemoveLiquidity routes");
  await zap.updateRoute(CURVE_CRVETH_TOKEN, CRV, [
    encodePoolHintV2(CURVE_CRVETH_POOL, PoolType.CurveCryptoPool, 2, 1, 1, Action.RemoveLiquidity),
  ]);
  // cvxeth
  console.log("update WETH => CURVE_CVXETH AddLiquidity routes");
  await zap.updateRoute(WETH, CURVE_CVXETH_TOKEN, [
    encodePoolHintV2(CURVE_CVXETH_POOL, PoolType.CurveCryptoPool, 2, 0, 0, Action.AddLiquidity),
  ]);
  console.log("update CVX => CURVE_CVXETH AddLiquidity routes");
  await zap.updateRoute(CVX, CURVE_CVXETH_TOKEN, [
    encodePoolHintV2(CURVE_CVXETH_POOL, PoolType.CurveCryptoPool, 2, 1, 1, Action.AddLiquidity),
  ]);
  console.log("update CURVE_CVXETH => WETH RemoveLiquidity routes");
  await zap.updateRoute(CURVE_CVXETH_TOKEN, WETH, [
    encodePoolHintV2(CURVE_CVXETH_POOL, PoolType.CurveCryptoPool, 2, 0, 0, Action.RemoveLiquidity),
  ]);
  console.log("update CURVE_CVXETH => CVX RemoveLiquidity routes");
  await zap.updateRoute(CURVE_CVXETH_TOKEN, CVX, [
    encodePoolHintV2(CURVE_CVXETH_POOL, PoolType.CurveCryptoPool, 2, 1, 1, Action.RemoveLiquidity),
  ]);
  // cvxfxs
  console.log("update FXS => CURVE_CVXFXS AddLiquidity routes");
  await zap.updateRoute(FXS, CURVE_CVXFXS_TOKEN, [
    encodePoolHintV2(CURVE_CVXFXS_POOL, PoolType.CurveCryptoPool, 2, 0, 0, Action.AddLiquidity),
  ]);
  console.log("update CVXFXS => CURVE_CVXFXS AddLiquidity routes");
  await zap.updateRoute(CVXFXS, CURVE_CVXFXS_TOKEN, [
    encodePoolHintV2(CURVE_CVXFXS_POOL, PoolType.CurveCryptoPool, 2, 1, 1, Action.AddLiquidity),
  ]);
  console.log("update CVXFXS => FXS RemoveLiquidity routes");
  await zap.updateRoute(CURVE_CVXFXS_TOKEN, FXS, [
    encodePoolHintV2(CURVE_CVXFXS_POOL, PoolType.CurveCryptoPool, 2, 0, 0, Action.RemoveLiquidity),
  ]);
  console.log("update CVXFXS => CVXFXS RemoveLiquidity routes");
  await zap.updateRoute(CURVE_CVXFXS_TOKEN, CVXFXS, [
    encodePoolHintV2(CURVE_CVXFXS_POOL, PoolType.CurveCryptoPool, 2, 1, 1, Action.RemoveLiquidity),
  ]);
  // 3pool
  console.log("update DAI => CURVE_TRICRV AddLiquidity routes");
  await zap.updateRoute(DAI, CURVE_TRICRV_TOKEN, [
    encodePoolHintV2(CURVE_TRICRV_POOL, PoolType.CurveBasePool, 3, 0, 0, Action.AddLiquidity),
  ]);
  console.log("update USDC => CURVE_TRICRV AddLiquidity routes");
  await zap.updateRoute(USDC, CURVE_TRICRV_TOKEN, [
    encodePoolHintV2(CURVE_TRICRV_POOL, PoolType.CurveBasePool, 3, 1, 1, Action.AddLiquidity),
  ]);
  console.log("update USDT => CURVE_TRICRV AddLiquidity routes");
  await zap.updateRoute(USDT, CURVE_TRICRV_TOKEN, [
    encodePoolHintV2(CURVE_TRICRV_POOL, PoolType.CurveBasePool, 3, 2, 2, Action.AddLiquidity),
  ]);
  console.log("update CURVE_TRICRV => DAI RemoveLiquidity routes");
  await zap.updateRoute(CURVE_TRICRV_TOKEN, DAI, [
    encodePoolHintV2(CURVE_TRICRV_POOL, PoolType.CurveBasePool, 2, 0, 0, Action.RemoveLiquidity),
  ]);
  console.log("update CURVE_TRICRV => USDC RemoveLiquidity routes");
  await zap.updateRoute(CURVE_TRICRV_TOKEN, USDC, [
    encodePoolHintV2(CURVE_TRICRV_POOL, PoolType.CurveBasePool, 2, 1, 1, Action.RemoveLiquidity),
  ]);
  console.log("update CURVE_TRICRV => USDT RemoveLiquidity routes");
  await zap.updateRoute(CURVE_TRICRV_TOKEN, USDT, [
    encodePoolHintV2(CURVE_TRICRV_POOL, PoolType.CurveBasePool, 2, 2, 2, Action.RemoveLiquidity),
  ]);
  // weth => crv using CurveCryptoPool
  console.log("update WETH => CRV Swap routes");
  await zap.updateRoute(WETH, CRV, [
    encodePoolHintV2(CURVE_CRVETH_POOL, PoolType.CurveCryptoPool, 2, 0, 1, Action.Swap),
  ]);
  // cvx => weth using CurveCryptoPool
  console.log("update CVX => WETH Swap routes");
  await zap.updateRoute(CVX, WETH, [
    encodePoolHintV2(CURVE_CVXETH_POOL, PoolType.CurveCryptoPool, 2, 1, 0, Action.Swap),
  ]);
  // ldo => weth using UniswapV2
  console.log("update LDO => WETH Swap routes");
  await zap.updateRoute(LDO, WETH, [
    encodePoolHintV2("0xC558F600B34A5f69dD2f0D06Cb8A88d829B7420a", PoolType.UniswapV2, 2, 0, 1, Action.Swap),
  ]);
  // fxs => weth using UniswapV2
  console.log("update FXS => WETH Swap routes");
  await zap.updateRoute(FXS, WETH, [
    encodePoolHintV2("0x61eB53ee427aB4E007d78A9134AaCb3101A2DC23", PoolType.UniswapV2, 2, 0, 1, Action.Swap),
  ]);
  /*
  // ust(wormhole)
  console.log("update UST_WORMHOLE => CURVE_UST_WORMHOLE AddLiquidity routes");
  await zap.updateRoute(UST_WORMHOLE, CURVE_UST_WORMHOLE_TOKEN, [
    encodePoolHintV2(CURVE_UST_WORMHOLE_POOL, PoolType.CurveFactoryMetaPool, 2, 0, 0, Action.AddLiquidity),
  ]);
  console.log("update 3CRV => CURVE_UST_WORMHOLE AddLiquidity routes");
  await zap.updateRoute(TRICRV, CURVE_UST_WORMHOLE_TOKEN, [
    encodePoolHintV2(CURVE_UST_WORMHOLE_POOL, PoolType.CurveFactoryMetaPool, 2, 1, 1, Action.AddLiquidity),
  ]);
  console.log("update DAI => CURVE_UST_WORMHOLE AddLiquidity routes");
  await zap.updateRoute(DAI, CURVE_UST_WORMHOLE_TOKEN, [
    encodePoolHintV2(CURVE_UST_WORMHOLE_POOL, PoolType.CurveFactoryUSDMetaPoolUnderlying, 4, 1, 1, Action.AddLiquidity),
  ]);
  console.log("update USDC => CURVE_UST_WORMHOLE AddLiquidity routes");
  await zap.updateRoute(USDC, CURVE_UST_WORMHOLE_TOKEN, [
    encodePoolHintV2(CURVE_UST_WORMHOLE_POOL, PoolType.CurveFactoryUSDMetaPoolUnderlying, 4, 2, 2, Action.AddLiquidity),
  ]);
  console.log("update USDT => CURVE_UST_WORMHOLE AddLiquidity routes");
  await zap.updateRoute(USDT, CURVE_UST_WORMHOLE_TOKEN, [
    encodePoolHintV2(CURVE_UST_WORMHOLE_POOL, PoolType.CurveFactoryUSDMetaPoolUnderlying, 4, 3, 3, Action.AddLiquidity),
  ]);
  console.log("update CURVE_UST_WORMHOLE => UST_WORMHOLE RemoveLiquidity routes");
  await zap.updateRoute(CURVE_UST_WORMHOLE_TOKEN, UST_WORMHOLE, [
    encodePoolHintV2(CURVE_UST_WORMHOLE_POOL, PoolType.CurveFactoryMetaPool, 2, 0, 0, Action.RemoveLiquidity),
  ]);
  console.log("update CURVE_UST_WORMHOLE => 3CRV RemoveLiquidity routes");
  await zap.updateRoute(CURVE_UST_WORMHOLE_TOKEN, TRICRV, [
    encodePoolHintV2(CURVE_UST_WORMHOLE_POOL, PoolType.CurveFactoryMetaPool, 2, 1, 1, Action.RemoveLiquidity),
  ]);
  console.log("update CURVE_UST_WORMHOLE => DAI RemoveLiquidity routes");
  await zap.updateRoute(CURVE_UST_WORMHOLE_TOKEN, DAI, [
    encodePoolHintV2(
      CURVE_UST_WORMHOLE_POOL,
      PoolType.CurveFactoryUSDMetaPoolUnderlying,
      4,
      1,
      1,
      Action.RemoveLiquidity
    ),
  ]);
  console.log("update CURVE_UST_WORMHOLE => USDC RemoveLiquidity routes");
  await zap.updateRoute(CURVE_UST_WORMHOLE_TOKEN, USDC, [
    encodePoolHintV2(
      CURVE_UST_WORMHOLE_POOL,
      PoolType.CurveFactoryUSDMetaPoolUnderlying,
      4,
      2,
      2,
      Action.RemoveLiquidity
    ),
  ]);
  console.log("update CURVE_UST_WORMHOLE => USDT RemoveLiquidity routes");
  await zap.updateRoute(CURVE_UST_WORMHOLE_TOKEN, USDT, [
    encodePoolHintV2(
      CURVE_UST_WORMHOLE_POOL,
      PoolType.CurveFactoryUSDMetaPoolUnderlying,
      4,
      3,
      3,
      Action.RemoveLiquidity
    ),
  ]);
  // rocket pool
  console.log("update rETH => CURVE_ROCKETETH AddLiquidity routes");
  await zap.updateRoute(rETH, CURVE_ROCKETETH_TOKEN, [
    encodePoolHintV2(CURVE_ROCKETETH_POOL, PoolType.CurveFactoryPlainPool, 2, 0, 0, Action.AddLiquidity),
  ]);
  console.log("update wstETH => CURVE_ROCKETETH AddLiquidity routes");
  await zap.updateRoute(wstETH, CURVE_ROCKETETH_TOKEN, [
    encodePoolHintV2(CURVE_ROCKETETH_POOL, PoolType.CurveFactoryPlainPool, 2, 1, 1, Action.AddLiquidity),
  ]);
  console.log("update CURVE_ROCKETETH => rETH RemoveLiquidity routes");
  await zap.updateRoute(CURVE_ROCKETETH_TOKEN, rETH, [
    encodePoolHintV2(CURVE_ROCKETETH_POOL, PoolType.CurveFactoryPlainPool, 2, 0, 0, Action.RemoveLiquidity),
  ]);
  console.log("update CURVE_ROCKETETH => wstETH RemoveLiquidity routes");
  await zap.updateRoute(CURVE_ROCKETETH_TOKEN, wstETH, [
    encodePoolHintV2(CURVE_ROCKETETH_POOL, PoolType.CurveFactoryPlainPool, 2, 1, 1, Action.RemoveLiquidity),
  ]);*/
}

const VAULTS: {
  name: string;
  convexId: number;
  rewards: string[];
  withdrawFee: number;
  harvestBounty: number;
  platformFee: number;
}[] = [
  // 3pool, 0.01% withdraw fee, 1% harvest bounty, 1% platform fee
  { name: "3pool", convexId: 9, rewards: [CVX, CRV], withdrawFee: 1e5, harvestBounty: 1e7, platformFee: 1e7 },
  // ust-wormhole, 0.05% withdraw fee, 1% harvest bounty, 1% platform fee
  { name: "ust-wormhole", convexId: 59, rewards: [CVX, CRV], withdrawFee: 5e5, harvestBounty: 1e7, platformFee: 1e7 },
  // RocketPoolETH, 0.05% withdraw fee, 1% harvest bounty, 1% platform fee
  { name: "RocketPoolETH", convexId: 73, rewards: [CVX, CRV], withdrawFee: 5e5, harvestBounty: 1e7, platformFee: 1e7 },
];

async function addVaults(vault: AladdinConvexVault) {
  for (const { convexId, rewards, withdrawFee, harvestBounty, platformFee } of VAULTS) {
    console.log("Adding pool with pid:", convexId, "rewards:", rewards.join("/"));
    const tx = await vault.addPool(convexId, rewards, withdrawFee, platformFee, harvestBounty);
    console.log("wait for tx:", tx.hash);
    await tx.wait();
    console.log("Added with tx:", tx.hash);
  }
}

async function main() {
  const [deployer] = await ethers.getSigners();

  const AladdinConvexVault = await ethers.getContractFactory("AladdinConvexVault", deployer);
  const vaultImpl = await AladdinConvexVault.deploy();
  await vaultImpl.deployed();
  console.log("Deploy AladdinConvexVault Impl at:", vaultImpl.address);

  const proxyAdmin = await ethers.getContractAt("ProxyAdmin", "0x12b1326459d72F2Ab081116bf27ca46cD97762A0", deployer);
  console.log("Found ProxyAdmin at:", proxyAdmin.address);

  const vault = await ethers.getContractAt(
    "AladdinConvexVault",
    "0xc8fF37F7d057dF1BB9Ad681b53Fa4726f268E0e8",
    deployer
  );
  console.log("Found AladdinConvexVault at:", vault.address);

  await proxyAdmin.upgrade(vault.address, vaultImpl.address);

  // const AladdinZap = await ethers.getContractFactory("AladdinZap", deployer);
  // const zap = await AladdinZap.deploy();
  // await zap.deployed();
  // console.log("Deploy AladdinZap at:", zap.address);

  // await vault.updateZap(zap.address);
  // await setupRoutes(zap);
  // await addVaults(vault);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
