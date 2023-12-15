/* eslint-disable camelcase */
/* eslint-disable no-unused-vars */
import { assert } from "console";
import { getAddress, toBigInt } from "ethers";
import { ethers } from "hardhat";
import { TOKENS } from "./tokens";

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
  Lido,
}

export enum Action {
  Swap,
  Add,
  Remove,
}

export function encodePoolHint(poolAddress: string, poolType: number, indexIn: number, indexOut: number) {
  let encoding = toBigInt(poolAddress);
  encoding |= toBigInt(poolType) << 160n;
  encoding |= toBigInt(indexIn) << 164n;
  encoding |= toBigInt(indexOut) << 166n;
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
  let encoding = toBigInt(poolAddress);
  encoding |= toBigInt(poolType as number) << 160n;
  encoding |= toBigInt(tokens - 1) << 168n;
  encoding |= toBigInt(indexIn) << 170n;
  encoding |= toBigInt(indexOut) << 172n;
  encoding |= toBigInt(action) << 174n;
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
  let encoding = toBigInt(poolAddress);
  switch (poolType) {
    case PoolTypeV3.UniswapV2:
      assert(options && options.fee_num, "no fee_num");
      encoding |= toBigInt(options!.fee_num!) << 160n;
      encoding |= toBigInt(indexIn < indexOut ? 1 : 0) << 184n;
      if (options && options.twamm === true) {
        encoding |= toBigInt(options.twamm === true ? 1 : 0) << 185n;
      }
      break;
    case PoolTypeV3.UniswapV3:
      assert(options && options.fee_num, "no fee_num");
      encoding |= toBigInt(options!.fee_num!) << 160n;
      encoding |= toBigInt(indexIn < indexOut ? 1 : 0) << 184n;
      break;
    case PoolTypeV3.BalancerV1:
    case PoolTypeV3.BalancerV2:
    case PoolTypeV3.CurveMetaPool:
      encoding |= toBigInt(tokens - 1) << 160n;
      encoding |= toBigInt(indexIn) << 163n;
      encoding |= toBigInt(indexOut) << 166n;
      break;
    case PoolTypeV3.CurvePlainPool:
    case PoolTypeV3.CurveCryptoPool:
      encoding |= toBigInt(tokens - 1) << 160n;
      encoding |= toBigInt(indexIn) << 163n;
      encoding |= toBigInt(indexOut) << 166n;
      if (options && options.use_eth === true) {
        encoding |= toBigInt(options.use_eth === true ? 1 : 0) << 169n;
      }
      break;
    case PoolTypeV3.CurveAPool:
    case PoolTypeV3.CurveYPool:
      encoding |= toBigInt(tokens - 1) << 160n;
      encoding |= toBigInt(indexIn) << 163n;
      encoding |= toBigInt(indexOut) << 166n;
      if (options && options.use_underlying === true) {
        encoding |= toBigInt(options.use_underlying === true ? 1 : 0) << 169n;
      }
      break;
    case PoolTypeV3.ERC4626:
      break;
    case PoolTypeV3.Lido:
      break;
  }

  encoding = (encoding << 2n) | toBigInt(action);
  encoding = (encoding << 8n) | toBigInt(poolType);
  return encoding;
}

export function decodePoolV3(encoding: bigint): string {
  const poolType = Number(encoding & 255n);
  const action = Number((encoding >> 8n) & 3n);
  const pool = getAddress(((encoding >> 10n) & (2n ** 160n - 1n)).toString(16).padStart(40, "0"));
  encoding >>= 170n;
  let extra: string = "";
  let actionDesc = Action[Number(action)];
  let poolName = pool;
  switch (poolType) {
    case PoolTypeV3.UniswapV2:
    case PoolTypeV3.UniswapV3: {
      const fee = encoding & (2n ** 24n - 1n);
      const zeroForOne = (encoding >> 24n) & 1n;
      poolName = `${pool}/${ethers.formatUnits(10n ** 6n - fee, 6)}`;
      extra = `tokenIn[${zeroForOne ^ 1n}] tokenOut[${zeroForOne}]`;
      break;
    }
    case PoolTypeV3.BalancerV1:
    case PoolTypeV3.BalancerV2:
    case PoolTypeV3.CurveMetaPool:
    case PoolTypeV3.CurvePlainPool:
    case PoolTypeV3.CurveCryptoPool:
    case PoolTypeV3.CurveAPool:
    case PoolTypeV3.CurveYPool: {
      const tokenIn = (encoding >> 3n) & 7n;
      const tokenOut = (encoding >> 6n) & 7n;
      if (action === Action.Add) {
        extra = `tokenIn[${tokenIn}]`;
      } else if (action === Action.Remove) {
        extra = `tokenOut[${tokenOut}]`;
      } else {
        extra = `tokenIn[${tokenIn}] tokenOut[${tokenOut}]`;
      }
      break;
    }
    case PoolTypeV3.ERC4626: {
      if (action === Action.Add) actionDesc = "Deposit";
      else if (action === Action.Remove) actionDesc = "Withdraw";
      const token = Object.entries(TOKENS).find(([symbol, metadata]) => getAddress(metadata.address) === pool);
      if (token) {
        poolName = `${token[0]}/${pool}`;
      }
      break;
    }
    case PoolTypeV3.Lido: {
      if (action === Action.Add) actionDesc = "Wrap";
      else if (action === Action.Remove) actionDesc = "Unwrap";
      const token = Object.entries(TOKENS).find(([symbol, metadata]) => getAddress(metadata.address) === pool);
      if (token) {
        poolName = `${token[0]}/${pool}`;
      }
      break;
    }
  }
  return `${PoolTypeV3[Number(poolType)]}[${poolName}].${actionDesc} ${extra}`;
}
