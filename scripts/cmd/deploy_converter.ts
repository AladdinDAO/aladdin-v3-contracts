import { toBigInt } from "ethers";
import { network } from "hardhat";

import { ensureDeployer } from "@/contracts/helpers";
import * as Converter from "@/contracts/Converter";

const maxFeePerGas = 20e9;
const maxPriorityFeePerGas = 1e9;

async function main() {
  const overrides = {
    maxFeePerGas: toBigInt(maxFeePerGas),
    maxPriorityFeePerGas: toBigInt(maxPriorityFeePerGas),
  };

  const deployer = await ensureDeployer(network.name);

  await Converter.deploy(deployer, overrides);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
