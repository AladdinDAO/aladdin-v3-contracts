/* eslint-disable node/no-missing-import */
import { Command } from "commander";
import { BigNumber } from "ethers";
import * as hre from "hardhat";
import "@nomiclabs/hardhat-ethers";
import { ADDRESS, DEPLOYED_CONTRACTS, TOKENS } from "../utils";
import { RoundClaimParams } from "./config";

const ethers = hre.ethers;
const program = new Command();
program.version("1.0.0");

const KEEPER = "0x11E91BB6d1334585AA37D8F4fde3932C7960B938";

async function main(round: number, manualStr: string) {
  const [deployer] = await ethers.getSigners();
  const cvx = await ethers.getContractAt("IERC20", ADDRESS.CVX, deployer);
  const furnance = await ethers.getContractAt("Furnace", DEPLOYED_CONTRACTS.CLever.CLeverCVX.FurnaceForCVX, deployer);
  const cvxLocker = await ethers.getContractAt(
    "CLeverCVXLocker",
    DEPLOYED_CONTRACTS.CLever.CLeverCVX.CLeverForCVX,
    deployer
  );

  const manualTokens = manualStr === "" ? [] : manualStr.split(",");
  console.log("Harvest Round:", round);
  for (const item of RoundClaimParams[round]) {
    const symbol: string = Object.entries(TOKENS).filter(
      ([, { address }]) => address.toLowerCase() === item.token.toLowerCase()
    )[0][0];
    const estimate = BigNumber.from(
      await ethers.provider.call({
        from: KEEPER,
        to: cvxLocker.address,
        data: cvxLocker.interface.encodeFunctionData("harvestVotium", [[item], 0]),
      })
    );
    console.log(
      `  token[${symbol}], address[${item.token}], amount[${ethers.utils.formatUnits(
        item.amount,
        TOKENS[symbol].decimals
      )}] CVX[${ethers.utils.formatEther(estimate.toString())}]`
    );
  }

  const estimate = BigNumber.from(
    await ethers.provider.call({
      from: KEEPER,
      to: cvxLocker.address,
      data: cvxLocker.interface.encodeFunctionData("harvestVotium", [RoundClaimParams[round], 0]),
    })
  );
  console.log("estimate harvested CVX:", ethers.utils.formatEther(estimate.toString()));
  const gasEstimate = await ethers.provider.estimateGas({
    from: KEEPER,
    to: cvxLocker.address,
    data: cvxLocker.interface.encodeFunctionData("harvestVotium", [RoundClaimParams[round], 0]),
  });
  console.log("gas estimate:", gasEstimate.toString());

  if (KEEPER === deployer.address) {
    const furnaceBefore = await furnance.totalCVXInPool();
    const treasuryBefore = await cvx.balanceOf(DEPLOYED_CONTRACTS.CLever.Treasury);
    const tx = await cvxLocker.harvestVotium(RoundClaimParams[round], estimate.mul(99).div(100), {
      gasLimit: gasEstimate.mul(12).div(10),
    });
    console.log("waiting for tx:", tx.hash);
    const receipt = await tx.wait();
    console.log("confirmed, gas used:", receipt.gasUsed.toString());
    const furnaceAfter = await furnance.totalCVXInPool();
    const treasuryAfter = await cvx.balanceOf(DEPLOYED_CONTRACTS.CLever.Treasury);
    console.log(
      "actual furnace CVX:",
      ethers.utils.formatEther(furnaceAfter.sub(furnaceBefore)),
      "treasury CVX:",
      ethers.utils.formatEther(treasuryAfter.sub(treasuryBefore))
    );
    for (const symbol of manualTokens) {
      const { address, decimals } = TOKENS[symbol];
      const token = await ethers.getContractAt("IERC20", address, deployer);
      const balance = await token.balanceOf(cvxLocker.address);
      console.log(`harvested ${symbol}:`, ethers.utils.formatUnits(balance, decimals));
    }
  }
}

program.option("--round <round>", "round number");
program.option("--manual <manual swap token>", "the list of symbols for manual swap tokens");
program.parse(process.argv);
const options = program.opts();

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main(parseInt(options.round), options.manual || "").catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
