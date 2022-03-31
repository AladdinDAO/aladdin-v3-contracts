/* eslint-disable node/no-missing-import */
import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();

  const AladdinZap = await ethers.getContractFactory("AladdinZap", deployer);
  const impl = await AladdinZap.deploy();
  await impl.deployed();
  console.log("Deploy AladdinZap Impl at:", impl.address);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
