import { config as dotEnvConfig } from "dotenv";
import { BigNumber } from "ethers";
import * as hre from "hardhat";

dotEnvConfig();

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
