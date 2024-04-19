import { network } from "hardhat";
import { ethers, toBigInt } from "ethers";

import { ensureDeployer } from "@/contracts/helpers";
import * as ERC2535 from "@/contracts/ERC2535";
import * as Gateway from "@/contracts/Gateway";

const maxFeePerGas = ethers.parseUnits("36", "gwei");
const maxPriorityFeePerGas = ethers.parseUnits("0.01", "gwei");

async function main() {
  const overrides = {
    maxFeePerGas: toBigInt(maxFeePerGas),
    maxPriorityFeePerGas: toBigInt(maxPriorityFeePerGas),
  };
  const deployer = await ensureDeployer(network.name);

  await ERC2535.deploy(deployer, overrides);

  const gateway = await Gateway.deploy(deployer, overrides);
  await Gateway.initialize(deployer, gateway, overrides);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
