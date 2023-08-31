/* eslint-disable camelcase */
/* eslint-disable no-unused-vars */
/* eslint-disable node/no-missing-import */
import { assert } from "console";
import { BigNumber } from "ethers";

export const ExpectedDeployers: { [network: string]: string } = {
  hermez: "0xa1d0a635f7b447b06836d9aC773b03f1F706bBC4",
  mainnet: "0x07dA2d30E26802ED65a52859a50872cfA615bD0A",
};

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
  CurveFactoryFraxBPMetaPoolUnderlying,
  AladdinCompounder, // wrap/unrwap as aCRV/aFXS/...
}

export enum PoolTypeV3 {
  UniswapV2,
  UniswapV3,
  BalancerV1,
  BalancerV2,
  CurvePlainPool,
  CurveAPool,
  CurveYPool,
  CurveMetaPool,
  CurveCryptoPool,
  ERC4626,
}

export enum Action {
  Swap,
  Add,
  Remove,
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

export function encodePoolHintV3(
  poolAddress: string,
  poolType: PoolTypeV3,
  tokens: number,
  indexIn: number,
  indexOut: number,
  action: Action,
  options?: {
    fee_num?: number;
    twamm?: boolean;
    use_eth?: boolean;
    use_underlying?: boolean;
  }
) {
  let encoding = BigNumber.from(poolAddress);
  switch (poolType) {
    case PoolTypeV3.UniswapV2:
      assert(options && options.fee_num, "no fee_num");
      encoding = encoding.or(BigNumber.from(options!.fee_num!).shl(160));
      encoding = encoding.or(BigNumber.from(indexIn < indexOut ? 1 : 0).shl(184));
      if (options && options.twamm === true) {
        encoding = encoding.or(BigNumber.from(options.twamm === true ? 1 : 0).shl(185));
      }
      break;
    case PoolTypeV3.UniswapV3:
      assert(options && options.fee_num, "no fee_num");
      encoding = encoding.or(BigNumber.from(options!.fee_num!).shl(160));
      encoding = encoding.or(BigNumber.from(indexIn < indexOut ? 1 : 0).shl(184));
      break;
    case PoolTypeV3.BalancerV1:
    case PoolTypeV3.BalancerV2:
    case PoolTypeV3.CurveMetaPool:
      encoding = encoding.or(BigNumber.from(tokens - 1).shl(160));
      encoding = encoding.or(BigNumber.from(indexIn).shl(163));
      encoding = encoding.or(BigNumber.from(indexOut).shl(166));
      break;
    case PoolTypeV3.CurvePlainPool:
    case PoolTypeV3.CurveCryptoPool:
      encoding = encoding.or(BigNumber.from(tokens - 1).shl(160));
      encoding = encoding.or(BigNumber.from(indexIn).shl(163));
      encoding = encoding.or(BigNumber.from(indexOut).shl(166));
      if (options && options.use_eth === true) {
        encoding = encoding.or(BigNumber.from(options.use_eth === true ? 1 : 0).shl(169));
      }
      break;
    case PoolTypeV3.CurveAPool:
    case PoolTypeV3.CurveYPool:
      encoding = encoding.or(BigNumber.from(tokens - 1).shl(160));
      encoding = encoding.or(BigNumber.from(indexIn).shl(163));
      encoding = encoding.or(BigNumber.from(indexOut).shl(166));
      if (options && options.use_underlying === true) {
        encoding = encoding.or(BigNumber.from(options.use_underlying === true ? 1 : 0).shl(169));
      }
      break;
    case PoolTypeV3.ERC4626:
      break;
  }

  encoding = encoding.shl(2).or(action as number);
  encoding = encoding.shl(8).or(poolType as number);
  return encoding;
}

export * from "./deploys";
export * from "./tokens";
export * from "./address";
export * from "./routes";
export * from "./vaults";
