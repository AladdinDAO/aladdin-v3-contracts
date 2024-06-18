import assert from "assert";
import { ADDRESS } from "./address";
import { Action, decodePoolV3, encodePoolHintV2, encodePoolHintV3, PoolType, PoolTypeV3 } from "./codec";
import { TOKENS } from "./tokens";
import { toBigInt, ZeroAddress } from "ethers";

export const ZAP_ROUTES: { [from: string]: { [to: string]: bigint[] } } = {
  ALCX: {
    // ALCX ==(UniV2)==> WETH ==(CurveV2)==> CVX
    CVX: [
      encodePoolHintV2(ADDRESS.WETH_ALCX_UNIV2, PoolType.UniswapV2, 2, 1, 0, Action.Swap),
      encodePoolHintV2(ADDRESS.CURVE_CVXETH_POOL, PoolType.CurveCryptoPool, 2, 0, 1, Action.Swap),
    ],
    // ALCX ==(UniV2)==> WETH
    WETH: [
      // ALCX ==(UniV2)==> WETH
      encodePoolHintV2(ADDRESS.WETH_ALCX_UNIV2, PoolType.UniswapV2, 2, 1, 0, Action.Swap),
      /* // ALCX ==(BalancerV2) ==> WETH
      encodePoolHintV2(ADDRESS.WETH_ALCX_BalancerV2, PoolType.BalancerV2, 2, 1, 0, Action.Swap),
      */
    ],
  },
  APEFI: {
    // APEFI ==(UniV2)==> WETH ==(CurveV2)==> CVX
    CVX: [
      encodePoolHintV2(ADDRESS.APEFI_WETH_UNIV2, PoolType.UniswapV2, 2, 0, 1, Action.Swap),
      encodePoolHintV2(ADDRESS.CURVE_CVXETH_POOL, PoolType.CurveCryptoPool, 2, 0, 1, Action.Swap),
    ],
  },
  ANGLE: {
    // ANGLE ==(Sushi)==> WETH ==(CurveV2)==> CVX
    CVX: [
      encodePoolHintV2(ADDRESS.ANGLE_WETH_UNIV2, PoolType.UniswapV2, 2, 0, 1, Action.Swap),
      encodePoolHintV2(ADDRESS.CURVE_CVXETH_POOL, PoolType.CurveCryptoPool, 2, 0, 1, Action.Swap),
    ],
    // ANGLE ==(Sushi)==> WETH
    WETH: [encodePoolHintV2(ADDRESS.ANGLE_WETH_UNIV2, PoolType.UniswapV2, 2, 0, 1, Action.Swap)],
  },
  BTRFLY: {
    WETH: [encodePoolHintV2(ADDRESS["UniV3_WETH/BTRFLY_10000"], PoolType.UniswapV3, 2, 1, 0, Action.Swap)],
  },
  TRICRV: {
    // 3CRV ==(Curve)==> USDT ==(Curve)==> WETH ==(CurveV2)==> CRV
    CRV: [
      encodePoolHintV2(ADDRESS.CURVE_TRICRV_POOL, PoolType.CurveBasePool, 3, 2, 2, Action.Remove),
      encodePoolHintV2(ADDRESS.CURVE_TRICRYPTO_POOL, PoolType.CurveTriCryptoPool, 3, 0, 2, Action.Swap),
      encodePoolHintV2(ADDRESS["CURVE_crvUSD/ETH/CRV_POOL"], PoolType.CurveTriCryptoPool, 3, 1, 2, Action.Swap),
    ],
  },
  CRV: {
    // CRV ==(CurveV2)==> WETH ==(UniV3)==> USDC ==(Curve)==> FRAX ==(UniV2)==> FXS
    FXS: [
      encodePoolHintV2(ADDRESS["CURVE_crvUSD/ETH/CRV_POOL"], PoolType.CurveTriCryptoPool, 3, 2, 1, Action.Swap),
      encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 1, 0, Action.Swap),
      encodePoolHintV2(ADDRESS.CURVE_FRAXUSDC_POOL, PoolType.CurveBasePool, 2, 1, 0, Action.Swap),
      encodePoolHintV2(ADDRESS.FXS_FRAX_UNIV2, PoolType.UniswapV2, 2, 1, 0, Action.Swap),
    ],
    // CRV ==(CurveV2)==> WETH
    WETH: [encodePoolHintV2(ADDRESS["CURVE_crvUSD/ETH/CRV_POOL"], PoolType.CurveTriCryptoPool, 3, 2, 1, Action.Swap)],
    aCRV: [
      encodePoolHintV2(ADDRESS["CURVE_CRV/cvxCRV_POOL"], PoolType.CurveFactoryPlainPool, 2, 0, 1, Action.Swap),
      encodePoolHintV2(ADDRESS.aCRV, PoolType.AladdinCompounder, 1, 0, 0, Action.Add),
    ],
    // CRV ==(Curve)==> cvxCRV
    cvxCRV: [encodePoolHintV2(ADDRESS["CURVE_CRV/cvxCRV_POOL"], PoolType.CurveFactoryPlainPool, 2, 0, 1, Action.Swap)],
    // CRV ==(CurveV2)==> WETH ==(CurveV2)==> CVX
    CVX: [
      encodePoolHintV2(ADDRESS["CURVE_crvUSD/ETH/CRV_POOL"], PoolType.CurveTriCryptoPool, 3, 2, 1, Action.Swap),
      encodePoolHintV2(ADDRESS.CURVE_CVXETH_POOL, PoolType.CurveCryptoPool, 2, 0, 1, Action.Swap),
    ],
  },
  CVX: {
    // CVX ==(CurveV2)==> WETH ==(UniV2)==> FXS
    FXS: [
      encodePoolHintV2(ADDRESS.CURVE_CVXETH_POOL, PoolType.CurveCryptoPool, 2, 1, 0, Action.Swap),
      encodePoolHintV2(ADDRESS.FXS_WETH_UNIV2, PoolType.UniswapV2, 2, 1, 0, Action.Swap),
    ],
    // CVX ==(CurveV2)==> WETH ==(CurveV2)==> CRV
    CRV: [
      encodePoolHintV2(ADDRESS.CURVE_CVXETH_POOL, PoolType.CurveCryptoPool, 2, 1, 0, Action.Swap),
      encodePoolHintV2(ADDRESS["CURVE_crvUSD/ETH/CRV_POOL"], PoolType.CurveTriCryptoPool, 3, 1, 2, Action.Swap),
    ],
    // CVX ==(CurveV2)==> WETH ==(CurveV2)==> CRV ==(Curve)==> cvxCRV
    cvxCRV: [
      encodePoolHintV2(ADDRESS.CURVE_CVXETH_POOL, PoolType.CurveCryptoPool, 2, 1, 0, Action.Swap),
      encodePoolHintV2(ADDRESS["CURVE_crvUSD/ETH/CRV_POOL"], PoolType.CurveTriCryptoPool, 3, 1, 2, Action.Swap),
      encodePoolHintV2(ADDRESS["CURVE_CRV/cvxCRV_POOL"], PoolType.CurveFactoryPlainPool, 2, 0, 1, Action.Swap),
    ],
    // CVX ==(CurveV2)==> WETH
    WETH: [encodePoolHintV2(ADDRESS.CURVE_CVXETH_POOL, PoolType.CurveCryptoPool, 2, 1, 0, Action.Swap)],
    // CVX ==(Curve)==> Curve_CLEVCVX_TOKEN
    Curve_CLEVCVX_TOKEN: [
      encodePoolHintV2(ADDRESS.CURVE_CLEVCVX_POOL, PoolType.CurveFactoryPlainPool, 2, 0, 0, Action.Add),
    ],
    // CVX ==(Curve)==> clevCVX
    clevCVX: [encodePoolHintV2(ADDRESS.CURVE_CLEVCVX_POOL, PoolType.CurveFactoryPlainPool, 2, 0, 1, Action.Swap)],
  },
  clevCVX: {
    // clevCVX ==(Curve)==> Curve_CLEVCVX_TOKEN
    Curve_CLEVCVX_TOKEN: [
      encodePoolHintV2(ADDRESS.CURVE_CLEVCVX_POOL, PoolType.CurveFactoryPlainPool, 2, 1, 1, Action.Add),
    ],
  },
  cvxCRV: {
    // cvxCRV ==(Curve)==> CRV ==(CurveV2)==> WETH
    WETH: [
      encodePoolHintV2(ADDRESS["CURVE_CRV/cvxCRV_POOL"], PoolType.CurveFactoryPlainPool, 2, 1, 0, Action.Swap),
      encodePoolHintV2(ADDRESS["CURVE_crvUSD/ETH/CRV_POOL"], PoolType.CurveTriCryptoPool, 3, 2, 1, Action.Swap),
    ],
    // cvxCRV ==(Curve)==> CRV ==(CurveV2)==> WETH ==(UniV3)==> USDC ==(Curve)==> FRAX
    FRAX: [
      encodePoolHintV2(ADDRESS["CURVE_CRV/cvxCRV_POOL"], PoolType.CurveFactoryPlainPool, 2, 1, 0, Action.Swap),
      encodePoolHintV2(ADDRESS["CURVE_crvUSD/ETH/CRV_POOL"], PoolType.CurveTriCryptoPool, 3, 2, 1, Action.Swap),
      encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 1, 0, Action.Swap),
      encodePoolHintV2(ADDRESS.CURVE_FRAXUSDC_POOL, PoolType.CurveBasePool, 2, 1, 0, Action.Swap),
    ],
    // cvxCRV ==(Curve)==> CRV ==(CurveV2)==> WETH ==(CurveV2)==> CVX
    CVX: [
      encodePoolHintV2(ADDRESS["CURVE_CRV/cvxCRV_POOL"], PoolType.CurveFactoryPlainPool, 2, 1, 0, Action.Swap),
      encodePoolHintV2(ADDRESS["CURVE_crvUSD/ETH/CRV_POOL"], PoolType.CurveTriCryptoPool, 3, 2, 1, Action.Swap),
      encodePoolHintV2(ADDRESS.CURVE_CVXETH_POOL, PoolType.CurveCryptoPool, 2, 0, 1, Action.Swap),
    ],
    // cvxCRV ==(Curve)==> CRV
    CRV: [encodePoolHintV2(ADDRESS["CURVE_CRV/cvxCRV_POOL"], PoolType.CurveFactoryPlainPool, 2, 1, 0, Action.Swap)],
    aCRV: [encodePoolHintV2(ADDRESS.aCRV, PoolType.AladdinCompounder, 1, 0, 0, Action.Add)],
  },
  cvxFXS: {
    FXS: [encodePoolHintV2(ADDRESS["CURVE_FXS/cvxFXS_POOL"], PoolType.CurveFactoryPlainPool, 2, 1, 0, Action.Swap)],
    FRAX: [
      encodePoolHintV2(ADDRESS["CURVE_FXS/cvxFXS_POOL"], PoolType.CurveFactoryPlainPool, 2, 1, 0, Action.Swap),
      encodePoolHintV2(ADDRESS.FXS_FRAX_UNIV2, PoolType.UniswapV2, 2, 0, 1, Action.Swap),
    ],
    USDC: [
      encodePoolHintV2(ADDRESS["CURVE_FXS/cvxFXS_POOL"], PoolType.CurveFactoryPlainPool, 2, 1, 0, Action.Swap),
      encodePoolHintV2(ADDRESS.FXS_FRAX_UNIV2, PoolType.UniswapV2, 2, 0, 1, Action.Swap),
      encodePoolHintV2(ADDRESS.CURVE_FRAXUSDC_POOL, PoolType.CurveBasePool, 2, 0, 1, Action.Swap),
    ],
    WETH: [
      encodePoolHintV2(ADDRESS["CURVE_FXS/cvxFXS_POOL"], PoolType.CurveFactoryPlainPool, 2, 1, 0, Action.Swap),
      encodePoolHintV2(ADDRESS.FXS_FRAX_UNIV2, PoolType.UniswapV2, 2, 0, 1, Action.Swap),
      encodePoolHintV2(ADDRESS.CURVE_FRAXUSDC_POOL, PoolType.CurveBasePool, 2, 0, 1, Action.Swap),
      encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 0, 1, Action.Swap),
    ],
  },
  EURS: {
    // EURS ==(CurveV2)==> USDC ==(UniV3)==> WETH ==(CurveV2)==> CVX
    CVX: [
      encodePoolHintV2(ADDRESS.CURVE_USDCEURS_POOL, PoolType.CurveCryptoPool, 2, 1, 0, Action.Swap),
      encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 0, 1, Action.Swap),
      encodePoolHintV2(ADDRESS.CURVE_CVXETH_POOL, PoolType.CurveCryptoPool, 2, 0, 1, Action.Swap),
    ],
  },
  FLX: {
    // FLX ==(UniV2)==> WETH ==(CurveV2)==> CVX
    CVX: [
      encodePoolHintV2(ADDRESS.FLX_WETH_UNIV2, PoolType.UniswapV2, 2, 0, 1, Action.Swap),
      encodePoolHintV2(ADDRESS.CURVE_CVXETH_POOL, PoolType.CurveCryptoPool, 2, 0, 1, Action.Swap),
    ],
  },
  FXN: {
    // FXN ==(CurveV2)==> WETH
    WETH: [encodePoolHintV2(ADDRESS["CURVE_ETH/FXN_POOL"], PoolType.CurveCryptoPool, 2, 1, 0, Action.Swap)],
  },
  FXS: {
    // FXS ==(UniV2)==> FRAX ==(Curve)==> USDC ==(UniV3)==> WETH
    WETH: [
      /*
      encodePoolHintV2(ADDRESS.FXS_FRAX_UNIV2, PoolType.UniswapV2, 2, 0, 1, Action.Swap),
      encodePoolHintV2(ADDRESS.CURVE_FRAXUSDC_POOL, PoolType.CurveBasePool, 2, 0, 1, Action.Swap),
      encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 0, 1, Action.Swap),
      */
      /*
      encodePoolHintV2(ADDRESS.FXS_WETH_UNIV2, PoolType.UniswapV2, 2, 0, 1, Action.Swap),
      */
      /*
      encodePoolHintV2(ADDRESS.FXS_WETH_UNIV3_10000, PoolType.UniswapV3, 2, 0, 1, Action.Swap),
      */
      encodePoolHintV2("0x03b59bd1c8b9f6c265ba0c3421923b93f15036fa", PoolType.UniswapV2, 2, 0, 1, Action.Swap),
      encodePoolHintV2("0x31351Bf3fba544863FBff44DDC27bA880916A199", PoolType.UniswapV2, 2, 0, 1, Action.Swap),
    ],
    // FXS ==(UniV2)==> FRAX ==(Curve)==> USDC ==(UniV3)==> WETH ==(CurveV2)==> CRV
    CRV: [
      encodePoolHintV2(ADDRESS.FXS_FRAX_UNIV2, PoolType.UniswapV2, 2, 0, 1, Action.Swap),
      encodePoolHintV2(ADDRESS.CURVE_FRAXUSDC_POOL, PoolType.CurveBasePool, 2, 0, 1, Action.Swap),
      encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 0, 1, Action.Swap),
      encodePoolHintV2(ADDRESS["CURVE_crvUSD/ETH/CRV_POOL"], PoolType.CurveTriCryptoPool, 3, 1, 2, Action.Swap),
    ],
    // FXS ==(UniV2)==> FRAX ==(Curve)==> USDC ==(UniV3)==> WETH ==(CurveV2)==> CVX
    CVX: [
      encodePoolHintV2(ADDRESS.FXS_FRAX_UNIV2, PoolType.UniswapV2, 2, 0, 1, Action.Swap),
      encodePoolHintV2(ADDRESS.CURVE_FRAXUSDC_POOL, PoolType.CurveBasePool, 2, 0, 1, Action.Swap),
      encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 0, 1, Action.Swap),
      encodePoolHintV2(ADDRESS.CURVE_CVXETH_POOL, PoolType.CurveCryptoPool, 2, 0, 1, Action.Swap),
    ],
  },
  GHO: {
    // GHO ==(BalancerV2)==> USDC ==(UniV3)==> WETH
    WETH: [
      encodePoolHintV2(ADDRESS["BalancerV2_GHO/USDC/USDT"], PoolType.BalancerV2, 4, 0, 2, Action.Swap),
      encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 0, 1, Action.Swap),
    ],
  },
  GRO: {
    // GRO ==(UniV2) ==> USDC ==(UniV3)==> WETH ==(CurveV2)==> CVX
    CVX: [
      encodePoolHintV2(ADDRESS.GRO_USDC_UNIV2, PoolType.UniswapV2, 2, 0, 1, Action.Swap),
      encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 0, 1, Action.Swap),
      encodePoolHintV2(ADDRESS.CURVE_CVXETH_POOL, PoolType.CurveCryptoPool, 2, 0, 1, Action.Swap),
    ],
  },
  INV: {
    // INV ==(CurveV2)==> WETH ==(CurveV2)==> CVX
    CVX: [
      // encodePoolHintV2(ADDRESS.INV_WETH_UNIV2, PoolType.UniswapV2, 2, 0, 1, Action.Swap),
      encodePoolHintV2(ADDRESS["CURVE_USDC/ETH/INV_POOL"], PoolType.CurveTriCryptoPool, 3, 2, 1, Action.Swap),
      encodePoolHintV2(ADDRESS.CURVE_CVXETH_POOL, PoolType.CurveCryptoPool, 2, 0, 1, Action.Swap),
      /*
      encodePoolHintV2(ADDRESS["CURVE_USDC/ETH/INV_POOL"], PoolType.CurveTriCryptoPool, 3, 2, 0, Action.Swap),
      encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 0, 1, Action.Swap),
      encodePoolHintV2(ADDRESS.CURVE_CVXETH_POOL, PoolType.CurveCryptoPool, 2, 0, 1, Action.Swap),
      */
    ],
    // INV ==(CurveV2)==> WETH
    WETH: [
      // encodePoolHintV2(ADDRESS.INV_WETH_UNIV2, PoolType.UniswapV2, 2, 0, 1, Action.Swap)
      encodePoolHintV2(ADDRESS["CURVE_USDC/ETH/INV_POOL"], PoolType.CurveTriCryptoPool, 3, 2, 1, Action.Swap),
    ],
  },
  JPEG: {
    // JPEG ==(UniV2)==> WETH
    WETH: [encodePoolHintV2(ADDRESS.JPEG_WETH_UNIV2, PoolType.UniswapV2, 2, 1, 0, Action.Swap)],
    // JPEG ==(UniV2)==> WETH ==(CurveV2)==> CVX
    CVX: [
      encodePoolHintV2(ADDRESS.JPEG_WETH_UNIV2, PoolType.UniswapV2, 2, 1, 0, Action.Swap),
      encodePoolHintV2(ADDRESS.CURVE_CVXETH_POOL, PoolType.CurveCryptoPool, 2, 0, 1, Action.Swap),
    ],
  },
  LDO: {
    // LDO ==(CurveV2)==> WETH
    WETH: [encodePoolHintV2(ADDRESS["CURVE_ETH/LDO_POOL"], PoolType.CurveCryptoPool, 2, 1, 0, Action.Swap)],
    // LDO ==(CurveV2)==> WETH ==(CurveV2)==> CRV
    CRV: [
      encodePoolHintV2(ADDRESS["CURVE_ETH/LDO_POOL"], PoolType.CurveCryptoPool, 2, 1, 0, Action.Swap),
      encodePoolHintV2(ADDRESS["CURVE_crvUSD/ETH/CRV_POOL"], PoolType.CurveTriCryptoPool, 3, 1, 2, Action.Swap),
    ],
    // LDO ==(CurveV2)==> WETH ==(CurveV2)==> CVX
    CVX: [
      encodePoolHintV2(ADDRESS["CURVE_ETH/LDO_POOL"], PoolType.CurveCryptoPool, 2, 1, 0, Action.Swap),
      encodePoolHintV2(ADDRESS.CURVE_CVXETH_POOL, PoolType.CurveCryptoPool, 2, 0, 1, Action.Swap),
    ],
  },
  LYRA: {
    // LYRA ==(UniV2)==> WETH ==(CurveV2)==> CVX
    CVX: [
      encodePoolHintV2(ADDRESS.LYRA_WETH_UNIV2, PoolType.UniswapV2, 2, 0, 1, Action.Swap),
      encodePoolHintV2(ADDRESS.CURVE_CVXETH_POOL, PoolType.CurveCryptoPool, 2, 0, 1, Action.Swap),
    ],
  },
  MTA: {
    // MTA ==(UniV2)==> WETH ==(CurveV2)==> CVX
    CVX: [
      encodePoolHintV2(ADDRESS.MTA_WETH_UNIV2, PoolType.UniswapV2, 2, 0, 1, Action.Swap),
      encodePoolHintV2(ADDRESS.CURVE_CVXETH_POOL, PoolType.CurveCryptoPool, 2, 0, 1, Action.Swap),
    ],
  },
  SNX: {
    // SNX ==(Balancer)==> WETH ==(CurveV2)==> CVX
    CVX: [
      encodePoolHintV2(ADDRESS.SNX_WETH_BalancerV2, PoolType.BalancerV2, 2, 0, 1, Action.Swap),
      encodePoolHintV2(ADDRESS.CURVE_CVXETH_POOL, PoolType.CurveCryptoPool, 2, 0, 1, Action.Swap),
    ],
    // SNX ==(Balancer)==> WETH
    WETH: [
      /*
      encodePoolHintV2(ADDRESS.SNX_WETH_BalancerV2, PoolType.BalancerV2, 2, 0, 1, Action.Swap)
      */
      encodePoolHintV2(ADDRESS["UniV3_SNX/WETH_3000"], PoolType.UniswapV3, 2, 0, 1, Action.Swap),
    ],
  },
  SPELL: {
    // SPELL ==(UniV2)==> WETH ==(CurveV2)==> CVX
    CVX: [
      encodePoolHintV2(ADDRESS.SPELL_WETH_UNIV2, PoolType.UniswapV2, 2, 0, 1, Action.Swap),
      encodePoolHintV2(ADDRESS.CURVE_CVXETH_POOL, PoolType.CurveCryptoPool, 2, 0, 1, Action.Swap),
    ],
    // SPELL ==(UniV2)==> WETH
    WETH: [encodePoolHintV2(ADDRESS.SPELL_WETH_UNIV2, PoolType.UniswapV2, 2, 0, 1, Action.Swap)],
  },
  STG: {
    // STG ==(CurveV2)==> USDC ==(UniV3)==> WETH ==(CurveV2)==> CVX
    CVX: [
      encodePoolHintV2(ADDRESS["CURVE_STG/USDC_POOL"], PoolType.CurveCryptoPool, 2, 0, 1, Action.Swap),
      encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 0, 1, Action.Swap),
      encodePoolHintV2(ADDRESS.CURVE_CVXETH_POOL, PoolType.CurveCryptoPool, 2, 0, 1, Action.Swap),
    ],
    // STG ==(CurveV2)==> USDC ==(UniV3)==> WETH
    WETH: [
      encodePoolHintV2(ADDRESS["CURVE_STG/USDC_POOL"], PoolType.CurveCryptoPool, 2, 0, 1, Action.Swap),
      encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 0, 1, Action.Swap),
    ],
  },
  TRIBE: {
    // TRIBE ==(UniV2)==> FEI ==(Balancer)==> WETH ==(CurveV2)==> CVX
    CVX: [
      encodePoolHintV2(ADDRESS.FEI_TRIBE_UNIV2, PoolType.UniswapV2, 2, 1, 0, Action.Swap),
      encodePoolHintV2(ADDRESS.FEI_WETH_BalancerV2, PoolType.BalancerV2, 2, 0, 1, Action.Swap),
      encodePoolHintV2(ADDRESS.CURVE_CVXETH_POOL, PoolType.CurveCryptoPool, 2, 0, 1, Action.Swap),
    ],
  },
  USDC: {
    // USDC ==(UniV3)==> WETH ==(CurveV2)==> CRV
    CRV: [
      encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 0, 1, Action.Swap),
      encodePoolHintV2(ADDRESS["CURVE_crvUSD/ETH/CRV_POOL"], PoolType.CurveTriCryptoPool, 3, 1, 2, Action.Swap),
    ],
    // USDC ==(UniV3)==> WETH ==(CurveV2)==> CVX
    CVX: [
      encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 0, 1, Action.Swap),
      encodePoolHintV2(ADDRESS.CURVE_CVXETH_POOL, PoolType.CurveCryptoPool, 2, 0, 1, Action.Swap),
    ],
    // USDC ==(UniV3)==> WETH ==(CurveV2)==> CVX ==(Curve)==> clevCVX
    clevCVX: [
      encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 0, 1, Action.Swap),
      encodePoolHintV2(ADDRESS.CURVE_CVXETH_POOL, PoolType.CurveCryptoPool, 2, 0, 1, Action.Swap),
      encodePoolHintV2(ADDRESS.CURVE_CLEVCVX_POOL, PoolType.CurveFactoryPlainPool, 2, 0, 1, Action.Swap),
    ],
    // USDC ==(UniV3)==> WETH ==(CurveV2)==> Curve_CTRETH_TOKEN
    Curve_CTRETH_TOKEN: [
      encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 0, 1, Action.Swap),
      encodePoolHintV2(ADDRESS.CURVE_CTRETH_POOL, PoolType.CurveCryptoPool, 2, 0, 0, Action.Add),
    ],
    // USDC ==(UniV3)==> WETH
    "CURVE_ETH/CLEV_TOKEN": [
      encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 0, 1, Action.Swap),
      encodePoolHintV2(ADDRESS["CURVE_ETH/CLEV_POOL"], PoolType.CurveCryptoPool, 2, 0, 0, Action.Add),
    ],
    // USDC ==(UniV3)==> WETH ==(CurveV2)==> CVX ==(Curve)==> Curve_CLEVCVX_TOKEN
    Curve_CLEVCVX_TOKEN: [
      encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 0, 1, Action.Swap),
      encodePoolHintV2(ADDRESS.CURVE_CVXETH_POOL, PoolType.CurveCryptoPool, 2, 0, 1, Action.Swap),
      encodePoolHintV2(ADDRESS.CURVE_CLEVCVX_POOL, PoolType.CurveFactoryPlainPool, 2, 0, 0, Action.Add),
    ],
    // USDC ==(UniV3)==> WETH
    WETH: [
      /*
      encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 0, 1, Action.Swap)
      */
      encodePoolHintV2(ADDRESS["UniV2_USDC/WETH"], PoolType.UniswapV2, 2, 0, 1, Action.Swap),
    ],
    cvxFXS: [
      encodePoolHintV2(ADDRESS.CURVE_FRAXUSDC_POOL, PoolType.CurveBasePool, 2, 1, 0, Action.Swap),
      encodePoolHintV2(ADDRESS.FXS_FRAX_UNIV2, PoolType.UniswapV2, 2, 1, 0, Action.Swap),
      encodePoolHintV2(ADDRESS["CURVE_FXS/cvxFXS_POOL"], PoolType.CurveFactoryPlainPool, 2, 0, 1, Action.Swap),
    ],
  },
  USDT: {
    WETH: [
      /*
      encodePoolHintV2(ADDRESS.WETH_USDT_UNIV3, PoolType.UniswapV3, 2, 1, 0, Action.Swap)
      */
      encodePoolHintV2(ADDRESS["UniV2_WETH/USDT"], PoolType.UniswapV2, 2, 1, 0, Action.Swap),
    ],
  },
  USDN: {
    // USDN ==(Curve)==> USDC ==(UniV3)==> WETH ==(CurveV2)==> CVX
    CVX: [
      // @todo Actually, we should use `PoolType.CurveMetaPoolUnderlying`. But the zap contract has some bugs, we may fix it later.
      // encodePoolHintV2(ADDRESS.CURVE_USDN_DEPOSIT, PoolType.CurveMetaPoolUnderlying, 4, 0, 2, Action.Swap),
      encodePoolHintV2(ADDRESS.CURVE_USDN_POOL, PoolType.CurveFactoryUSDMetaPoolUnderlying, 4, 0, 2, Action.Swap),
      encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 0, 1, Action.Swap),
      encodePoolHintV2(ADDRESS.CURVE_CVXETH_POOL, PoolType.CurveCryptoPool, 2, 0, 1, Action.Swap),
    ],
  },
  USDD: {
    // USDD ==(Curve)==> USDC ==(UniV3)==> WETH ==(CurveV2)==> CVX
    CVX: [
      encodePoolHintV2(ADDRESS.CURVE_USDD3CRV_POOL, PoolType.CurveFactoryUSDMetaPoolUnderlying, 4, 0, 2, Action.Swap),
      encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 0, 1, Action.Swap),
      encodePoolHintV2(ADDRESS.CURVE_CVXETH_POOL, PoolType.CurveCryptoPool, 2, 0, 1, Action.Swap),
    ],
    // USDD ==(Curve)==> USDC ==(UniV3)==> WETH
    WETH: [
      encodePoolHintV2(ADDRESS.CURVE_USDD3CRV_POOL, PoolType.CurveFactoryUSDMetaPoolUnderlying, 4, 0, 2, Action.Swap),
      encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 0, 1, Action.Swap),
    ],
  },
  eUSD: {
    // eUSD ==(Curve)==> USDC ==(UniV3)==> WETH ==(CurveV2)==> CVX
    CVX: [
      encodePoolHintV2(ADDRESS["CURVE_eUSD/FRAXBP_POOL"], PoolType.CurveFactoryMetaPool, 2, 0, 1, Action.Swap),
      encodePoolHintV2(ADDRESS.CURVE_FRAXUSDC_POOL, PoolType.CurveBasePool, 2, 1, 1, Action.Remove),
      encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 0, 1, Action.Swap),
      encodePoolHintV2(ADDRESS.CURVE_CVXETH_POOL, PoolType.CurveCryptoPool, 2, 0, 1, Action.Swap),
    ],
    // eUSD ==(Curve)==> USDC ==(UniV3)==> WETH
    WETH: [
      encodePoolHintV2(ADDRESS["CURVE_eUSD/FRAXBP_POOL"], PoolType.CurveFactoryMetaPool, 2, 0, 1, Action.Swap),
      encodePoolHintV2(ADDRESS.CURVE_FRAXUSDC_POOL, PoolType.CurveBasePool, 2, 1, 1, Action.Remove),
      encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 0, 1, Action.Swap),
    ],
  },
  UST_WORMHOLE: {
    // UST ==(UniV3)==> USDC ==(UniV3)==> WETH ==(CurveV2)==> CVX
    CVX: [
      encodePoolHintV2(ADDRESS.USDC_UST_WORMHOLE_UNIV3, PoolType.UniswapV3, 2, 1, 0, Action.Swap),
      encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 0, 1, Action.Swap),
      encodePoolHintV2(ADDRESS.CURVE_CVXETH_POOL, PoolType.CurveCryptoPool, 2, 0, 1, Action.Swap),
    ],
  },
  WETH: {
    // WETH ==(CurveV2)==> CRV
    CRV: [encodePoolHintV2(ADDRESS["CURVE_crvUSD/ETH/CRV_POOL"], PoolType.CurveTriCryptoPool, 3, 1, 2, Action.Swap)],
    // WETH ==(CurveV2)==> CVX
    CVX: [encodePoolHintV2(ADDRESS.CURVE_CVXETH_POOL, PoolType.CurveCryptoPool, 2, 0, 1, Action.Swap)],
    // WETH ==(CurveV2)==> CVX ==(Curve)==> clevCVX
    clevCVX: [
      encodePoolHintV2(ADDRESS.CURVE_CVXETH_POOL, PoolType.CurveCryptoPool, 2, 0, 1, Action.Swap),
      encodePoolHintV2(ADDRESS.CURVE_CLEVCVX_POOL, PoolType.CurveFactoryPlainPool, 2, 0, 1, Action.Swap),
    ],
    // WETH ==(CurveV2)==> Curve_CTRETH_TOKEN
    Curve_CTRETH_TOKEN: [encodePoolHintV2(ADDRESS.CURVE_CTRETH_POOL, PoolType.CurveCryptoPool, 2, 0, 0, Action.Add)],
    // WETH ==(Curve)==> "CURVE_ETH/CLEV_TOKEN"
    "CURVE_ETH/CLEV_TOKEN": [
      encodePoolHintV2(ADDRESS["CURVE_ETH/CLEV_POOL"], PoolType.CurveCryptoPool, 2, 0, 0, Action.Add),
    ],
    // WETH ==(CurveV2)==> CVX ==(Curve)==> Curve_CLEVCVX_TOKEN
    Curve_CLEVCVX_TOKEN: [
      encodePoolHintV2(ADDRESS.CURVE_CVXETH_POOL, PoolType.CurveCryptoPool, 2, 0, 1, Action.Swap),
      encodePoolHintV2(ADDRESS.CURVE_CLEVCVX_POOL, PoolType.CurveFactoryPlainPool, 2, 0, 0, Action.Add),
    ],
    cvxFXS: [
      encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 1, 0, Action.Swap),
      encodePoolHintV2(ADDRESS.CURVE_FRAXUSDC_POOL, PoolType.CurveBasePool, 2, 1, 0, Action.Swap),
      encodePoolHintV2(ADDRESS.FXS_FRAX_UNIV2, PoolType.UniswapV2, 2, 1, 0, Action.Swap),
      encodePoolHintV2(ADDRESS["CURVE_FXS/cvxFXS_POOL"], PoolType.CurveFactoryPlainPool, 2, 0, 1, Action.Swap),
    ],
  },
  CLEV: {
    "CURVE_ETH/CLEV_TOKEN": [
      encodePoolHintV2(ADDRESS["CURVE_ETH/CLEV_POOL"], PoolType.CurveCryptoPool, 2, 1, 1, Action.Add),
    ],
    // CLEV ==(CurveV2)==> WETH ==(CurveV2)==> CVX
    CVX: [
      encodePoolHintV2(ADDRESS["CURVE_ETH/CLEV_POOL"], PoolType.CurveCryptoPool, 2, 1, 0, Action.Swap),
      encodePoolHintV2(ADDRESS.CURVE_CVXETH_POOL, PoolType.CurveCryptoPool, 2, 0, 1, Action.Swap),
    ],
    // CLEV ==(CurveV2)==> WETH
    WETH: [encodePoolHintV2(ADDRESS["CURVE_ETH/CLEV_POOL"], PoolType.CurveCryptoPool, 2, 1, 0, Action.Swap)],
  },
  CTR: {
    // CTR ==(CurveV2)==> Curve_CTRETH_TOKEN
    Curve_CTRETH_TOKEN: [encodePoolHintV2(ADDRESS.CURVE_CTRETH_POOL, PoolType.CurveCryptoPool, 2, 1, 1, Action.Add)],
  },
  T: {
    // T ==(Curve)==> WETH ==(CurveV2)==> CVX
    CVX: [
      encodePoolHintV2(ADDRESS.CURVE_TETH_POOL, PoolType.CurveCryptoPool, 2, 1, 0, Action.Swap),
      encodePoolHintV2(ADDRESS.CURVE_CVXETH_POOL, PoolType.CurveCryptoPool, 2, 0, 1, Action.Swap),
    ],
  },
  TUSD: {
    // TUSD ==(Curve)==> USDC ==(UniV3)==> WETH ==(CurveV2)==> CVX
    CVX: [
      encodePoolHintV2(ADDRESS.CURVE_TUSD3CRV_POOL, PoolType.CurveFactoryUSDMetaPoolUnderlying, 4, 0, 2, Action.Swap),
      encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 0, 1, Action.Swap),
      encodePoolHintV2(ADDRESS.CURVE_CVXETH_POOL, PoolType.CurveCryptoPool, 2, 0, 1, Action.Swap),
    ],
    // TUSD ==(Curve)==> USDC ==(UniV3)==> WETH
    WETH: [
      encodePoolHintV2(ADDRESS.CURVE_TUSD3CRV_POOL, PoolType.CurveFactoryUSDMetaPoolUnderlying, 4, 0, 2, Action.Swap),
      encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 0, 1, Action.Swap),
    ],
  },
  SDT: {
    // SDT ==(CurveV2)==> WETH
    WETH: [encodePoolHintV2(ADDRESS["CURVE_ETH/SDT_POOL"], PoolType.CurveCryptoPool, 2, 1, 0, Action.Swap)],
    // SDT ==(CurveV2)==> WETH ==(CurveV2)==> CRV
    CRV: [
      encodePoolHintV2(ADDRESS["CURVE_ETH/SDT_POOL"], PoolType.CurveCryptoPool, 2, 1, 0, Action.Swap),
      encodePoolHintV2(ADDRESS["CURVE_crvUSD/ETH/CRV_POOL"], PoolType.CurveTriCryptoPool, 3, 1, 2, Action.Swap),
    ],
  },
  "3CRV": {
    WETH: [
      encodePoolHintV2(ADDRESS.CURVE_TRICRV_POOL, PoolType.CurveBasePool, 3, 2, 2, Action.Remove),
      encodePoolHintV2(ADDRESS.CURVE_TRICRYPTO_POOL, PoolType.CurveTriCryptoPool, 3, 0, 2, Action.Swap),
    ],
  },
  OGN: {
    // OGN ==(UniV3)==> WETH ==(CurveV2)==> CVX
    CVX: [
      encodePoolHintV2(ADDRESS.OGN_WETH_UNIV3_3000, PoolType.UniswapV3, 2, 0, 1, Action.Swap),
      encodePoolHintV2(ADDRESS.CURVE_CVXETH_POOL, PoolType.CurveCryptoPool, 2, 0, 1, Action.Swap),
    ],
    WETH: [encodePoolHintV2(ADDRESS.OGN_WETH_UNIV3_3000, PoolType.UniswapV3, 2, 0, 1, Action.Swap)],
  },
  GNO: {
    // GNO ==(UniV3)==> WETH ==(CurveV2)==> CVX
    CVX: [
      encodePoolHintV2(ADDRESS.GNO_WETH_UNIV3_3000, PoolType.UniswapV3, 2, 0, 1, Action.Swap),
      encodePoolHintV2(ADDRESS.CURVE_CVXETH_POOL, PoolType.CurveCryptoPool, 2, 0, 1, Action.Swap),
    ],
    // GNO ==(UniV3)==> WETH
    WETH: [encodePoolHintV2(ADDRESS.GNO_WETH_UNIV3_3000, PoolType.UniswapV3, 2, 0, 1, Action.Swap)],
  },
  FRAX: {
    // FRAX ==(Curve)==> USDC ==(UniV3)==> WETH ==(CurveV2)==> CVX
    CVX: [
      encodePoolHintV2(ADDRESS.CURVE_FRAXUSDC_POOL, PoolType.CurveBasePool, 2, 0, 1, Action.Swap),
      encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 0, 1, Action.Swap),
      encodePoolHintV2(ADDRESS.CURVE_CVXETH_POOL, PoolType.CurveCryptoPool, 2, 0, 1, Action.Swap),
    ],
  },
  BADGER: {
    // BADGER ==(CurveV2)==> WBTC ==(UniV3)==> WETH ==(CurveV2)==> CVX
    CVX: [
      encodePoolHintV2(ADDRESS.CURVE_BADGERWBTC_POOL, PoolType.CurveCryptoPool, 2, 0, 1, Action.Swap),
      encodePoolHintV2(ADDRESS.WBTC_WETH_UNIV3_500, PoolType.UniswapV3, 2, 0, 1, Action.Swap),
      encodePoolHintV2(ADDRESS.CURVE_CVXETH_POOL, PoolType.CurveCryptoPool, 2, 0, 1, Action.Swap),
    ],
  },
  LUSD: {
    // LUSD ==(Curve)==> USDC ==(UniV3)==> WETH
    WETH: [
      encodePoolHintV2(ADDRESS.CURVE_LUSD3CRV_POOL, PoolType.CurveFactoryUSDMetaPoolUnderlying, 4, 0, 2, Action.Swap),
      encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 0, 1, Action.Swap),
    ],
  },
  MULTI: {
    // MULTI ==(UniV2)==> WETH ==(CurveV2)==> CVX
    CVX: [
      encodePoolHintV2(ADDRESS.MULTI_WETH_UNIV2, PoolType.UniswapV2, 2, 0, 1, Action.Swap),
      encodePoolHintV2(ADDRESS.CURVE_CVXETH_POOL, PoolType.CurveCryptoPool, 2, 0, 1, Action.Swap),
    ],
  },
  GEAR: {
    // GEAR ==(CurveV2)==> WETH
    WETH: [encodePoolHintV2(ADDRESS["CURVE_GEAR/ETH_POOL"], PoolType.CurveCryptoPool, 2, 0, 1, Action.Swap)],
  },
  CNC: {
    // CNC ==(CurveV2)==> WETH
    WETH: [encodePoolHintV2(ADDRESS["CURVE_ETH/CNC_POOL"], PoolType.CurveCryptoPool, 2, 1, 0, Action.Swap)],
    CVX: [
      /* CNC ==(CurveV2)==> WETH ==(CurveV2)==> CVX
      encodePoolHintV2(ADDRESS["CURVE_ETH/CNC_POOL"], PoolType.CurveCryptoPool, 2, 1, 0, Action.Swap),
      encodePoolHintV2(ADDRESS.CURVE_CVXETH_POOL, PoolType.CurveCryptoPool, 2, 0, 1, Action.Swap),
      */
      // CNC ==(CurveV2)==> WETH ==(Sushi)==> CVX
      encodePoolHintV2(ADDRESS["CURVE_ETH/CNC_POOL"], PoolType.CurveCryptoPool, 2, 1, 0, Action.Swap),
      encodePoolHintV2(ADDRESS.CVX_WETH_UNIV2, PoolType.UniswapV2, 2, 1, 0, Action.Swap),
    ],
  },
  sdCRV: {
    // sdCRV ==(Curve)==> CRV
    CRV: [encodePoolHintV2(ADDRESS["CURVE_CRV/sdCRV_V2_POOL"], PoolType.CurveFactoryPlainPool, 2, 1, 0, Action.Swap)],
    // sdCRV ==(Curve)==> CRV ==(CurveV2)==> WETH ==(CurveV2)==> SDT
    SDT: [
      // sdCRV ==(Curve)==> CRV ==(CurveV2)==> WETH ==(CurveV2)==> SDT
      encodePoolHintV2(ADDRESS["CURVE_CRV/sdCRV_V2_POOL"], PoolType.CurveFactoryPlainPool, 2, 1, 0, Action.Swap),
      encodePoolHintV2(ADDRESS["CURVE_crvUSD/ETH/CRV_POOL"], PoolType.CurveTriCryptoPool, 3, 2, 1, Action.Swap),
      encodePoolHintV2(ADDRESS["CURVE_ETH/SDT_POOL"], PoolType.CurveCryptoPool, 2, 0, 1, Action.Swap),
      /* // sdCRV ==(Curve)==> CRV ==(CurveV2)==> crvUSD ==(CurveV2)==> SDT
      encodePoolHintV2(ADDRESS["CURVE_CRV/sdCRV_V2_POOL"], PoolType.CurveFactoryPlainPool, 2, 1, 0, Action.Swap),
      encodePoolHintV2(ADDRESS["CURVE_crvUSD/ETH/CRV_POOL"], PoolType.CurveTriCryptoPool, 3, 2, 0, Action.Swap),
      encodePoolHintV2(ADDRESS["CURVE_crvUSD/frxETH/SDT_POOL"], PoolType.CurveTriCryptoPool, 3, 0, 2, Action.Swap),
      */
    ],
  },
  eCFX: {
    // eCFX ==(CurveV2)==> WETH
    WETH: [encodePoolHintV2(ADDRESS["CURVE_eCFX/ETH_POOL"], PoolType.CurveCryptoPool, 2, 0, 1, Action.Swap)],
  },
  UZD: {
    WETH: [
      encodePoolHintV2(ADDRESS["CURVE_UZD/FRAXBP_POOL"], PoolType.CurveFactoryMetaPool, 2, 0, 1, Action.Swap),
      encodePoolHintV2(ADDRESS.CURVE_FRAXUSDC_POOL, PoolType.CurveBasePool, 2, 1, 1, Action.Remove),
      encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 0, 1, Action.Swap),
    ],
  },
  wBETH: {
    // wBETH ==(Curve)==> WETH
    WETH: [encodePoolHintV2(ADDRESS["CURVE_ETH/wBETH_POOL"], PoolType.CurveETHPool, 2, 1, 0, Action.Swap)],
  },
  MET: {
    // MET ==(UniV3)==> WETH
    WETH: [
      /*
      encodePoolHintV2(ADDRESS.MET_WETH_UNIV3_10000, PoolType.UniswapV3, 2, 0, 1, Action.Swap),
      */
      encodePoolHintV2(ADDRESS.MET_USDC_UNIV3_3000, PoolType.UniswapV3, 2, 0, 1, Action.Swap),
      encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 0, 1, Action.Swap),
    ],
  },
  OGV: {
    // OGV ==(CurveV2)==> WETH
    WETH: [
      encodePoolHintV2(ADDRESS.OGV_WETH_UNIV3_3000, PoolType.UniswapV3, 2, 0, 1, Action.Swap),
      // encodePoolHintV2(ADDRESS["CURVE_OGV/ETH_POOL"], PoolType.CurveCryptoPool, 2, 0, 1, Action.Swap)
    ],
  },
  sdFXS: {
    // sdFXS ==(Curve)==> FXS ==(UniV3)==> WETH
    WETH: [
      encodePoolHintV2(ADDRESS["CURVE_FXS/sdFXS_POOL"], PoolType.CurveFactoryPlainPool, 2, 1, 0, Action.Swap),
      encodePoolHintV2(ADDRESS.FXS_WETH_UNIV3_10000, PoolType.UniswapV3, 2, 0, 1, Action.Swap),
    ],
  },
  CURVE_cvxFXS_TOKEN: {
    cvxFXS: [encodePoolHintV2(ADDRESS.CURVE_cvxFXS_POOL, PoolType.CurveCryptoPool, 2, 1, 1, Action.Remove)],
  },
  GRAI: {
    // GRAI ==(UniV3)==> USDC ==(UniV3)==> WETH
    WETH: [
      encodePoolHintV2(ADDRESS.GRAI_USDC_UNIV3_500, PoolType.UniswapV3, 2, 0, 1, Action.Swap),
      encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 0, 1, Action.Swap),
    ],
  },
  cvxPrisma: {
    // cvxPrisma ==(Curve) ==> PRISMA ==(CurveV2)==> WETH
    WETH: [
      encodePoolHintV2(ADDRESS["CURVE_PRISMA/cvxPrisma_POOL"], PoolType.CurveFactoryPlainPool, 2, 1, 0, Action.Swap),
      encodePoolHintV2(ADDRESS["CURVE_ETH/PRISMA_POOL"], PoolType.CurveCryptoPool, 2, 1, 0, Action.Swap),
    ],
  },
  PRISMA: {
    // PRISMA ==(CurveV2)==> WETH
    WETH: [encodePoolHintV2(ADDRESS["CURVE_ETH/PRISMA_POOL"], PoolType.CurveCryptoPool, 2, 1, 0, Action.Swap)],
  },
  PYUSD: {
    // PYUSD ==(Curve)==> USDC ==(UniV3)==> WETH
    WETH: [
      encodePoolHintV2(
        ADDRESS["CURVE_STABLE_NG_PYUSD/USDC_43_POOL"],
        PoolType.CurveFactoryPlainPool,
        2,
        0,
        1,
        Action.Swap
      ),
      encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 0, 1, Action.Swap),
    ],
  },
  TXJP: {
    WETH: [encodePoolHintV2(ADDRESS["UniV3_TXJP/WETH_3000"], PoolType.UniswapV3, 2, 0, 1, Action.Swap)],
  },
  ZETA: {
    WETH: [encodePoolHintV2(ADDRESS["UniV3_WETH/ZETA_3000"], PoolType.UniswapV3, 2, 1, 0, Action.Swap)],
  },
  crvUSD: {
    WETH: [encodePoolHintV2(ADDRESS["CURVE_crvUSD/ETH/CRV_POOL"], PoolType.CurveTriCryptoPool, 3, 0, 1, Action.Swap)],
  },
  mkUSD: {
    WETH: [
      // mkUSD ==(Curve)==> USDC ==(UniV3)==> WETH
      encodePoolHintV2(
        ADDRESS["CURVE_STABLE_NG_mkUSD/USDC_17_POOL"],
        PoolType.CurveFactoryPlainPool,
        2,
        0,
        1,
        Action.Swap
      ),
      encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 0, 1, Action.Swap),
    ],
  },
  xETH: {
    // PRISMA ==(CurveV2)==> WETH
    WETH: [encodePoolHintV2(ADDRESS["CURVE_ETH/xETH_POOL"], PoolType.CurveCryptoPool, 2, 1, 0, Action.Swap)],
  },
};

