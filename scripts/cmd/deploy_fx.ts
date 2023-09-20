import { network } from "hardhat";
import { toBigInt } from "ethers";

import { showConverterRoute } from "@/utils/routes";

import { ensureDeployer } from "@/contracts/helpers";
import * as FxGovernance from "@/contracts/FxGovernance";
import * as FxStETH from "@/contracts/FxStETH";

const maxFeePerGas = 30e9;
const maxPriorityFeePerGas = 1e9;

async function main() {
  const overrides = {
    maxFeePerGas: toBigInt(maxFeePerGas),
    maxPriorityFeePerGas: toBigInt(maxPriorityFeePerGas),
  };
  const deployer = await ensureDeployer(network.name);

  for (const [src, dst] of [
    ["stETH", "WETH"],
    ["stETH", "USDC"],
    ["stETH", "USDT"],
  ]) {
    showConverterRoute(src, dst);
  }

  const governance = await FxGovernance.deploy(deployer, overrides);
  await FxGovernance.initialize(deployer, governance, overrides);

  const fxsteth = await FxStETH.deploy(deployer, overrides);
  await FxStETH.initialize(deployer, fxsteth);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
