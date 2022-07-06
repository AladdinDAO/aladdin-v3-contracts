import { Assertion } from "chai";
import { config as dotEnvConfig } from "dotenv";
import { BigNumber, BigNumberish } from "ethers";
import * as hre from "hardhat";

dotEnvConfig();

// eslint-disable-next-line camelcase
export async function request_fork(blockNumber: number, accounts: string[]) {
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
  for (const address of accounts) {
    await hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [address],
    });
  }
}

Assertion.addMethod("closeToBn", function (expected: BigNumberish, delta: BigNumberish) {
  const obj = this._obj;
  this.assert(
    BigNumber.from(expected).sub(obj).abs().lte(delta),
    `expected ${obj} to be close to ${expected} +/- ${delta}`,
    `expected ${obj} not to be close to ${expected} +/- ${delta}`,
    expected,
    obj
  );
});

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  export namespace Chai {
    interface Assertion {
      closeToBn(expected: BigNumberish, delta: BigNumberish): Assertion;
    }
  }
}
