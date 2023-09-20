import axios from "axios";
import { Command } from "commander";
import * as hre from "hardhat";
import { toBigInt } from "ethers";
import "@nomicfoundation/hardhat-ethers";

import { loadParams } from "./config";

import { CLeverCVXDeployment } from "@/contracts/CLeverCVX";

import { same } from "@/utils/address";
import { DEPLOYED_CONTRACTS, selectDeployments } from "@/utils/deploys";
import { ZAP_ROUTES } from "@/utils/routes";
import { TOKENS } from "@/utils/tokens";

const ethers = hre.ethers;
const program = new Command();
program.version("1.0.0");

const KEEPER = "0x11E91BB6d1334585AA37D8F4fde3932C7960B938";

interface ICoinGeckoResponse {
  [symbol: string]: {
    [currency: string]: number;
  };
}

const symbol2ids: { [symbol: string]: string } = {
  ALCX: "alchemix",
  CLEV: "clever",
  CNC: "conic",
  CRV: "curve-dao-token",
  CVX: "convex-finance",
  FXS: "frax-share",
  GNO: "gnosis",
  INV: "inverse-finance",
  MET: "metronome",
  OGV: "origin-dollar-governance",
  SPELL: "spell-token",
  STG: "stargate-finance",
  TUSD: "true-usd",
  USDC: "usd-coin",
  eCFX: "conflux",
  wBETH: "wrapped-beacon-eth",
};

async function main(round: number, manualStr: string) {
  const deployment = selectDeployments("mainnet", "CLever.CVX").toObject() as CLeverCVXDeployment;

  // fetch price
  const response = await axios.get<ICoinGeckoResponse>(
    `https://api.coingecko.com/api/v3/simple/price?ids=${Object.values(symbol2ids).join("%2C")}&vs_currencies=usd`
  );
  const prices: { [symbol: string]: number } = {};
  for (const [symbol, id] of Object.entries(symbol2ids)) {
    if (response.data[id]) {
      prices[symbol] = response.data[id].usd;
    }
  }

  const [deployer] = await ethers.getSigners();
  const locker = await ethers.getContractAt("CLeverCVXLocker", deployment.CVXLocker, deployer);

  const manualTokens = manualStr === "" ? [] : manualStr.split(",");
  console.log("Harvest Round:", round);
  const routes: bigint[][] = [];
  const claimParams = loadParams(round);
  for (const item of claimParams) {
    const symbol: string = Object.entries(TOKENS).filter(
      ([, { address }]) => address.toLowerCase() === item.token.toLowerCase()
    )[0][0];
    const routeToETH = symbol === "WETH" ? [] : ZAP_ROUTES[symbol].WETH;
    const routeToCVX = ZAP_ROUTES.WETH.CVX;
    const estimate = toBigInt(
      await ethers.provider.call({
        from: KEEPER,
        to: deployment.CVXLocker,
        data: locker.interface.encodeFunctionData("harvestVotium", [[item], [routeToETH, routeToCVX], 0]),
      })
    );
    const tokenAmountStr = ethers.formatUnits(item.amount, TOKENS[symbol].decimals);
    const cvxAmountStr = ethers.formatEther(estimate.toString());
    if (prices[symbol]) {
      console.log(
        `  token[${symbol}]`,
        `address[${item.token}]`,
        `amount[${tokenAmountStr}]/USD[${(parseFloat(tokenAmountStr) * prices[symbol]).toFixed(2)}]`,
        `CVX[${cvxAmountStr}]/USD[${(parseFloat(cvxAmountStr) * prices.CVX).toFixed(2)}]`
      );
    } else {
      console.log(`  token[${symbol}]`, `address[${item.token}]`, `amount[${tokenAmountStr}]`, `CVX[${cvxAmountStr}]`);
    }
    routes.push(routeToETH);
  }
  routes.push(ZAP_ROUTES.WETH.CVX);

  const estimate = toBigInt(
    await ethers.provider.call({
      from: KEEPER,
      to: await locker.getAddress(),
      data: locker.interface.encodeFunctionData("harvestVotium", [claimParams, routes, 0]),
    })
  );
  console.log("estimate harvested CVX:", ethers.formatEther(estimate.toString()));
  const gasEstimate = await ethers.provider.estimateGas({
    from: KEEPER,
    to: await locker.getAddress(),
    data: locker.interface.encodeFunctionData("harvestVotium", [claimParams, routes, 0]),
  });
  console.log("gas estimate:", gasEstimate.toString());

  if (KEEPER === deployer.address) {
    const fee = await ethers.provider.getFeeData();
    const tx = await locker.harvestVotium(claimParams, routes, (estimate * 9995n) / 10000n, {
      gasLimit: (gasEstimate * 12n) / 10n,
      maxFeePerGas: fee.maxFeePerGas!,
      maxPriorityFeePerGas: ethers.parseUnits("2", "gwei"),
    });
    console.log("waiting for tx:", tx.hash);
    const receipt = await tx.wait();
    console.log("confirmed, gas used:", receipt!.gasUsed.toString());
    let furnaceCVX = 0n;
    let treasuryCVX = 0n;
    for (const log of receipt!.logs) {
      if (log.topics[0] === "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef") {
        const [from] = ethers.AbiCoder.defaultAbiCoder().decode(["address"], log.topics[1]);
        const [to] = ethers.AbiCoder.defaultAbiCoder().decode(["address"], log.topics[2]);
        const [value] = ethers.AbiCoder.defaultAbiCoder().decode(["uint256"], log.data);
        if (same(from, deployment.CVXLocker)) {
          if (same(to, DEPLOYED_CONTRACTS.CLever.PlatformFeeDistributor)) treasuryCVX = value;
          if (same(to, deployment.Furnace)) furnaceCVX = value;
        }
      }
    }
    console.log(
      "actual furnace CVX:",
      ethers.formatEther(furnaceCVX),
      "treasury CVX:",
      ethers.formatEther(treasuryCVX)
    );
    for (const symbol of manualTokens) {
      const { address, decimals } = TOKENS[symbol];
      const token = await ethers.getContractAt("IERC20", address, deployer);
      const balance = await token.balanceOf(deployment.CVXLocker);
      console.log(`harvested ${symbol}:`, ethers.formatUnits(balance, decimals));
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
