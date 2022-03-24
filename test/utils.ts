import { Assertion } from "chai";
import { config as dotEnvConfig } from "dotenv";
import { BigNumber, BigNumberish } from "ethers";
import * as hre from "hardhat";

dotEnvConfig();

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
}

export enum Action {
  Swap,
  AddLiquidity,
  RemoveLiquidity,
}

// eslint-disable-next-line camelcase
export async function request_fork(blockNumber: number, contracts: string[]) {
  await hre.network.provider.request({
    method: "hardhat_reset",
    params: [
      {
        forking: {
          jsonRpcUrl: process.env.HARDHAT_FORK_URL,
          blockNumber: blockNumber,
        },
      },
    ],
  });
  for (const address of contracts) {
    await hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [address],
    });
  }
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
