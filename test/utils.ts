import { config as dotEnvConfig } from "dotenv";
import { BigNumberish, toBigInt } from "ethers";
import { network } from "hardhat";

dotEnvConfig();

// eslint-disable-next-line camelcase
export async function request_fork(blockNumber: number, accounts: string[]) {
  await network.provider.request({
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
  for (const address of accounts) {
    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [address],
    });
  }
}

export async function mockETHBalance(account: string, amount: BigNumberish) {
  await network.provider.send("hardhat_setBalance", [account, "0x" + toBigInt(amount).toString(16)]);
}
