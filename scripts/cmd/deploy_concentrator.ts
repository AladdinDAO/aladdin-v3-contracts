import { network } from "hardhat";
import { toBigInt } from "ethers";

import { ensureDeployer } from "@/contracts/helpers";
import * as ConcentratorCvxCrv from "@/contracts/ConcentratorCvxCRV";
import * as ConcentratorCVX from "@/contracts/ConcentratorCVX";
import * as ConcentratorFrxETH from "@/contracts/ConcentratorFrxETH";
import * as ConcentratorFxUSD from "@/contracts/ConcentratorFxUSD";
import * as ConcentratorStakeDAO from "@/contracts/ConcentratorStakeDAO";
import { showConverterRoute, showZapRoute } from "../utils";

const maxFeePerGas = 10e9;
const maxPriorityFeePerGas = 0.01e9;

async function main() {
  const overrides = {
    maxFeePerGas: toBigInt(maxFeePerGas),
    maxPriorityFeePerGas: toBigInt(maxPriorityFeePerGas),
  };
  const deployer = await ensureDeployer(network.name);

  const cmd = process.env.CMD;
  if (cmd === "cvxCRV") {
    showZapRoute("crvUSD", "CRV");
    const cvxCRV = await ConcentratorCvxCrv.deploy(deployer, overrides);
    await ConcentratorCvxCrv.initialize(deployer, cvxCRV, overrides);
  }

  if (cmd === "CVX") {
    showConverterRoute("aCVX", "aCRV");
    const cvx = await ConcentratorCVX.deploy(deployer, overrides);
    await ConcentratorCVX.initialize(deployer, cvx, overrides);
  }

  if (cmd === "frxETH") {
    showConverterRoute("CURVE_ETH/frxETH", "aCRV");
    const frxETH = await ConcentratorFrxETH.deploy(deployer, overrides);
    await ConcentratorFrxETH.initialize(deployer, frxETH, overrides);
  }

  if (cmd === "sdCRV") {
    showConverterRoute("sdCRV", "aCRV");
    const sdCRV = await ConcentratorStakeDAO.deploy(deployer, overrides);
    await ConcentratorStakeDAO.initialize(deployer, sdCRV, overrides);
  }

  if (cmd === "FxUSD") {
    showConverterRoute("wstETH", "aCRV");
    showConverterRoute("weETH", "aCRV");
    const fxUSD = await ConcentratorFxUSD.deploy(deployer, overrides);
    await ConcentratorFxUSD.initialize(deployer, fxUSD, overrides);
  }
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
