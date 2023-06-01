/* eslint-disable node/no-missing-import */
import { BigNumber, Contract } from "ethers";
import { ethers } from "hardhat";

const maxFeePerGas = 30e9;
const maxPriorityFeePerGas = 1.2e9;

async function main() {
  const overrides = {
    maxFeePerGas: BigNumber.from(maxFeePerGas),
    maxPriorityFeePerGas: BigNumber.from(maxPriorityFeePerGas),
  };

  const [deployer] = await ethers.getSigners();

  const contractName = process.env.CONTRACT_NAME!;
  const args = process.env.CONTRACT_ARGS || "";

  const contract = await ethers.getContractFactory(contractName, deployer);
  let impl: Contract;

  if (args.length > 0) {
    impl = await contract.deploy(args.split(","), overrides);
  } else {
    impl = await contract.deploy(overrides);
  }

  console.log(`Deploy ${contractName} with hash:`, impl.deployTransaction.hash);
  await impl.deployed();
  const receipt = await impl.deployTransaction.wait();
  console.log(`✅ Done, Deploy ${contractName} at:`, impl.address, "gas used:", receipt.gasUsed.toString());
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
