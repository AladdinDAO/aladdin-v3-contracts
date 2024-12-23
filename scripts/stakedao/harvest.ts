import axios from "axios";
import { Command } from "commander";
import { ZeroAddress, toBigInt } from "ethers";
import * as hre from "hardhat";
import "@nomicfoundation/hardhat-ethers";

import { ConcentratorStakeDAODeployment } from "@/contracts/ConcentratorStakeDAO";
import { MultisigDeployment } from "@/contracts/Multisig";
import { abiDecode } from "@/contracts/helpers";

import { SdCRVBribeBurnerV2 } from "@/types/index";
import { MULTI_PATH_CONVERTER_ROUTES, same, selectDeployments, TOKENS } from "@/utils/index";

import { loadParams } from "./config";

const ethers = hre.ethers;
const program = new Command();
program.version("1.0.0");

const KEEPER = "0x11E91BB6d1334585AA37D8F4fde3932C7960B938";
const STASH = "0x03E34b085C52985F6a5D27243F20C84bDdc01Db4";

interface ICoinGeckoResponse {
  [symbol: string]: {
    [currency: string]: number;
  };
}

const symbol2ids: { [symbol: string]: string } = {
  sdCRV: "stake-dao-crv",
  CRV: "curve-dao-token",
  SDT: "stake-dao",
};

async function getSwapData(
  src: string,
  dst: string,
  amountIn: bigint,
  minOut: bigint
): Promise<SdCRVBribeBurnerV2.ConvertParamsStruct> {
  // @note should change before actually call
  const converter = await ethers.getContractAt("MultiPathConverter", "0x4F96fe476e7dcD0404894454927b9885Eb8B57c3");
  if (same(src, dst)) return { target: ZeroAddress, data: "0x", minOut };
  if (same(src, TOKENS.sdCRV.address)) {
    if (same(dst, TOKENS.SDT.address)) {
      const encoding = MULTI_PATH_CONVERTER_ROUTES.sdCRV.SDT;
      return {
        target: await converter.getAddress(),
        data: converter.interface.encodeFunctionData("convert", [src, amountIn, encoding.encoding, encoding.routes]),
        minOut,
      };
    }
  }
  return { target: ZeroAddress, data: "0x", minOut };
}

