/* eslint-disable node/no-missing-import */
import { BigNumber } from "ethers";
import { ethers } from "hardhat";
import { ADDRESS } from "../config";
import { Round18Rewards } from "./config";

const GEIST = ADDRESS.GEIST;

async function main() {
  const [deployer] = await ethers.getSigners();
  const cvxLocker = await ethers.getContractAt(
    "CLeverCVXLocker",
    "0x96C68D861aDa016Ed98c30C810879F9df7c64154",
    deployer
  );

  const estimate = BigNumber.from(
    await ethers.provider.call({
      from: "0x11E91BB6d1334585AA37D8F4fde3932C7960B938",
      to: cvxLocker.address,
      data: cvxLocker.interface.encodeFunctionData("harvestVotium", [Round18Rewards, 0]),
    })
  );
  console.log("CVX:", ethers.utils.formatEther(estimate.toString()));
  const gasEstimate = await ethers.provider.estimateGas({
    from: "0x11E91BB6d1334585AA37D8F4fde3932C7960B938",
    to: cvxLocker.address,
    data: cvxLocker.interface.encodeFunctionData("harvestVotium", [Round18Rewards, 0]),
  });
  console.log("gas estimate:", gasEstimate.toString());
  const tx = await cvxLocker.harvestVotium(Round18Rewards, estimate.mul(9).div(10), {
    gasLimit: gasEstimate.mul(12).div(10),
  });
  console.log("waiting for tx:", tx.hash);
  const receipt = await tx.wait();
  console.log("confirmed, gas used:", receipt.gasUsed.toString());
  const geist = await ethers.getContractAt("IERC20", GEIST);
  const balance = await geist.balanceOf(cvxLocker.address);
  console.log("GEIST rewards:", ethers.utils.formatEther(balance));
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