/* eslint-disable prettier/prettier */
// prettier-ignore
export const CONVERTER_ROUTRS: { [from: string]: { [to: string]: bigint[] } } = {
  "CURVE_ETH/frxETH": {
    aCRV: [
      // Curve ETH/frxETH LP => WETH => CRV => cvxCRV => aCRV
      encodePoolHintV3(ADDRESS.CURVE_frxETH_TOKEN, PoolTypeV3.CurvePlainPool, 2, 0, 0, Action.Remove),
      encodePoolHintV3(ADDRESS["CURVE_crvUSD/ETH/CRV_POOL"], PoolTypeV3.CurveCryptoPool, 3, 1, 2, Action.Swap),
      encodePoolHintV3(ADDRESS["CURVE_CRV/cvxCRV_POOL"], PoolTypeV3.CurvePlainPool, 2, 0, 1, Action.Swap),
      encodePoolHintV3(TOKENS.aCRV.address, PoolTypeV3.ERC4626, 2, 0, 0, Action.Add),
    ],
  },
  CVX: {
    WETH: [encodePoolHintV3(ADDRESS.CURVE_CVXETH_POOL, PoolTypeV3.CurveCryptoPool, 2, 1, 0, Action.Swap)],
    aCRV: [
      // CVX => WETH => CRV => cvxCRV => aCRV
      encodePoolHintV3(ADDRESS.CURVE_CVXETH_POOL, PoolTypeV3.CurveCryptoPool, 2, 1, 0, Action.Swap),
      encodePoolHintV3(ADDRESS["CURVE_crvUSD/ETH/CRV_POOL"], PoolTypeV3.CurveCryptoPool, 3, 1, 2, Action.Swap),
      encodePoolHintV3(ADDRESS["CURVE_CRV/cvxCRV_POOL"], PoolTypeV3.CurvePlainPool, 2, 0, 1, Action.Swap),
      encodePoolHintV3(TOKENS.aCRV.address, PoolTypeV3.ERC4626, 2, 0, 0, Action.Add),
    ],
    aCVX: [encodePoolHintV3(TOKENS.aCVX.address, PoolTypeV3.ERC4626, 2, 0, 0, Action.Add)],
  },
  FRAX: {
    sfrxETH: [
      encodePoolHintV3(ADDRESS.CURVE_FRAXUSDC_POOL, PoolTypeV3.CurvePlainPool, 2, 0, 1, Action.Swap),
      encodePoolHintV3(ADDRESS["CURVE_USDC/WBTC/ETH_POOL"], PoolTypeV3.CurveCryptoPool, 3, 0, 2, Action.Swap, {use_eth: false}),
      encodePoolHintV3(ADDRESS["CURVE_CRVUSD_WETH/frxETH_15_POOL"], PoolTypeV3.CurvePlainPool, 2, 0, 1, Action.Swap),
      encodePoolHintV3(TOKENS.sfrxETH.address, PoolTypeV3.ERC4626, 2, 0, 0, Action.Add),
    ],
    stETH: [
      encodePoolHintV3(ADDRESS.CURVE_FRAXUSDC_POOL, PoolTypeV3.CurvePlainPool, 2, 0, 1, Action.Swap),
      encodePoolHintV3(ADDRESS["CURVE_USDC/WBTC/ETH_POOL"], PoolTypeV3.CurveCryptoPool, 3, 0, 2, Action.Swap, {use_eth: false}),
      encodePoolHintV3(TOKENS.stETH.address, PoolTypeV3.Lido, 2, 0, 0, Action.Add),
    ],
    wstETH: [
      encodePoolHintV3(ADDRESS.CURVE_FRAXUSDC_POOL, PoolTypeV3.CurvePlainPool, 2, 0, 1, Action.Swap),
      encodePoolHintV3(ADDRESS["CURVE_USDC/WBTC/ETH_POOL"], PoolTypeV3.CurveCryptoPool, 3, 0, 2, Action.Swap, {use_eth: false}),
      encodePoolHintV3(TOKENS.stETH.address, PoolTypeV3.Lido, 2, 0, 0, Action.Add),
      encodePoolHintV3(TOKENS.wstETH.address, PoolTypeV3.Lido, 2, 0, 0, Action.Add),
    ],
  },
  FXN: {
    weETH: [
      encodePoolHintV3(ADDRESS["CURVE_ETH/FXN_POOL"], PoolTypeV3.CurveCryptoPool, 2, 1, 0, Action.Swap),
      encodePoolHintV3(TOKENS.eETH.address, PoolTypeV3.ETHLSDV1, 2, 0, 0, Action.Add, { protocol: 5 }),
      encodePoolHintV3(TOKENS.weETH.address, PoolTypeV3.ETHLSDV1, 2, 0, 0, Action.Add, { protocol: 5 }),
    ],
    wstETH: [
      encodePoolHintV3(ADDRESS["CURVE_ETH/FXN_POOL"], PoolTypeV3.CurveCryptoPool, 2, 1, 0, Action.Swap),
      encodePoolHintV3(TOKENS.stETH.address, PoolTypeV3.Lido, 2, 0, 0, Action.Add),
      encodePoolHintV3(TOKENS.wstETH.address, PoolTypeV3.Lido, 2, 0, 0, Action.Add),
    ],
  },
  USDC: {
    WBTC: [
      encodePoolHintV3(ADDRESS["CURVE_USDC/WBTC/ETH_POOL"], PoolTypeV3.CurveCryptoPool, 3, 0, 1, Action.Swap, {use_eth: false}),
    ],
    aCVX: [
      encodePoolHintV3(ADDRESS["CURVE_USDC/WBTC/ETH_POOL"], PoolTypeV3.CurveCryptoPool, 3, 0, 2, Action.Swap, {use_eth: false}),
      encodePoolHintV3(ADDRESS.CURVE_CVXETH_POOL, PoolTypeV3.CurveCryptoPool, 2, 0, 1, Action.Swap),
      encodePoolHintV3(TOKENS.aCVX.address, PoolTypeV3.ERC4626, 2, 0, 0, Action.Add)
    ],
    apxETH: [
      encodePoolHintV3(ADDRESS["CURVE_USDC/WBTC/ETH_POOL"], PoolTypeV3.CurveCryptoPool, 3, 0, 2, Action.Swap, {use_eth: false}),
      encodePoolHintV3(TOKENS.stETH.address, PoolTypeV3.Lido, 2, 0, 0, Action.Add),
      encodePoolHintV3(ADDRESS["CURVE_STABLE_NG_pxETH/stETH_30_POOL"], PoolTypeV3.CurveStableSwapNG, 2, 1, 0, Action.Swap),
      encodePoolHintV3(TOKENS.apxETH.address, PoolTypeV3.ERC4626, 0, 0, 0, Action.Add)
    ],
    ezETH: [
      encodePoolHintV3(ADDRESS["CURVE_USDC/WBTC/ETH_POOL"], PoolTypeV3.CurveCryptoPool, 3, 0, 2, Action.Swap, {use_eth: false}),
      encodePoolHintV3(ZeroAddress, PoolTypeV3.ETHLSDV1, 0, 0, 0, Action.Add, { protocol: 4 }),
    ],
    sfrxETH: [
      encodePoolHintV3(ADDRESS.USDC_WETH_UNIV3, PoolTypeV3.UniswapV3, 2, 0, 1, Action.Swap, { fee_num: 500 }),
      encodePoolHintV3(ADDRESS["CURVE_CRVUSD_WETH/frxETH_15_POOL"], PoolTypeV3.CurvePlainPool, 2, 0, 1, Action.Swap),
      encodePoolHintV3(TOKENS.sfrxETH.address, PoolTypeV3.ERC4626, 2, 0, 0, Action.Add),
    ],
    stETH: [
      encodePoolHintV3(ADDRESS.USDC_WETH_UNIV3, PoolTypeV3.UniswapV3, 2, 0, 1, Action.Swap, { fee_num: 500 }),
      encodePoolHintV3(TOKENS.stETH.address, PoolTypeV3.Lido, 2, 0, 0, Action.Add),
    ],
    weETH: [
      encodePoolHintV3(ADDRESS["CURVE_USDC/WBTC/ETH_POOL"], PoolTypeV3.CurveCryptoPool, 3, 0, 2, Action.Swap, {use_eth: false}),
      encodePoolHintV3(ADDRESS["CURVE_STABLE_NG_weETH/WETH_22_POOL"], PoolTypeV3.CurveStableSwapNG, 2, 1, 0, Action.Swap),
    ],
    wstETH: [
      encodePoolHintV3(ADDRESS.USDC_WETH_UNIV3, PoolTypeV3.UniswapV3, 2, 0, 1, Action.Swap, { fee_num: 500 }),
      encodePoolHintV3(TOKENS.stETH.address, PoolTypeV3.Lido, 2, 0, 0, Action.Add),
      encodePoolHintV3(TOKENS.wstETH.address, PoolTypeV3.Lido, 2, 0, 0, Action.Add),
    ],
  },
  USDT: {
    WBTC: [
      encodePoolHintV3(ADDRESS["CURVE_USDT/WBTC/ETH_POOL"], PoolTypeV3.CurveCryptoPool, 3, 0, 1, Action.Swap, {use_eth: false}),
    ],
    aCVX: [
      encodePoolHintV3(ADDRESS["CURVE_USDT/WBTC/ETH_POOL"], PoolTypeV3.CurveCryptoPool, 3, 0, 2, Action.Swap, {use_eth: false}),
      encodePoolHintV3(ADDRESS.CURVE_CVXETH_POOL, PoolTypeV3.CurveCryptoPool, 2, 0, 1, Action.Swap),
      encodePoolHintV3(TOKENS.aCVX.address, PoolTypeV3.ERC4626, 2, 0, 0, Action.Add)
    ],
    apxETH: [
      encodePoolHintV3(ADDRESS["CURVE_USDT/WBTC/ETH_POOL"], PoolTypeV3.CurveCryptoPool, 3, 0, 2, Action.Swap, {use_eth: false}),
      encodePoolHintV3(TOKENS.stETH.address, PoolTypeV3.Lido, 2, 0, 0, Action.Add),
      encodePoolHintV3(ADDRESS["CURVE_STABLE_NG_pxETH/stETH_30_POOL"], PoolTypeV3.CurveStableSwapNG, 2, 1, 0, Action.Swap),
      encodePoolHintV3(TOKENS.apxETH.address, PoolTypeV3.ERC4626, 0, 0, 0, Action.Add)
    ],
    ezETH: [
      encodePoolHintV3(ADDRESS["CURVE_USDT/WBTC/ETH_POOL"], PoolTypeV3.CurveCryptoPool, 3, 0, 2, Action.Swap, {use_eth: false}),
      encodePoolHintV3(ZeroAddress, PoolTypeV3.ETHLSDV1, 0, 0, 0, Action.Add, { protocol: 4 }),
    ],
    sfrxETH: [
      encodePoolHintV3(ADDRESS["CURVE_USDT/WBTC/ETH_POOL"], PoolTypeV3.CurveCryptoPool, 3, 0, 2, Action.Swap, {use_eth: false}),
      encodePoolHintV3(ADDRESS["CURVE_CRVUSD_WETH/frxETH_15_POOL"], PoolTypeV3.CurvePlainPool, 2, 0, 1, Action.Swap),
      encodePoolHintV3(TOKENS.sfrxETH.address, PoolTypeV3.ERC4626, 2, 0, 0, Action.Add),
    ],
    stETH: [
      encodePoolHintV3(ADDRESS["CURVE_USDT/WBTC/ETH_POOL"], PoolTypeV3.CurveCryptoPool, 3, 0, 2, Action.Swap, {use_eth: false}),
      encodePoolHintV3(TOKENS.stETH.address, PoolTypeV3.Lido, 9, 0, 0, Action.Add),
    ],
    weETH: [
      encodePoolHintV3(ADDRESS["CURVE_USDT/WBTC/ETH_POOL"], PoolTypeV3.CurveCryptoPool, 3, 0, 2, Action.Swap, {use_eth: false}),
      encodePoolHintV3(ADDRESS["CURVE_STABLE_NG_weETH/WETH_22_POOL"], PoolTypeV3.CurveStableSwapNG, 2, 1, 0, Action.Swap),
    ],
    wstETH: [
      encodePoolHintV3(ADDRESS["CURVE_USDT/WBTC/ETH_POOL"], PoolTypeV3.CurveCryptoPool, 3, 0, 2, Action.Swap, {use_eth: false}),
      encodePoolHintV3(TOKENS.stETH.address, PoolTypeV3.Lido, 9, 0, 0, Action.Add),
      encodePoolHintV3(TOKENS.wstETH.address, PoolTypeV3.Lido, 9, 0, 0, Action.Add),
    ],
  },
  WBTC: {
    WETH: [encodePoolHintV3(ADDRESS.WBTC_WETH_UNIV3_500, PoolTypeV3.UniswapV3, 2, 0, 1, Action.Swap, { fee_num: 500 })],
    USDT: [
      encodePoolHintV3(ADDRESS["CURVE_USDT/WBTC/ETH_POOL"], PoolTypeV3.CurveCryptoPool, 3, 1, 0, Action.Swap, {use_eth: false}),
    ],
    USDC: [
      encodePoolHintV3(ADDRESS["CURVE_USDC/WBTC/ETH_POOL"], PoolTypeV3.CurveCryptoPool, 3, 1, 0, Action.Swap, {use_eth: false}),
    ],
    wstETH: [
      encodePoolHintV3(ADDRESS.WBTC_WETH_UNIV3_500, PoolTypeV3.UniswapV3, 2, 0, 1, Action.Swap, { fee_num: 500 }),
      encodePoolHintV3(TOKENS.stETH.address, PoolTypeV3.Lido, 2, 0, 0, Action.Add),
      encodePoolHintV3(TOKENS.wstETH.address, PoolTypeV3.Lido, 2, 0, 0, Action.Add),
    ]
  },
  WETH: {
    CVX: [encodePoolHintV3(ADDRESS.CURVE_CVXETH_POOL, PoolTypeV3.CurveCryptoPool, 2, 0, 1, Action.Swap)],
    FXN: [encodePoolHintV3(ADDRESS["CURVE_ETH/FXN_POOL"], PoolTypeV3.CurveCryptoPool, 2, 0, 1, Action.Swap)],
    WBTC: [encodePoolHintV3(ADDRESS.WBTC_WETH_UNIV3_500, PoolTypeV3.UniswapV3, 2, 1, 0, Action.Swap, { fee_num: 500 })],
    aCVX: [
      encodePoolHintV3(ADDRESS.CURVE_CVXETH_POOL, PoolTypeV3.CurveCryptoPool, 2, 0, 1, Action.Swap),
      encodePoolHintV3(TOKENS.aCVX.address, PoolTypeV3.ERC4626, 2, 0, 0, Action.Add),
    ],
    apxETH: [
      encodePoolHintV3(TOKENS.stETH.address, PoolTypeV3.Lido, 2, 0, 0, Action.Add),
      encodePoolHintV3(ADDRESS["CURVE_STABLE_NG_pxETH/stETH_30_POOL"], PoolTypeV3.CurveStableSwapNG, 2, 1, 0, Action.Swap),
      encodePoolHintV3(TOKENS.apxETH.address, PoolTypeV3.ERC4626, 0, 0, 0, Action.Add)
    ],
    ezETH: [encodePoolHintV3(ZeroAddress, PoolTypeV3.ETHLSDV1, 0, 0, 0, Action.Add, { protocol: 4 })],
    sfrxETH: [
      encodePoolHintV3(ADDRESS["CURVE_CRVUSD_WETH/frxETH_15_POOL"], PoolTypeV3.CurvePlainPool, 2, 0, 1, Action.Swap),
      encodePoolHintV3(TOKENS.sfrxETH.address, PoolTypeV3.ERC4626, 2, 0, 0, Action.Add),
    ],
    stETH: [
      encodePoolHintV3(TOKENS.stETH.address, PoolTypeV3.Lido, 2, 0, 0, Action.Add),
    ],
    weETH: [
      encodePoolHintV3(ADDRESS["CURVE_STABLE_NG_weETH/WETH_22_POOL"], PoolTypeV3.CurveStableSwapNG, 2, 1, 0, Action.Swap),
    ],
    wstETH: [
      encodePoolHintV3(TOKENS.stETH.address, PoolTypeV3.Lido, 2, 0, 0, Action.Add),
      encodePoolHintV3(TOKENS.wstETH.address, PoolTypeV3.Lido, 2, 0, 0, Action.Add),
    ],
  },
  aCVX: {
    CVX: [encodePoolHintV3(TOKENS.aCVX.address, PoolTypeV3.ERC4626, 2, 0, 0, Action.Remove)],
    ETH: [
      encodePoolHintV3(TOKENS.aCVX.address, PoolTypeV3.ERC4626, 2, 0, 0, Action.Remove),
      encodePoolHintV3(ADDRESS.CURVE_CVXETH_POOL, PoolTypeV3.CurveCryptoPool, 2, 1, 0, Action.Swap),
      encodePoolHintV3(ZeroAddress, PoolTypeV3.WETH, 0, 0, 0, Action.Remove),
    ],
    USDC: [
      encodePoolHintV3(TOKENS.aCVX.address, PoolTypeV3.ERC4626, 2, 0, 0, Action.Remove),
      encodePoolHintV3(ADDRESS.CURVE_CVXETH_POOL, PoolTypeV3.CurveCryptoPool, 2, 1, 0, Action.Swap),
      encodePoolHintV3(ADDRESS["CURVE_USDC/WBTC/ETH_POOL"], PoolTypeV3.CurveCryptoPool, 3, 2, 0, Action.Swap, {use_eth: false}),
    ],
    USDT: [
      encodePoolHintV3(TOKENS.aCVX.address, PoolTypeV3.ERC4626, 2, 0, 0, Action.Remove),
      encodePoolHintV3(ADDRESS.CURVE_CVXETH_POOL, PoolTypeV3.CurveCryptoPool, 2, 1, 0, Action.Swap),
      encodePoolHintV3(ADDRESS["CURVE_USDT/WBTC/ETH_POOL"], PoolTypeV3.CurveCryptoPool, 3, 2, 0, Action.Swap, {use_eth: false}),
    ],
    WETH: [
      encodePoolHintV3(TOKENS.aCVX.address, PoolTypeV3.ERC4626, 2, 0, 0, Action.Remove),
      encodePoolHintV3(ADDRESS.CURVE_CVXETH_POOL, PoolTypeV3.CurveCryptoPool, 2, 1, 0, Action.Swap),
    ],
    aCRV: [
      // aCVX ==> CVX => WETH => CRV => cvxCRV => aCRV
      encodePoolHintV3(TOKENS.aCVX.address, PoolTypeV3.ERC4626, 2, 0, 0, Action.Remove),
      encodePoolHintV3(ADDRESS.CURVE_CVXETH_POOL, PoolTypeV3.CurveCryptoPool, 2, 1, 0, Action.Swap),
      encodePoolHintV3(ADDRESS["CURVE_crvUSD/ETH/CRV_POOL"], PoolTypeV3.CurveCryptoPool, 3, 1, 2, Action.Swap),
      encodePoolHintV3(ADDRESS["CURVE_CRV/cvxCRV_POOL"], PoolTypeV3.CurvePlainPool, 2, 0, 1, Action.Swap),
      encodePoolHintV3(TOKENS.aCRV.address, PoolTypeV3.ERC4626, 2, 0, 0, Action.Add),
    ],
  },
  aFXS: {
    aCRV: [
      // aFXS => cvxFXS => FXS => WETH => CRV => cvxCRV => aCRV
      encodePoolHintV3(TOKENS.aFXS.address, PoolTypeV3.ERC4626, 2, 0, 0, Action.Remove),
      encodePoolHintV3(ADDRESS["CURVE_FXS/cvxFXS_POOL"], PoolTypeV3.CurvePlainPool, 2, 1, 0, Action.Swap),
      encodePoolHintV3(ADDRESS.FXS_WETH_UNIV2, PoolTypeV3.UniswapV2, 2, 0, 1, Action.Swap, {fee_num: 997000}),
      encodePoolHintV3(ADDRESS["CURVE_crvUSD/ETH/CRV_POOL"], PoolTypeV3.CurveCryptoPool, 3, 1, 2, Action.Swap),
      encodePoolHintV3(ADDRESS["CURVE_CRV/cvxCRV_POOL"], PoolTypeV3.CurvePlainPool, 2, 0, 1, Action.Swap),
      encodePoolHintV3(TOKENS.aCRV.address, PoolTypeV3.ERC4626, 2, 0, 0, Action.Add),
    ],
  },
  apxETH: {
    ETH: [
      encodePoolHintV3(TOKENS.apxETH.address, PoolTypeV3.ERC4626, 0, 0, 0, Action.Remove),
      encodePoolHintV3(ADDRESS["CURVE_STABLE_NG_pxETH/stETH_30_POOL"], PoolTypeV3.CurveStableSwapNG, 2, 0, 1, Action.Swap),
      encodePoolHintV3(ADDRESS.CURVE_stETH_POOL, PoolTypeV3.CurvePlainPool, 2, 1, 0, Action.Swap, {use_eth: false}),
      encodePoolHintV3(ZeroAddress, PoolTypeV3.WETH, 0, 0, 0, Action.Remove),
    ],
    USDC: [
      encodePoolHintV3(TOKENS.apxETH.address, PoolTypeV3.ERC4626, 0, 0, 0, Action.Remove),
      encodePoolHintV3(ADDRESS["CURVE_STABLE_NG_pxETH/stETH_30_POOL"], PoolTypeV3.CurveStableSwapNG, 2, 0, 1, Action.Swap),
      encodePoolHintV3(ADDRESS.CURVE_stETH_POOL, PoolTypeV3.CurvePlainPool, 2, 1, 0, Action.Swap, {use_eth: false}),
      encodePoolHintV3(ADDRESS["CURVE_USDC/WBTC/ETH_POOL"], PoolTypeV3.CurveCryptoPool, 3, 2, 0, Action.Swap, {use_eth: false}),
    ],
    USDT: [
      encodePoolHintV3(TOKENS.apxETH.address, PoolTypeV3.ERC4626, 0, 0, 0, Action.Remove),
      encodePoolHintV3(ADDRESS["CURVE_STABLE_NG_pxETH/stETH_30_POOL"], PoolTypeV3.CurveStableSwapNG, 2, 0, 1, Action.Swap),
      encodePoolHintV3(ADDRESS.CURVE_stETH_POOL, PoolTypeV3.CurvePlainPool, 2, 1, 0, Action.Swap, {use_eth: false}),
      encodePoolHintV3(ADDRESS["CURVE_USDT/WBTC/ETH_POOL"], PoolTypeV3.CurveCryptoPool, 3, 2, 0, Action.Swap, {use_eth: false}),
    ],
    WETH: [
      encodePoolHintV3(TOKENS.apxETH.address, PoolTypeV3.ERC4626, 0, 0, 0, Action.Remove),
      encodePoolHintV3(ADDRESS["CURVE_STABLE_NG_pxETH/stETH_30_POOL"], PoolTypeV3.CurveStableSwapNG, 2, 0, 1, Action.Swap),
      encodePoolHintV3(ADDRESS.CURVE_stETH_POOL, PoolTypeV3.CurvePlainPool, 2, 1, 0, Action.Swap, {use_eth: false}),
    ],
    pxETH: [
      encodePoolHintV3(TOKENS.apxETH.address, PoolTypeV3.ERC4626, 0, 0, 0, Action.Remove)
    ],
    stETH: [
      encodePoolHintV3(TOKENS.apxETH.address, PoolTypeV3.ERC4626, 0, 0, 0, Action.Remove),
      encodePoolHintV3(ADDRESS["CURVE_STABLE_NG_pxETH/stETH_30_POOL"], PoolTypeV3.CurveStableSwapNG, 2, 0, 1, Action.Swap),
    ],
  },
  crvUSD: {
    sfrxETH: [
      encodePoolHintV3(ADDRESS["CURVE_USDC/crvUSD_POOL"], PoolTypeV3.CurvePlainPool, 2, 1, 0, Action.Swap),
      encodePoolHintV3(ADDRESS["CURVE_USDC/WBTC/ETH_POOL"], PoolTypeV3.CurveCryptoPool, 3, 0, 2, Action.Swap, {use_eth: false}),
      encodePoolHintV3(ADDRESS["CURVE_CRVUSD_WETH/frxETH_15_POOL"], PoolTypeV3.CurvePlainPool, 2, 0, 1, Action.Swap),
      encodePoolHintV3(TOKENS.sfrxETH.address, PoolTypeV3.ERC4626, 2, 0, 0, Action.Add),
    ],
    stETH: [
      encodePoolHintV3(ADDRESS["CURVE_USDC/crvUSD_POOL"], PoolTypeV3.CurvePlainPool, 2, 1, 0, Action.Swap),
      encodePoolHintV3(ADDRESS["CURVE_USDC/WBTC/ETH_POOL"], PoolTypeV3.CurveCryptoPool, 3, 0, 2, Action.Swap, {use_eth: false}),
      encodePoolHintV3(TOKENS.stETH.address, PoolTypeV3.Lido, 2, 0, 0, Action.Add),
    ],
    wstETH: [
      encodePoolHintV3(ADDRESS["CURVE_USDC/crvUSD_POOL"], PoolTypeV3.CurvePlainPool, 2, 1, 0, Action.Swap),
      encodePoolHintV3(ADDRESS["CURVE_USDC/WBTC/ETH_POOL"], PoolTypeV3.CurveCryptoPool, 3, 0, 2, Action.Swap, {use_eth: false}),
      encodePoolHintV3(TOKENS.stETH.address, PoolTypeV3.Lido, 2, 0, 0, Action.Add),
      encodePoolHintV3(TOKENS.wstETH.address, PoolTypeV3.Lido, 2, 0, 0, Action.Add),
    ],
  },
  cvxCRV: {
    WETH: [
      encodePoolHintV3(ADDRESS["CURVE_CRV/cvxCRV_POOL"], PoolTypeV3.CurvePlainPool, 2, 1, 0, Action.Swap),
      encodePoolHintV3(ADDRESS["CURVE_crvUSD/ETH/CRV_POOL"], PoolTypeV3.CurveCryptoPool, 3, 2, 1, Action.Swap),
    ],
  },
  eETH: {
    weETH: [encodePoolHintV3(TOKENS.weETH.address, PoolTypeV3.ETHLSDV1, 0, 0, 0, Action.Add, { protocol: 5 })]
  },
  ezETH: {
    ETH: [
      encodePoolHintV3(ADDRESS["BalancerV2_ezETH/WETH_Stable"], PoolTypeV3.BalancerV2, 3, 1, 2, Action.Swap),
      encodePoolHintV3(ZeroAddress, PoolTypeV3.WETH, 0, 0, 0, Action.Remove),
    ],
    USDC: [
      encodePoolHintV3(ADDRESS["BalancerV2_ezETH/WETH_Stable"], PoolTypeV3.BalancerV2, 3, 1, 2, Action.Swap),
      encodePoolHintV3(ADDRESS["CURVE_USDC/WBTC/ETH_POOL"], PoolTypeV3.CurveCryptoPool, 3, 2, 0, Action.Swap, {use_eth: false}),
    ],
    USDT: [
      encodePoolHintV3(ADDRESS["BalancerV2_ezETH/WETH_Stable"], PoolTypeV3.BalancerV2, 3, 1, 2, Action.Swap),
      encodePoolHintV3(ADDRESS["CURVE_USDT/WBTC/ETH_POOL"], PoolTypeV3.CurveCryptoPool, 3, 2, 0, Action.Swap, {use_eth: false}),
    ],
    WETH: [encodePoolHintV3(ADDRESS["BalancerV2_ezETH/WETH_Stable"], PoolTypeV3.BalancerV2, 3, 1, 2, Action.Swap)],
    stETH: [
      encodePoolHintV3(ADDRESS["BalancerV2_ezETH/WETH_Stable"], PoolTypeV3.BalancerV2, 3, 1, 2, Action.Swap),
      encodePoolHintV3(TOKENS.stETH.address, PoolTypeV3.Lido, 2, 0, 0, Action.Add),
    ],
    wBETH: [
      encodePoolHintV3(ADDRESS["BalancerV2_ezETH/WETH_Stable"], PoolTypeV3.BalancerV2, 3, 1, 2, Action.Swap),
      encodePoolHintV3(TOKENS.wBETH.address, PoolTypeV3.ETHLSDV1, 2, 0, 0, Action.Add, { protocol: 0 })
    ],
    wstETH: [
      encodePoolHintV3(ADDRESS["BalancerV2_ezETH/WETH_Stable"], PoolTypeV3.BalancerV2, 3, 1, 2, Action.Swap),
      encodePoolHintV3(TOKENS.stETH.address, PoolTypeV3.Lido, 2, 0, 0, Action.Add),
      encodePoolHintV3(TOKENS.wstETH.address, PoolTypeV3.Lido, 2, 0, 0, Action.Add),
    ],
  },
  frxETH: {
    sfrxETH: [encodePoolHintV3(TOKENS.sfrxETH.address, PoolTypeV3.ERC4626, 2, 0, 0, Action.Add)],
  },
  pxETH: {
    apxETH: [encodePoolHintV3(TOKENS.apxETH.address, PoolTypeV3.ERC4626, 0, 0, 0, Action.Add)],
  },
  sdCRV: {
    aCRV: [
      // sdCRV => CRV => cvxCRV => aCRV
      encodePoolHintV3(ADDRESS["CURVE_CRV/sdCRV_V2_POOL"], PoolTypeV3.CurvePlainPool, 2, 1, 0, Action.Swap),
      encodePoolHintV3(ADDRESS["CURVE_CRV/cvxCRV_POOL"], PoolTypeV3.CurvePlainPool, 2, 0, 1, Action.Swap),
      encodePoolHintV3(TOKENS.aCRV.address, PoolTypeV3.ERC4626, 2, 0, 0, Action.Add),
    ],
  },
  sfrxETH: {
    ETH: [
      encodePoolHintV3(TOKENS.sfrxETH.address, PoolTypeV3.ERC4626, 2, 0, 0, Action.Remove),
      encodePoolHintV3(ADDRESS["CURVE_CRVUSD_WETH/frxETH_15_POOL"], PoolTypeV3.CurvePlainPool, 2, 1, 0, Action.Swap),
      encodePoolHintV3(ZeroAddress, PoolTypeV3.WETH, 0, 0, 0, Action.Remove),
    ],
    FRAX: [
      encodePoolHintV3(TOKENS.sfrxETH.address, PoolTypeV3.ERC4626, 2, 0, 0, Action.Remove),
      encodePoolHintV3(ADDRESS["CURVE_CRVUSD_WETH/frxETH_15_POOL"], PoolTypeV3.CurvePlainPool, 2, 1, 0, Action.Swap),
      encodePoolHintV3(ADDRESS["CURVE_USDC/WBTC/ETH_POOL"], PoolTypeV3.CurveCryptoPool, 3, 2, 0, Action.Swap, {use_eth: false}),
      encodePoolHintV3(ADDRESS.CURVE_FRAXUSDC_POOL, PoolTypeV3.CurvePlainPool, 2, 1, 0, Action.Swap),
    ],
    USDC: [
      encodePoolHintV3(TOKENS.sfrxETH.address, PoolTypeV3.ERC4626, 2, 0, 0, Action.Remove),
      encodePoolHintV3(ADDRESS["CURVE_CRVUSD_WETH/frxETH_15_POOL"], PoolTypeV3.CurvePlainPool, 2, 1, 0, Action.Swap),
      encodePoolHintV3(ADDRESS["CURVE_USDC/WBTC/ETH_POOL"], PoolTypeV3.CurveCryptoPool, 3, 2, 0, Action.Swap, {use_eth: false}),
    ],
    USDT: [
      encodePoolHintV3(TOKENS.sfrxETH.address, PoolTypeV3.ERC4626, 2, 0, 0, Action.Remove),
      encodePoolHintV3(ADDRESS["CURVE_CRVUSD_WETH/frxETH_15_POOL"], PoolTypeV3.CurvePlainPool, 2, 1, 0, Action.Swap),
      encodePoolHintV3(ADDRESS["CURVE_USDT/WBTC/ETH_POOL"], PoolTypeV3.CurveCryptoPool, 3, 2, 0, Action.Swap, {use_eth: false}),
    ],
    WETH: [
      encodePoolHintV3(TOKENS.sfrxETH.address, PoolTypeV3.ERC4626, 2, 0, 0, Action.Remove),
      encodePoolHintV3(ADDRESS["CURVE_CRVUSD_WETH/frxETH_15_POOL"], PoolTypeV3.CurvePlainPool, 2, 1, 0, Action.Swap),
    ],
    crvUSD: [
      encodePoolHintV3(TOKENS.sfrxETH.address, PoolTypeV3.ERC4626, 2, 0, 0, Action.Remove),
      encodePoolHintV3(ADDRESS["CURVE_CRVUSD_WETH/frxETH_15_POOL"], PoolTypeV3.CurvePlainPool, 2, 1, 0, Action.Swap),
      encodePoolHintV3(ADDRESS["CURVE_USDC/WBTC/ETH_POOL"], PoolTypeV3.CurveCryptoPool, 3, 2, 0, Action.Swap, {use_eth: false}),
      encodePoolHintV3(ADDRESS["CURVE_USDC/crvUSD_POOL"], PoolTypeV3.CurvePlainPool, 2, 0, 1, Action.Swap),
    ],
    frxETH: [encodePoolHintV3(TOKENS.sfrxETH.address, PoolTypeV3.ERC4626, 2, 0, 0, Action.Remove)],
    wstETH: [
      encodePoolHintV3(TOKENS.sfrxETH.address, PoolTypeV3.ERC4626, 2, 0, 0, Action.Remove),
      encodePoolHintV3(ADDRESS["CURVE_CRVUSD_WETH/frxETH_15_POOL"], PoolTypeV3.CurvePlainPool, 2, 1, 0, Action.Swap),
      encodePoolHintV3(TOKENS.stETH.address, PoolTypeV3.Lido, 2, 0, 0, Action.Add),
      encodePoolHintV3(TOKENS.wstETH.address, PoolTypeV3.Lido, 2, 0, 0, Action.Add),
    ],
  },
  stETH: {
    FRAX: [
      encodePoolHintV3(ADDRESS.CURVE_stETH_POOL, PoolTypeV3.CurvePlainPool, 2, 1, 0, Action.Swap, {use_eth: false}),
      encodePoolHintV3(ADDRESS["CURVE_USDC/WBTC/ETH_POOL"], PoolTypeV3.CurveCryptoPool, 3, 2, 0, Action.Swap, {use_eth: false}),
      encodePoolHintV3(ADDRESS.CURVE_FRAXUSDC_POOL, PoolTypeV3.CurvePlainPool, 2, 1, 0, Action.Swap),
    ],
    USDC: [
      encodePoolHintV3(ADDRESS.CURVE_stETH_POOL, PoolTypeV3.CurvePlainPool, 2, 1, 0, Action.Swap, {use_eth: false}),
      encodePoolHintV3(ADDRESS["CURVE_USDC/WBTC/ETH_POOL"], PoolTypeV3.CurveCryptoPool, 3, 2, 0, Action.Swap, {use_eth: false}),
    ],
    USDT: [
      encodePoolHintV3(ADDRESS.CURVE_stETH_POOL, PoolTypeV3.CurvePlainPool, 2, 1, 0, Action.Swap, {use_eth: false}),
      encodePoolHintV3(ADDRESS["CURVE_USDT/WBTC/ETH_POOL"], PoolTypeV3.CurveCryptoPool, 3, 2, 0, Action.Swap, {use_eth: false}),
    ],
    WETH: [
      encodePoolHintV3(ADDRESS.CURVE_stETH_POOL, PoolTypeV3.CurvePlainPool, 2, 1, 0, Action.Swap, {use_eth: false}),
    ],
    apxETH: [
      encodePoolHintV3(ADDRESS["CURVE_STABLE_NG_pxETH/stETH_30_POOL"], PoolTypeV3.CurveStableSwapNG, 2, 1, 0, Action.Swap),
      encodePoolHintV3(TOKENS.apxETH.address, PoolTypeV3.ERC4626, 0, 0, 0, Action.Add)
    ],
    crvUSD: [
      encodePoolHintV3(ADDRESS.CURVE_stETH_POOL, PoolTypeV3.CurvePlainPool, 2, 1, 0, Action.Swap, {use_eth: false}),
      encodePoolHintV3(ADDRESS["CURVE_USDC/WBTC/ETH_POOL"], PoolTypeV3.CurveCryptoPool, 3, 2, 0, Action.Swap, {use_eth: false}),
      encodePoolHintV3(ADDRESS["CURVE_USDC/crvUSD_POOL"], PoolTypeV3.CurvePlainPool, 2, 0, 1, Action.Swap),
    ],
    ezETH: [encodePoolHintV3(ZeroAddress, PoolTypeV3.ETHLSDV1, 0, 2, 2, Action.Add, { protocol: 4 })],
    wstETH: [encodePoolHintV3(TOKENS.wstETH.address, PoolTypeV3.Lido, 2, 0, 0, Action.Add)],
  },
  wBETH: {
    ezETH: [encodePoolHintV3(ZeroAddress, PoolTypeV3.ETHLSDV1, 2, 0, 0, Action.Add, { protocol: 4 })],
  },
  weETH: {
    ETH: [
      encodePoolHintV3(ADDRESS["CURVE_STABLE_NG_weETH/WETH_22_POOL"], PoolTypeV3.CurveStableSwapNG, 2, 0, 1, Action.Swap),
      encodePoolHintV3(ZeroAddress, PoolTypeV3.WETH, 0, 0, 0, Action.Remove),
    ],
    USDC: [
      encodePoolHintV3(ADDRESS["CURVE_STABLE_NG_weETH/WETH_22_POOL"], PoolTypeV3.CurveStableSwapNG, 2, 0, 1, Action.Swap),
      encodePoolHintV3(ADDRESS["CURVE_USDC/WBTC/ETH_POOL"], PoolTypeV3.CurveCryptoPool, 3, 2, 0, Action.Swap, {use_eth: false}),
    ],
    USDT: [
      encodePoolHintV3(ADDRESS["CURVE_STABLE_NG_weETH/WETH_22_POOL"], PoolTypeV3.CurveStableSwapNG, 2, 0, 1, Action.Swap),
      encodePoolHintV3(ADDRESS["CURVE_USDT/WBTC/ETH_POOL"], PoolTypeV3.CurveCryptoPool, 3, 2, 0, Action.Swap, {use_eth: false}),
    ],
    WETH: [
      encodePoolHintV3(ADDRESS["CURVE_STABLE_NG_weETH/WETH_22_POOL"], PoolTypeV3.CurveStableSwapNG, 2, 0, 1, Action.Swap),
    ],
    aCRV: [
      encodePoolHintV3(ADDRESS["CURVE_STABLE_NG_weETH/WETH_22_POOL"], PoolTypeV3.CurveStableSwapNG, 2, 0, 1, Action.Swap),
      encodePoolHintV3(ADDRESS["CURVE_crvUSD/ETH/CRV_POOL"], PoolTypeV3.CurveCryptoPool, 3, 1, 2, Action.Swap),
      encodePoolHintV3(ADDRESS["CURVE_CRV/cvxCRV_POOL"], PoolTypeV3.CurvePlainPool, 2, 0, 1, Action.Swap),
      encodePoolHintV3(TOKENS.aCRV.address, PoolTypeV3.ERC4626, 2, 0, 0, Action.Add),
    ],
    eETH: [encodePoolHintV3(TOKENS.weETH.address, PoolTypeV3.ETHLSDV1, 0, 0, 0, Action.Remove, { protocol: 5 })],
    wstETH: [
      encodePoolHintV3(ADDRESS["CURVE_STABLE_NG_weETH/WETH_22_POOL"], PoolTypeV3.CurveStableSwapNG, 2, 0, 1, Action.Swap),
      encodePoolHintV3(TOKENS.stETH.address, PoolTypeV3.Lido, 2, 0, 0, Action.Add),
      encodePoolHintV3(TOKENS.wstETH.address, PoolTypeV3.Lido, 2, 0, 0, Action.Add),
    ],
  },
  wstETH: {
    ETH: [
      encodePoolHintV3(TOKENS.wstETH.address, PoolTypeV3.Lido, 2, 0, 0, Action.Remove),
      encodePoolHintV3(ADDRESS.CURVE_stETH_POOL, PoolTypeV3.CurvePlainPool, 2, 1, 0, Action.Swap),
      encodePoolHintV3(ZeroAddress, PoolTypeV3.WETH, 0, 0, 0, Action.Remove),
    ],
    FRAX: [
      encodePoolHintV3(TOKENS.wstETH.address, PoolTypeV3.Lido, 2, 0, 0, Action.Remove),
      encodePoolHintV3(ADDRESS.CURVE_stETH_POOL, PoolTypeV3.CurvePlainPool, 2, 1, 0, Action.Swap),
      encodePoolHintV3(ADDRESS["CURVE_USDC/WBTC/ETH_POOL"], PoolTypeV3.CurveCryptoPool, 3, 2, 0, Action.Swap, {use_eth: false}),
      encodePoolHintV3(ADDRESS.CURVE_FRAXUSDC_POOL, PoolTypeV3.CurvePlainPool, 2, 1, 0, Action.Swap),
    ],
    USDC: [
      encodePoolHintV3(TOKENS.wstETH.address, PoolTypeV3.Lido, 2, 0, 0, Action.Remove),
      encodePoolHintV3(ADDRESS.CURVE_stETH_POOL, PoolTypeV3.CurvePlainPool, 2, 1, 0, Action.Swap),
      encodePoolHintV3(ADDRESS["CURVE_USDC/WBTC/ETH_POOL"], PoolTypeV3.CurveCryptoPool, 3, 2, 0, Action.Swap, {use_eth: false}),
    ],
    USDT: [
      encodePoolHintV3(TOKENS.wstETH.address, PoolTypeV3.Lido, 2, 0, 0, Action.Remove),
      encodePoolHintV3(ADDRESS.CURVE_stETH_POOL, PoolTypeV3.CurvePlainPool, 2, 1, 0, Action.Swap),
      encodePoolHintV3(ADDRESS["CURVE_USDT/WBTC/ETH_POOL"], PoolTypeV3.CurveCryptoPool, 3, 2, 0, Action.Swap, {use_eth: false}),
    ],
    WETH: [
      encodePoolHintV3(TOKENS.wstETH.address, PoolTypeV3.Lido, 2, 0, 0, Action.Remove),
      encodePoolHintV3(ADDRESS.CURVE_stETH_POOL, PoolTypeV3.CurvePlainPool, 2, 1, 0, Action.Swap),
    ],
    aCRV: [
      encodePoolHintV3(TOKENS.wstETH.address, PoolTypeV3.Lido, 2, 0, 0, Action.Remove),
      encodePoolHintV3(ADDRESS.CURVE_stETH_POOL, PoolTypeV3.CurvePlainPool, 2, 1, 0, Action.Swap),
      encodePoolHintV3(ADDRESS["CURVE_crvUSD/ETH/CRV_POOL"], PoolTypeV3.CurveCryptoPool, 3, 1, 2, Action.Swap),
      encodePoolHintV3(ADDRESS["CURVE_CRV/cvxCRV_POOL"], PoolTypeV3.CurvePlainPool, 2, 0, 1, Action.Swap),
      encodePoolHintV3(TOKENS.aCRV.address, PoolTypeV3.ERC4626, 2, 0, 0, Action.Add),
    ],
    crvUSD: [
      encodePoolHintV3(TOKENS.wstETH.address, PoolTypeV3.Lido, 2, 0, 0, Action.Remove),
      encodePoolHintV3(ADDRESS.CURVE_stETH_POOL, PoolTypeV3.CurvePlainPool, 2, 1, 0, Action.Swap),
      encodePoolHintV3(ADDRESS["CURVE_USDC/WBTC/ETH_POOL"], PoolTypeV3.CurveCryptoPool, 3, 2, 0, Action.Swap, {use_eth: false}),
      encodePoolHintV3(ADDRESS["CURVE_USDC/crvUSD_POOL"], PoolTypeV3.CurvePlainPool, 2, 0, 1, Action.Swap),
    ],
    ezETH: [
      encodePoolHintV3(TOKENS.wstETH.address, PoolTypeV3.Lido, 2, 0, 0, Action.Remove),
      encodePoolHintV3(ZeroAddress, PoolTypeV3.ETHLSDV1, 0, 2, 2, Action.Add, { protocol: 4 })
    ],
    stETH: [encodePoolHintV3(TOKENS.wstETH.address, PoolTypeV3.Lido, 2, 0, 0, Action.Remove)],
  },
};
/* eslint-enable prettier/prettier */

