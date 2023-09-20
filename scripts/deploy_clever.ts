/* eslint-disable node/no-missing-import */
import { ethers, network } from "hardhat";
import { ExpectedDeployers } from "./utils";

import * as CLeverCVX from "./contracts/CLeverCVX";

async function main() {
  const [deployer] = await ethers.getSigners();
  if (deployer.address !== ExpectedDeployers[network.name]) {
    console.error("invalid deployer");
    return;
  }

  await CLeverCVX.deployVoter(deployer);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error.toString());
  process.exitCode = 1;
});
