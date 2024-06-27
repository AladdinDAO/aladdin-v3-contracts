import axios from "axios";
import { Command, Option } from "commander";
import fs from "fs";
import path from "path";
import * as hre from "hardhat";
import { MaxUint256, ZeroAddress, toBigInt } from "ethers";
import "@nomicfoundation/hardhat-ethers";

import { CLeverCVXDeployment } from "@/contracts/CLeverCVX";
import { CLeverCVXLocker } from "@/types/index";
import { same } from "@/utils/address";
import { DEPLOYED_CONTRACTS, selectDeployments } from "@/utils/deploys";
import { MULTI_PATH_CONVERTER_ROUTES } from "@/utils/routes";
import { TOKENS } from "@/utils/tokens";

const ethers = hre.ethers;
const program = new Command();
program.version("1.0.0");

const KEEPER = "0x11E91BB6d1334585AA37D8F4fde3932C7960B938";
const MULTI_PATH_CONVERTER = "0x0c439DB9b9f11E7F2D4624dE6d0f8FfC23DCd1f8";

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
  GHO: "gho",
};

interface IPaladinClaims {
  id: number;
  user: string;
  token: string;
  amount: string;
  index: number;
  period: number;
  questId: number;
  gauge: string;
  proofs: Array<string>;
  path: string;
  distributor: string;
  chainId: number;
}

export function loadParams(market: string, periods: string): IPaladinClaims[] {
  const results: Array<IPaladinClaims> = [];
  for (const period of periods.split(",")) {
    const filepath = path.join(__dirname, "data", market, `${period}.json`);
    const claims: Array<IPaladinClaims> = JSON.parse(fs.readFileSync(filepath, "utf-8"));
    results.push(...claims);
  }
  return results;
}