export function encodeMultiPath(
  paths: bigint[][],
  parts: bigint[]
): {
  encoding: bigint;
  routes: bigint[];
} {
  assert(parts.length === paths.length, "mismatch array length");
  const sum = parts.reduce((sum, v) => sum + v, 0n);
  const routes = [];
  let encoding = 0n;
  for (let i = 0; i < parts.length; ++i) {
    const ratio = (parts[i] * toBigInt(0xfffff)) / sum;
    const length = toBigInt(paths[i].length);
    encoding |= ((length << 20n) | ratio) << toBigInt(i * 32);
    routes.push(...paths[i]);
  }
  return { encoding, routes };
}

export function showZapRoute(src: string, dst: string, space?: number) {
  const routes = ZAP_ROUTES[src][dst];
  console.log(
    " ".repeat(space ?? 0),
    `${src}[${TOKENS[src].address}] => ${dst}[${TOKENS[dst].address}]:`,
    `[${routes.map((r) => `"0x${r.toString(16)}"`).join(",")}]`
  );
  routes.forEach((route, index) => {
    console.log(" ".repeat(space ?? 0), `  route #${index + 1}: ${decodePoolV3(route)}`);
  });
}

export function showConverterRoute(src: string, dst: string, space?: number, decode?: boolean) {
  const routes = CONVERTER_ROUTRS[src][dst];
  console.log(
    " ".repeat(space ?? 0),
    `${src}[${TOKENS[src].address}] => ${dst}[${TOKENS[dst].address}]:`,
    `[${routes.map((r) => `"0x${r.toString(16)}"`).join(",")}]`
  );
  if (decode) {
    routes.forEach((route, index) => {
      console.log(" ".repeat(space ?? 0), `  route #${index + 1}: ${decodePoolV3(route)}`);
    });
  }
}
