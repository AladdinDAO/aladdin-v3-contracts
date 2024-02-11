import { toBigInt } from "ethers";
import { ethers, network } from "hardhat";

import { ensureDeployer } from "@/contracts/helpers";
import * as CLeverCVX from "@/contracts/CLeverCVX";

const maxFeePerGas = ethers.parseUnits("30", "gwei");
const maxPriorityFeePerGas = ethers.parseUnits("0.01", "gwei");

async function main() {
  const overrides = {
    maxFeePerGas: toBigInt(maxFeePerGas),
    maxPriorityFeePerGas: toBigInt(maxPriorityFeePerGas),
  };

  const deployer = await ensureDeployer(network.name);

  const clevcvx = await CLeverCVX.deploy(deployer, overrides);
  await CLeverCVX.initialize(deployer, clevcvx, overrides);

  if (network.name === "hermez") {
    await CLeverCVX.deployVoter(deployer);
  }
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
