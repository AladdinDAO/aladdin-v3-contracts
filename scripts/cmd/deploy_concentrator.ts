import { network } from "hardhat";
import { toBigInt } from "ethers";

import { ensureDeployer } from "@/contracts/helpers";
import * as ConcentratorCvxCrv from "@/contracts/ConcentratorCvxCRV";
import * as ConcentratorCVX from "@/contracts/ConcentratorCVX";
import * as ConcentratorFrxETH from "@/contracts/ConcentratorFrxETH";
import * as ConcentratorStakeDAO from "@/contracts/ConcentratorStakeDAO";
import { showConverterRoute } from "../utils";

const maxFeePerGas = 50e9;
const maxPriorityFeePerGas = 0.1e9;

async function main() {
  const overrides = {
    maxFeePerGas: toBigInt(maxFeePerGas),
    maxPriorityFeePerGas: toBigInt(maxPriorityFeePerGas),
  };
  const deployer = await ensureDeployer(network.name);

  const cmd = process.env.CMD;
  if (cmd === "cvxcrv") {
    const cvx = await ConcentratorCvxCrv.deploy(deployer, overrides);
    await ConcentratorCvxCrv.initialize(deployer, cvx, overrides);
  }

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

  if (cmd === "sdcrv") {
    showConverterRoute("sdCRV", "aCRV");
    const sdcrv = await ConcentratorStakeDAO.deploy(deployer, overrides);
    await ConcentratorStakeDAO.initialize(deployer, sdcrv, overrides);
  }
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
