import { BigNumber } from "ethers";
import "@nomiclabs/hardhat-ethers";
import { ethers } from "hardhat";

import * as Converter from "./contracts/Converter";

const maxFeePerGas = 20e9;
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

  await Converter.deploy(deployer, overrides);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
