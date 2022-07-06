/* eslint-disable no-unused-vars */
/* eslint-disable node/no-missing-import */
import { BigNumber } from "ethers";

export enum PoolType {
  UniswapV2, // with fee 0.3%, add/remove liquidity not supported
  UniswapV3, // add/remove liquidity not supported
  BalancerV2, // add/remove liquidity not supported
  CurveETHPool, // including Factory Pool
  CurveCryptoPool, // including Factory Pool
  CurveMetaCryptoPool,
  CurveTriCryptoPool,
  CurveBasePool,
  CurveAPool,
  CurveAPoolUnderlying,
  CurveYPool,
  CurveYPoolUnderlying,
  CurveMetaPool,
  CurveMetaPoolUnderlying,
  CurveFactoryPlainPool,
  CurveFactoryMetaPool,
  CurveFactoryUSDMetaPoolUnderlying,
  CurveFactoryBTCMetaPoolUnderlying,
  LidoStake, // eth to stETH
  LidoWrap, // stETH to wstETH or wstETH to stETH
}

export enum Action {
  Swap,
  AddLiquidity,
  RemoveLiquidity,
}

export function encodePoolHint(poolAddress: string, poolType: number, indexIn: number, indexOut: number) {
  let encoding = BigNumber.from(poolAddress);
  encoding = encoding.or(BigNumber.from(poolType).shl(160));
  encoding = encoding.or(BigNumber.from(indexIn).shl(164));
  encoding = encoding.or(BigNumber.from(indexOut).shl(166));
  return encoding;
}

export function encodePoolHintV2(
  poolAddress: string,
  poolType: PoolType,
  tokens: number,
  indexIn: number,
  indexOut: number,
  action: number
) {
  let encoding = BigNumber.from(poolAddress);
  encoding = encoding.or(BigNumber.from(poolType as number).shl(160));
  encoding = encoding.or(BigNumber.from(tokens - 1).shl(168));
  encoding = encoding.or(BigNumber.from(indexIn).shl(170));
  encoding = encoding.or(BigNumber.from(indexOut).shl(172));
  encoding = encoding.or(BigNumber.from(action).shl(174));
  return encoding;
}

export * from "./deploys";
export * from "./tokens";
export * from "./address";
export * from "./routes";
export * from "./vaults";
