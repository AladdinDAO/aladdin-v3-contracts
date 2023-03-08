/* eslint-disable node/no-missing-import */
import { Command } from "commander";
import { BigNumber, constants } from "ethers";
import * as hre from "hardhat";
import "@nomiclabs/hardhat-ethers";
import { DEPLOYED_CONTRACTS, TOKENS } from "../utils";
import { RoundClaimParams } from "./config";

const ethers = hre.ethers;
const program = new Command();
program.version("1.0.0");

const KEEPER = "0x11E91BB6d1334585AA37D8F4fde3932C7960B938";

async function main(round: string) {
  const [deployer] = await ethers.getSigners();
  const delegation = await ethers.getContractAt(
    "VeSDTDelegation",
    DEPLOYED_CONTRACTS.Concentrator.StakeDAO.VeSDTDelegation,
    deployer
  );
  const vault = await ethers.getContractAt(
    "StakeDAOCRVVault",
    DEPLOYED_CONTRACTS.Concentrator.StakeDAO.sdCRV.StakeDAOCRVVault,
    deployer
  );
  console.log("Harvest Round:", round);
  console.log("data:", vault.interface.encodeFunctionData("harvestBribes", [RoundClaimParams[round]]));
  const gasEstimate = await ethers.provider.estimateGas({
    from: KEEPER,
    to: vault.address,
    data: vault.interface.encodeFunctionData("harvestBribes", [RoundClaimParams[round]]),
  });
  console.log("gas estimate:", gasEstimate.toString());

  if (KEEPER === deployer.address) {
    const tx = await vault.harvestBribes(RoundClaimParams[round]);
    console.log("waiting for tx:", tx.hash);
    const receipt = await tx.wait();
    console.log("confirmed, gas used:", receipt.gasUsed.toString());
    let delegateSDT = constants.Zero;
    let treasurySDT = constants.Zero;
    let totalSDT = constants.Zero;
    for (const log of receipt.logs) {
      if (
        log.topics[0] === "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef" &&
        log.address.toLowerCase() === TOKENS.SDT.address.toLowerCase()
      ) {
        const [from] = ethers.utils.defaultAbiCoder.decode(["address"], log.topics[1]) as [string];
        const [to] = ethers.utils.defaultAbiCoder.decode(["address"], log.topics[2]) as [string];
        const [value] = ethers.utils.defaultAbiCoder.decode(["uint256"], log.data) as [BigNumber];
        if (from === vault.address && to === DEPLOYED_CONTRACTS.Concentrator.Treasury) treasurySDT = value;
        if (from === vault.address && to === delegation.address) delegateSDT = value;
        if (to === vault.address) totalSDT = value;
      }
    }
    console.log(
      "actual reward SDT:",
      ethers.utils.formatEther(totalSDT.sub(treasurySDT).sub(delegateSDT)),
      "treasury SDT:",
      ethers.utils.formatEther(treasurySDT),
      "delegation SDT:",
      ethers.utils.formatEther(delegateSDT)
    );
  }
}

program.option("--round <round>", "round number");
program.parse(process.argv);
const options = program.opts();

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main(options.round).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
