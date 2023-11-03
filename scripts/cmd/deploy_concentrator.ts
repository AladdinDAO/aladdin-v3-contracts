import { network } from "hardhat";
import { toBigInt } from "ethers";

import { ensureDeployer } from "@/contracts/helpers";
import * as ConcentratorCVX from "@/contracts/ConcentratorCVX";
import * as ConcentratorFrxETH from "@/contracts/ConcentratorFrxETH";
import { showConverterRoute } from "../utils";

const maxFeePerGas = 30e9;
const maxPriorityFeePerGas = 0.1e9;

async function main() {
  const overrides = {
    maxFeePerGas: toBigInt(maxFeePerGas),
    maxPriorityFeePerGas: toBigInt(maxPriorityFeePerGas),
  };
  const deployer = await ensureDeployer(network.name);

  const cmd = process.env.CMD;
  if (cmd === "cvx") {
    showConverterRoute("aCVX", "aCRV");
    const cvx = await ConcentratorCVX.deploy(deployer, overrides);
    await ConcentratorCVX.initialize(deployer, cvx, overrides);
  }

  if (cmd === "frxeth") {
    showConverterRoute("CURVE_ETH/frxETH", "aCRV");
    const frxeth = await ConcentratorFrxETH.deploy(deployer, overrides);
    await ConcentratorFrxETH.initialize(deployer, frxeth, overrides);
  }
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
