/* eslint-disable node/no-missing-import */
import { BigNumber } from "ethers";
import { Action, ADDRESS, encodePoolHintV2, PoolType } from ".";

export const ZAP_ROUTES: { [from: string]: { [to: string]: BigNumber[] } } = {
  ALCX: {
    // ALCX ==(UniV2)==> WETH ==(CurveV2)==> CVX
    CVX: [
      encodePoolHintV2(ADDRESS.WETH_ALCX_UNIV2, PoolType.UniswapV2, 2, 1, 0, Action.Swap),
      encodePoolHintV2(ADDRESS.CURVE_CVXETH_POOL, PoolType.CurveCryptoPool, 2, 0, 1, Action.Swap),
    ],
    // ALCX ==(UniV2)==> WETH
    WETH: [encodePoolHintV2(ADDRESS.WETH_ALCX_UNIV2, PoolType.UniswapV2, 2, 1, 0, Action.Swap)],
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
  CRV: {
    // CRV ==(CurveV2)==> WETH ==(UniV2)==> FXS
    FXS: [
      encodePoolHintV2(ADDRESS.CURVE_CRVETH_POOL, PoolType.CurveCryptoPool, 2, 1, 0, Action.Swap),
      encodePoolHintV2(ADDRESS.FXS_WETH_UNIV2, PoolType.UniswapV2, 2, 1, 0, Action.Swap),
    ],
    // CRV ==(CurveV2)==> WETH ==(UniV2)==> FXS
    WETH: [encodePoolHintV2(ADDRESS.CURVE_CRVETH_POOL, PoolType.CurveCryptoPool, 2, 1, 0, Action.Swap)],
    // CRV ==(Curve)==> cvxCRV ==(Aladdin)==> aCRV ==(Curve)==> CURVE_ACRVCTR_TOKEN
    CURVE_ACRVCTR_TOKEN: [
      encodePoolHintV2(ADDRESS.CURVE_CVXCRV_POOL, PoolType.CurveFactoryPlainPool, 2, 0, 1, Action.Swap),
      encodePoolHintV2(ADDRESS.aCRV, PoolType.AladdinCompounder, 1, 0, 0, Action.AddLiquidity),
      encodePoolHintV2(ADDRESS.CURVE_ACRVCTR_POOL, PoolType.CurveCryptoPool, 2, 0, 0, Action.AddLiquidity),
    ],
  },
  CVX: {
    // CVX ==(CurveV2)==> WETH ==(UniV2)==> FXS
    FXS: [
      encodePoolHintV2(ADDRESS.CURVE_CVXETH_POOL, PoolType.CurveCryptoPool, 2, 1, 0, Action.Swap),
      encodePoolHintV2(ADDRESS.FXS_WETH_UNIV2, PoolType.UniswapV2, 2, 1, 0, Action.Swap),
    ],
    // CVX ==(CurveV2)==> WETH
    WETH: [encodePoolHintV2(ADDRESS.CURVE_CVXETH_POOL, PoolType.CurveCryptoPool, 2, 1, 0, Action.Swap)],
  },
  cvxCRV: {
    // cvxCRV ==(Curve)==> CRV ==(CurveV2)==> WETH
    WETH: [
      encodePoolHintV2(ADDRESS.CURVE_CVXCRV_POOL, PoolType.CurveFactoryPlainPool, 2, 1, 0, Action.Swap),
      encodePoolHintV2(ADDRESS.CURVE_CRVETH_POOL, PoolType.CurveCryptoPool, 2, 1, 0, Action.Swap),
    ],
    // cvxCRV ==(Curve)==> CRV ==(CurveV2)==> WETH ==(CurveV2)==> CVX
    CVX: [
      encodePoolHintV2(ADDRESS.CURVE_CVXCRV_POOL, PoolType.CurveFactoryPlainPool, 2, 1, 0, Action.Swap),
      encodePoolHintV2(ADDRESS.CURVE_CRVETH_POOL, PoolType.CurveCryptoPool, 2, 1, 0, Action.Swap),
      encodePoolHintV2(ADDRESS.CURVE_CVXETH_POOL, PoolType.CurveCryptoPool, 2, 0, 1, Action.Swap),
    ],
    // cvxCRV ==(Aladdin)==> aCRV ==(Curve)==> CURVE_ACRVCTR_TOKEN
    CURVE_ACRVCTR_TOKEN: [
      encodePoolHintV2(ADDRESS.aCRV, PoolType.AladdinCompounder, 1, 0, 0, Action.AddLiquidity),
      encodePoolHintV2(ADDRESS.CURVE_ACRVCTR_POOL, PoolType.CurveCryptoPool, 2, 0, 0, Action.AddLiquidity),
    ],
  },
  EURS: {
    // EURS ==(UniV3)==> USDC ==(UniV3)==> WETH ==(CurveV2)==> CVX
    CVX: [
      encodePoolHintV2(ADDRESS.USDC_EURS_POOL_500, PoolType.UniswapV3, 2, 1, 0, Action.Swap),
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
  FXS: {
    // FXS ==(UniV2)==> WETH
    WETH: [encodePoolHintV2(ADDRESS.FXS_WETH_UNIV2, PoolType.UniswapV2, 2, 0, 1, Action.Swap)],
    // FXS ==(UniV2)==> WETH ==(CurveV2)==> CVX
    CVX: [
      encodePoolHintV2(ADDRESS.FXS_WETH_UNIV2, PoolType.UniswapV2, 2, 0, 1, Action.Swap),
      encodePoolHintV2(ADDRESS.CURVE_CVXETH_POOL, PoolType.CurveCryptoPool, 2, 0, 1, Action.Swap),
    ],
  },
  GRO: {
    // GRO ==(UniV2) ==> USDC ==(UniV3)==> WETH ==(CurveV2)==> CVX
    CVX: [
      encodePoolHintV2(ADDRESS.CURVE_STGUSDC_POOL, PoolType.CurveCryptoPool, 2, 0, 1, Action.Swap),
      encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 0, 1, Action.Swap),
      encodePoolHintV2(ADDRESS.CURVE_CVXETH_POOL, PoolType.CurveCryptoPool, 2, 0, 1, Action.Swap),
    ],
  },
  INV: {
    // INV ==(Sushi)==> WETH ==(CurveV2)==> CVX
    CVX: [
      encodePoolHintV2(ADDRESS.INV_WETH_UNIV2, PoolType.UniswapV2, 2, 0, 1, Action.Swap),
      encodePoolHintV2(ADDRESS.CURVE_CVXETH_POOL, PoolType.CurveCryptoPool, 2, 0, 1, Action.Swap),
    ],
  },
  JPEG: {
    // JPEG ==(UniV2)==> WETH ==(CurveV2)==> CVX
    CVX: [
      encodePoolHintV2(ADDRESS.JPEG_WETH_UNIV2, PoolType.UniswapV2, 2, 1, 0, Action.Swap),
      encodePoolHintV2(ADDRESS.CURVE_CVXETH_POOL, PoolType.CurveCryptoPool, 2, 0, 1, Action.Swap),
    ],
  },
  LDO: {
    // LDO ==(UniV2)==> WETH
    WETH: [encodePoolHintV2(ADDRESS.LDO_WETH_UNIV2, PoolType.UniswapV2, 2, 0, 1, Action.Swap)],
    // LDO ==(UniV2)==> WETH ==(CurveV2)==> CVX
    CVX: [
      encodePoolHintV2(ADDRESS.LDO_WETH_UNIV2, PoolType.UniswapV2, 2, 0, 1, Action.Swap),
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
      encodePoolHintV2(ADDRESS.SNX_WETH_BALANCER, PoolType.BalancerV2, 2, 0, 1, Action.Swap),
      encodePoolHintV2(ADDRESS.CURVE_CVXETH_POOL, PoolType.CurveCryptoPool, 2, 0, 1, Action.Swap),
    ],
    // SNX ==(Balancer)==> WETH
    WETH: [encodePoolHintV2(ADDRESS.SNX_WETH_BALANCER, PoolType.BalancerV2, 2, 0, 1, Action.Swap)],
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
      encodePoolHintV2(ADDRESS.CURVE_STGUSDC_POOL, PoolType.CurveCryptoPool, 2, 0, 1, Action.Swap),
      encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 0, 1, Action.Swap),
      encodePoolHintV2(ADDRESS.CURVE_CVXETH_POOL, PoolType.CurveCryptoPool, 2, 0, 1, Action.Swap),
    ],
  },
  TRIBE: {
    // TRIBE ==(UniV2)==> FEI ==(Balancer)==> WETH ==(CurveV2)==> CVX
    CVX: [
      encodePoolHintV2(ADDRESS.FEI_TRIBE_UNIV2, PoolType.UniswapV2, 2, 1, 0, Action.Swap),
      encodePoolHintV2(ADDRESS.FEI_WETH_BALANCER, PoolType.BalancerV2, 2, 0, 1, Action.Swap),
      encodePoolHintV2(ADDRESS.CURVE_CVXETH_POOL, PoolType.CurveCryptoPool, 2, 0, 1, Action.Swap),
    ],
  },
  USDC: {
    // USDC ==(UniV3)==> WETH ==(CurveV2)==> CRV
    CRV: [
      encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 0, 1, Action.Swap),
      encodePoolHintV2(ADDRESS.CURVE_CRVETH_POOL, PoolType.CurveCryptoPool, 2, 0, 1, Action.Swap),
    ],
    // USDC ==(UniV3)==> WETH ==(CurveV2)==> CRV ==(Curve)==> cvxCRV ==(Aladdin)==> aCRV ==(Curve)==> CURVE_ACRVCTR_TOKEN
    CURVE_ACRVCTR_TOKEN: [
      encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 0, 1, Action.Swap),
      encodePoolHintV2(ADDRESS.CURVE_CRVETH_POOL, PoolType.CurveCryptoPool, 2, 0, 1, Action.Swap),
      encodePoolHintV2(ADDRESS.CURVE_CVXCRV_POOL, PoolType.CurveFactoryPlainPool, 2, 0, 1, Action.Swap),
      encodePoolHintV2(ADDRESS.aCRV, PoolType.AladdinCompounder, 1, 0, 0, Action.AddLiquidity),
      encodePoolHintV2(ADDRESS.CURVE_ACRVCTR_POOL, PoolType.CurveCryptoPool, 2, 0, 0, Action.AddLiquidity),
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
    CRV: [encodePoolHintV2(ADDRESS.CURVE_CRVETH_POOL, PoolType.CurveCryptoPool, 2, 0, 1, Action.Swap)],
    // WETH ==(CurveV2)==> CVX
    CVX: [encodePoolHintV2(ADDRESS.CURVE_CVXETH_POOL, PoolType.CurveCryptoPool, 2, 0, 1, Action.Swap)],
    // WETH ==(CurveV2)==> CRV ==(Curve)==> cvxCRV ==(Aladdin)==> aCRV ==(Curve)==> CURVE_ACRVCTR_TOKEN
    CURVE_ACRVCTR_TOKEN: [
      encodePoolHintV2(ADDRESS.CURVE_CRVETH_POOL, PoolType.CurveCryptoPool, 2, 0, 1, Action.Swap),
      encodePoolHintV2(ADDRESS.CURVE_CVXCRV_POOL, PoolType.CurveFactoryPlainPool, 2, 0, 1, Action.Swap),
      encodePoolHintV2(ADDRESS.aCRV, PoolType.AladdinCompounder, 1, 0, 0, Action.AddLiquidity),
      encodePoolHintV2(ADDRESS.CURVE_ACRVCTR_POOL, PoolType.CurveCryptoPool, 2, 0, 0, Action.AddLiquidity),
    ],
  },
};
