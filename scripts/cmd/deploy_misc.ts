import { toBigInt } from "ethers";
import { ethers, network } from "hardhat";

import { ensureDeployer } from "@/contracts/helpers";
import * as Misc from "@/contracts/Misc";

const maxFeePerGas = ethers.parseUnits("32", "gwei");
const maxPriorityFeePerGas = ethers.parseUnits("0.01", "gwei");

async function main() {
  const overrides = {
    maxFeePerGas: toBigInt(maxFeePerGas),
    maxPriorityFeePerGas: toBigInt(maxPriorityFeePerGas),
  };

  const deployer = await ensureDeployer(network.name);

  await Misc.deploy(deployer, overrides);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
