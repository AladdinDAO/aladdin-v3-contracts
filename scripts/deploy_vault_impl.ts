/* eslint-disable node/no-missing-import */
import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();

  const AladdinConvexVault = await ethers.getContractFactory("AladdinConvexVault", deployer);
  const impl = await AladdinConvexVault.deploy();
  await impl.deployed();
  console.log("Deploy AladdinConvexVault Impl at:", impl.address);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
