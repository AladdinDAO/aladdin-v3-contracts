import axios from "axios";
import { Command } from "commander";
import { toBigInt } from "ethers";
import * as hre from "hardhat";
import "@nomicfoundation/hardhat-ethers";

import { ConcentratorStakeDAODeployment } from "@/contracts/ConcentratorStakeDAO";
import { MultisigDeployment } from "@/contracts/Multisig";
import { abiDecode } from "@/contracts/helpers";

import { same } from "@/utils/address";
import { selectDeployments } from "@/utils/deploys";
import { ZAP_ROUTES } from "@/utils/routes";
import { TOKENS } from "@/utils/tokens";

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
  const vault = await ethers.getContractAt("StakeDAOCRVVault", deployment.StakeDAOCRVVault.proxy, deployer);
  const locker = await ethers.getContractAt("StakeDAOLockerProxy", deployment.StakeDAOLockerProxy.proxy, deployer);
  const stash = await ethers.getContractAt("IStakeDAOMultiMerkleStash", STASH, deployer);
  const burner = await ethers.getContractAt("SdCRVBribeBurner", deployment.SdCRVBribeBurner, deployer);
  const priceSDT = prices.SDT;
  const priceCRV = prices.CRV;
  const fee = await vault.feeInfo();

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
    const platformFee = (amount * fee.platformPercentage) / toBigInt(1e7);
    const boostFee = (amount * fee.boostPercentage) / toBigInt(1e7);
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
    console.log("data:", vault.interface.encodeFunctionData("harvestBribes", [claimParams]));
    const gasEstimate = await ethers.provider.estimateGas({
      from: KEEPER,
      to: deployment.StakeDAOCRVVault.proxy,
      data: vault.interface.encodeFunctionData("harvestBribes", [claimParams]),
    });
    console.log("gas estimate:", gasEstimate.toString());
  }

  if (KEEPER === deployer.address) {
    if (!(await locker.claimed(claimParams[0].token, root))) {
      const tx = await vault.harvestBribes(claimParams);
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
        const platformFee = (amount * fee.platformPercentage) / toBigInt(1e7);
        const boostFee = (amount * fee.boostPercentage) / toBigInt(1e7);

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

        console.log(`Burn token[${symbol}] address[${item.token}] to SDT`);
        const minSDT = (amountSDT * 99n) / 100n;
        const minCRV = (amountCRV * 99n) / 100n;
        const gas = await burner.burn.estimateGas(
          item.token,
          ZAP_ROUTES[symbol].SDT,
          minSDT,
          ZAP_ROUTES[symbol].CRV,
          minCRV
        );
        const tx = await burner.burn(item.token, ZAP_ROUTES[symbol].SDT, minSDT, ZAP_ROUTES[symbol].CRV, minCRV, {
          gasLimit: (gas * 12n) / 10n,
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
              same(from, deployment.SdCRVBribeBurner) &&
              same(to, multisig.Concentrator)
            ) {
              treasuryAmount = value;
            }
            if (
              same(log.address, TOKENS.SDT.address) &&
              same(from, deployment.SdCRVBribeBurner) &&
              same(to, deployment.VeSDTDelegation.proxy)
            ) {
              delegationAmount = value;
            }
            if (
              same(log.address, TOKENS.CRV.address) &&
              same(from, deployment.SdCRVBribeBurner) &&
              same(to, deployment.StakeDAOCRVVault.proxy)
            ) {
              stakerAmount = value;
            }
            if (
              same(log.address, TOKENS.sdCRV.address) &&
              same(from, deployment.SdCRVBribeBurner) &&
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
