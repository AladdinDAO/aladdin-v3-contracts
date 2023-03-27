/* eslint-disable node/no-missing-import */
import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();

  const ConcentratorIFOVault = await ethers.getContractFactory("ConcentratorIFOVault", deployer);
  const impl = await ConcentratorIFOVault.deploy();
  await impl.deployed();
  console.log("Deploy ConcentratorIFOVault Impl at:", impl.address);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
