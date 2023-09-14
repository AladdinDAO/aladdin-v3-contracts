import { BigNumber } from "ethers";
import "@nomiclabs/hardhat-ethers";
import { ethers } from "hardhat";

import * as FxGovernance from "./contracts/FxGovernance";
import * as FxStETH from "./contracts/FxStETH";
import { showConverterRoute } from "./utils";

const maxFeePerGas = 30e9;
const maxPriorityFeePerGas = 1e9;

async function main() {
  const overrides = {
    maxFeePerGas: BigNumber.from(maxFeePerGas),
    maxPriorityFeePerGas: BigNumber.from(maxPriorityFeePerGas),
  };

  const [deployer] = await ethers.getSigners();
  if (deployer.address !== "0x07dA2d30E26802ED65a52859a50872cfA615bD0A") {
    console.log("invalid deployer");
    return;
  }

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