async function main(round: string) {
  const multisig = selectDeployments("mainnet", "Multisig").toObject() as MultisigDeployment;
  const deployment = selectDeployments("mainnet", "Concentrator.StakeDAO").toObject() as ConcentratorStakeDAODeployment;

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
  const wrapper = await ethers.getContractAt(
    "ConcentratorSdCrvGaugeWrapper",
    deployment.ConcentratorSdCrvGaugeWrapper.proxy,
    deployer
  );
  const locker = await ethers.getContractAt(
    "ConcentratorStakeDAOLocker",
    deployment.ConcentratorStakeDAOLocker.proxy,
    deployer
  );
  const stash = await ethers.getContractAt("IMultiMerkleStash", STASH, deployer);
  const burner = await ethers.getContractAt("SdCRVBribeBurnerV2", deployment.SdCRVBribeBurnerV2, deployer);
  const priceSDT = prices.SDT;
  const priceCRV = prices.CRV;
  const expenseRatio = await wrapper.getExpenseRatio();
  const boosterRatio = await wrapper.getBoosterRatio();

  console.log("Harvest Round:", round);
  const claimParams = loadParams(round);
  for (const item of claimParams) {
    const symbol: string = Object.entries(TOKENS).filter(
      ([, { address }]) => address.toLowerCase() === item.token.toLowerCase()
    )[0][0];
    const tokenAmountStr = ethers.formatUnits(item.amount, TOKENS[symbol].decimals);
    console.log(
      `+ token[${symbol}]: amount[${tokenAmountStr}] USD[~${(parseFloat(tokenAmountStr) * prices[symbol]).toFixed(2)}]`
    );

    const amount = toBigInt(item.amount);
    const platformFee = (amount * expenseRatio) / toBigInt(1e9);
    const boostFee = (amount * boosterRatio) / toBigInt(1e9);
    if (symbol === "SDT") {
      console.log(
        `  + treasury[${ethers.formatEther(platformFee)} SDT]`,
        `delegation[${ethers.formatEther(boostFee)} SDT]`,
        `staker[${ethers.formatEther(amount - platformFee - boostFee)} SDT]`
      );
    } else {
      const amountSDT = ethers.parseEther(
        ((parseFloat(ethers.formatUnits(boostFee, TOKENS[symbol].decimals)) * prices[symbol]) / priceSDT).toFixed(18)
      );
      if (symbol === "sdCRV") {
        console.log(
          `  + treasury[${ethers.formatEther(platformFee)} ${symbol}]`,
          `delegation[~${ethers.formatEther(amountSDT)} SDT]`,
          `staker[${ethers.formatEther(amount - platformFee - boostFee)} sdCRV]`
        );
      } else {
        const amountCRV = ethers.parseEther(
          (
            (parseFloat(ethers.formatUnits(amount - platformFee - boostFee, TOKENS[symbol].decimals)) *
              prices[symbol]) /
            priceCRV
          ).toFixed(18)
        );
        console.log(
          `  + treasury[${ethers.formatEther(platformFee)} ${symbol}]`,
          `delegation[~${ethers.formatEther(amountSDT)} SDT]`,
          `staker[~${ethers.formatEther(amountCRV)} CRV]`
        );
      }
    }
  }

  const root = await stash.merkleRoot.staticCall(claimParams[0].token);
  if (!(await locker.claimed(claimParams[0].token, root))) {
    const data = wrapper.interface.encodeFunctionData("harvestBribes", [claimParams]);
    console.log("claim data:", data);
    const gasEstimate = await ethers.provider.estimateGas({
      from: KEEPER,
      to: await wrapper.getAddress(),
      data,
    });
    console.log("gas estimate:", gasEstimate.toString());
  }

  if (KEEPER === deployer.address) {
    if (!(await locker.claimed(claimParams[0].token, root))) {
      const block = await ethers.provider.getBlock("latest");
      const tx = await wrapper.harvestBribes(claimParams, {
        maxFeePerGas: (block!.baseFeePerGas! * 3n) / 2n,
        maxPriorityFeePerGas: ethers.parseUnits("0.01", "gwei"),
      });
      console.log("waiting for tx:", tx.hash);
      const receipt = await tx.wait();
      console.log("confirmed, gas used:", receipt!.gasUsed.toString());
      let delegateSDT = 0n;
      let treasurySDT = 0n;
      let totalSDT = 0n;
      for (const log of receipt!.logs) {
        if (
          log.topics[0] === "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef" &&
          log.address.toLowerCase() === TOKENS.SDT.address.toLowerCase()
        ) {
          const [from] = abiDecode(["address"], log.topics[1]);
          const [to] = abiDecode(["address"], log.topics[2]);
          const [value] = abiDecode(["uint256"], log.data);
          if (same(from, deployment.StakeDAOCRVVault.proxy) && same(to, multisig.Concentrator)) treasurySDT = value;
          if (same(from, deployment.StakeDAOCRVVault.proxy) && same(to, deployment.VeSDTDelegation.proxy))
            delegateSDT = value;
          if (same(to, deployment.StakeDAOCRVVault.proxy)) totalSDT = value;
        }
      }
      console.log(
        "actual reward SDT:",
        ethers.formatEther(totalSDT - treasurySDT - delegateSDT),
        "treasury SDT:",
        ethers.formatEther(treasurySDT),
        "delegation SDT:",
        ethers.formatEther(delegateSDT)
      );
    }

    for (const item of claimParams) {
      if (item.token.toLowerCase() !== TOKENS.SDT.address.toLowerCase()) {
        const symbol: string = Object.entries(TOKENS).filter(
          ([, { address }]) => address.toLowerCase() === item.token.toLowerCase()
        )[0][0];
        const amount = toBigInt(item.amount);
        const platformFee = (amount * expenseRatio) / toBigInt(1e9);
        const boostFee = (amount * boosterRatio) / toBigInt(1e9);

        const amountSDT = ethers.parseEther(
          ((parseFloat(ethers.formatUnits(boostFee, TOKENS[symbol].decimals)) * prices[symbol]) / priceSDT).toFixed(18)
        );
        const amountCRV = ethers.parseEther(
          (
            (parseFloat(ethers.formatUnits(amount - platformFee - boostFee, TOKENS[symbol].decimals)) *
              prices[symbol]) /
            priceCRV
          ).toFixed(18)
        );

        console.log(`Burn token[${symbol}] address[${item.token}] to SDT/CRV`);
        const minSDT = (amountSDT * 9750n) / 10000n;
        const minCRV = (amountCRV * 9990n) / 10000n;
        const routeSDT = await getSwapData(item.token, TOKENS.SDT.address, boostFee, minSDT);
        const routeCRV = await getSwapData(item.token, TOKENS.CRV.address, amount - platformFee - boostFee, minCRV);
        console.log("burn data:", burner.interface.encodeFunctionData("burn", [item.token, routeSDT, routeCRV]));
        const gasEstimate = await burner.burn.estimateGas(item.token, routeSDT, routeCRV);
        console.log("  gas estimate:", gasEstimate.toString());
        const block = await ethers.provider.getBlock("latest");
        const tx = await burner.burn(item.token, routeSDT, routeCRV, {
          gasLimit: (gasEstimate * 12n) / 10n,
          maxFeePerGas: (block!.baseFeePerGas! * 3n) / 2n,
          maxPriorityFeePerGas: ethers.parseUnits("0.1", "gwei"),
        });
        console.log("  waiting for tx:", tx.hash);
        const receipt = await tx.wait();
        console.log("  confirmed, gas used:", receipt!.gasUsed.toString());
        let treasuryAmount = 0n;
        let delegationAmount = 0n;
        let stakerAmount = 0n;
        for (const log of receipt!.logs) {
          if (log.topics[0] === "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef") {
            const [from] = abiDecode(["address"], log.topics[1]);
            const [to] = abiDecode(["address"], log.topics[2]);
            const [value] = abiDecode(["uint256"], log.data);
            if (
              same(log.address, item.token) &&
              same(from, deployment.SdCRVBribeBurnerV2) &&
              same(to, multisig.Concentrator)
            ) {
              treasuryAmount = value;
            }
            if (
              same(log.address, TOKENS.SDT.address) &&
              same(from, deployment.SdCRVBribeBurnerV2) &&
              same(to, deployment.VeSDTDelegation.proxy)
            ) {
              delegationAmount = value;
            }
            if (
              same(log.address, TOKENS.CRV.address) &&
              same(from, deployment.SdCRVBribeBurnerV2) &&
              same(to, deployment.StakeDAOCRVVault.proxy)
            ) {
              stakerAmount = value;
            }
            if (
              same(log.address, TOKENS.sdCRV.address) &&
              same(from, deployment.SdCRVBribeBurnerV2) &&
              same(to, deployment.StakeDAOCRVVault.proxy)
            ) {
              stakerAmount = value;
            }
          }
        }
        console.log(
          "  actual reward CRV or sdCRV:",
          ethers.formatEther(stakerAmount),
          `treasury ${symbol}:`,
          ethers.formatUnits(treasuryAmount, TOKENS[symbol].decimals),
          "delegation SDT:",
          ethers.formatEther(delegationAmount)
        );
      }
    }
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