async function main(market: string, periods: string, manualStr: string) {
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
  const locker = await ethers.getContractAt("CLeverCVXLocker", deployment.CVXLocker.proxy, deployer);
  const converter = await ethers.getContractAt("MultiPathConverter", MULTI_PATH_CONVERTER, deployer);

  const manualTokens = manualStr === "" ? [] : manualStr.split(",");
  console.log(`Paladin Harvest periods[${periods}] from market[${market}]:`);
  const claims = loadParams(market, periods);
  claims.sort((a, b) => {
    const r = BigInt(a.token) - BigInt(b.token);
    if (r > 0n) return 1;
    if (r < 0n) return -1;
    return 0;
  });

  const routes: Array<CLeverCVXLocker.ConvertParamStruct> = [];
  const routeToCVX = MULTI_PATH_CONVERTER_ROUTES.WETH.CVX;
  const paramToCVX = {
    target: await converter.getAddress(),
    spender: await converter.getAddress(),
    data: converter.interface.encodeFunctionData("convert", [
      TOKENS.WETH.address,
      MaxUint256,
      routeToCVX.encoding,
      routeToCVX.routes,
    ]),
  };

  for (let i = 0; i < claims.length; ) {
    let j = i;
    let tokenSum = 0n;
    while (j < claims.length && same(claims[i].token, claims[j].token)) {
      tokenSum += BigInt(claims[j].amount);
      ++j;
    }

    const symbol: string = Object.entries(TOKENS).filter(([, { address }]) => same(address, claims[i].token))[0][0];
    const routeToWETH = ["WETH", "CVX"].includes(symbol)
      ? { encoding: 0n, routes: [] }
      : MULTI_PATH_CONVERTER_ROUTES[symbol].WETH;
    const paramToWETH =
      routeToWETH.encoding === 0n
        ? { target: ZeroAddress, spender: ZeroAddress, data: "0x" }
        : {
            target: await converter.getAddress(),
            spender: await converter.getAddress(),
            data: converter.interface.encodeFunctionData("convert", [
              claims[i].token,
              tokenSum,
              routeToWETH.encoding,
              routeToWETH.routes,
            ]),
          };

    const estimate = BigInt(
      await ethers.provider.call({
        from: KEEPER,
        to: await locker.getAddress(),
        data: locker.interface.encodeFunctionData("harvestPaladinLikeBribes", [
          claims[i].distributor,
          claims.slice(i, j).map((x) => {
            return {
              questID: x.questId,
              period: x.period,
              index: x.index,
              amount: x.amount,
              merkleProof: x.proofs,
            };
          }),
          [paramToWETH, paramToCVX],
          0n,
        ]),
      })
    );
    const tokenAmountStr = ethers.formatUnits(tokenSum, TOKENS[symbol].decimals);
    const cvxAmountStr = ethers.formatEther(estimate.toString());
    if (prices[symbol]) {
      console.log(
        `  token[${symbol}]`,
        `address[${claims[i].token}]`,
        `amount[${tokenAmountStr}]/USD[${(parseFloat(tokenAmountStr) * prices[symbol]).toFixed(2)}]`,
        `CVX[${cvxAmountStr}]/USD[${(parseFloat(cvxAmountStr) * prices.CVX).toFixed(2)}]`
      );
    } else {
      console.log(
        `  token[${symbol}]`,
        `address[${claims[i].token}]`,
        `amount[${tokenAmountStr}]`,
        `CVX[${cvxAmountStr}]`
      );
    }
    routes.push(paramToWETH);
    i = j;
  }
  routes.push(paramToCVX);

  const calldataForEstimation = locker.interface.encodeFunctionData("harvestPaladinLikeBribes", [
    claims[0].distributor,
    claims.map((x) => {
      return {
        questID: x.questId,
        period: x.period,
        index: x.index,
        amount: x.amount,
        merkleProof: x.proofs,
      };
    }),
    routes,
    0n,
  ]);
  const estimationTx = {
    from: KEEPER,
    to: await locker.getAddress(),
    data: calldataForEstimation,
  };

  const gasEstimation = await ethers.provider.estimateGas(estimationTx);
  const cvxEstimation = toBigInt(await ethers.provider.call(estimationTx));
  console.log(
    "GasEstimate:",
    gasEstimation.toString(),
    "Estimate Harvested CVX:",
    ethers.formatEther(cvxEstimation.toString())
  );
  const minCVXOut = (cvxEstimation * 9990n) / 10000n;

  if (KEEPER === deployer.address) {
    const block = await ethers.provider.getBlock("latest");
    const tx = await locker.harvestPaladinLikeBribes(
      claims[0].distributor,
      claims.map((x) => {
        return {
          questID: x.questId,
          period: x.period,
          index: x.index,
          amount: x.amount,
          merkleProof: x.proofs,
        };
      }),
      routes,
      minCVXOut,
      {
        gasLimit: (gasEstimation * 12n) / 10n,
        maxFeePerGas: (block!.baseFeePerGas! * 3n) / 2n,
        maxPriorityFeePerGas: ethers.parseUnits("0.01", "gwei"),
      }
    );
    console.log("Waiting for tx:", tx.hash);
    const receipt = await tx.wait();
    console.log(
      ">> ✅ Done, GasUsed:",
      receipt!.gasUsed.toString(),
      "GasFees:",
      ethers.formatUnits(receipt!.gasUsed * receipt!.gasPrice)
    );

    let furnaceCVX = 0n;
    let treasuryCVX = 0n;
    for (const log of receipt!.logs) {
      if (log.topics[0] === "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef") {
        const [from] = ethers.AbiCoder.defaultAbiCoder().decode(["address"], log.topics[1]);
        const [to] = ethers.AbiCoder.defaultAbiCoder().decode(["address"], log.topics[2]);
        const [value] = ethers.AbiCoder.defaultAbiCoder().decode(["uint256"], log.data);
        if (same(from, deployment.CVXLocker.proxy)) {
          if (same(to, DEPLOYED_CONTRACTS.CLever.PlatformFeeDistributor)) treasuryCVX = value;
          if (same(to, deployment.Furnace.proxy)) furnaceCVX = value;
        }
      }
    }
    console.log(
      "Actual Furnace CVX:",
      ethers.formatEther(furnaceCVX),
      "Treasury CVX:",
      ethers.formatEther(treasuryCVX)
    );
    for (const symbol of manualTokens) {
      const { address, decimals } = TOKENS[symbol];
      const token = await ethers.getContractAt("IERC20", address, deployer);
      const balance = await token.balanceOf(deployment.CVXLocker.proxy);
      console.log(`Pending Manual Swap ${symbol}:`, ethers.formatUnits(balance, decimals));
    }
  }
}

program.option("--periods <periods>", "the list of period to harvest");
program.option("--manual <manual swap token>", "the list of symbols for manual swap tokens");
program.addOption(new Option("--market <market>", "the market to harvest").choices(["crv", "fxn"]));
program.parse(process.argv);
const options = program.opts();

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main(options.market, options.periods, options.manual || "").catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
