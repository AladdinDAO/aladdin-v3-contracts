/* eslint-disable node/no-missing-import */
import axios from "axios";
import { Command } from "commander";
import { BigNumber, constants } from "ethers";
import * as hre from "hardhat";
import "@nomiclabs/hardhat-ethers";
import { DEPLOYED_CONTRACTS, TOKENS, ZAP_ROUTES } from "../utils";
import { loadParams } from "./config";

const ethers = hre.ethers;
const program = new Command();
program.version("1.0.0");

const KEEPER = "0x11E91BB6d1334585AA37D8F4fde3932C7960B938";
const BURNER = "0xf98Af660d1ff28Cd986b205d6201FB1D5EE231A3";
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
  const locker = await ethers.getContractAt(
    "StakeDAOLockerProxy",
    DEPLOYED_CONTRACTS.Concentrator.StakeDAO.StakeDAOLockerProxy,
    deployer
  );
  const stash = await ethers.getContractAt("IStakeDAOMultiMerkleStash", STASH, deployer);
  const burner = await ethers.getContractAt("SdCRVBribeBurner", BURNER, deployer);
  const priceSDT = prices.SDT;
  const priceCRV = prices.CRV;
  const fee = await vault.feeInfo();

  console.log("Harvest Round:", round);
  const claimParams = loadParams(round);
  for (const item of claimParams) {
    const symbol: string = Object.entries(TOKENS).filter(
      ([, { address }]) => address.toLowerCase() === item.token.toLowerCase()
    )[0][0];
    const tokenAmountStr = ethers.utils.formatUnits(item.amount, TOKENS[symbol].decimals);
    console.log(
      `+ token[${symbol}]: amount[${tokenAmountStr}] USD[~${(parseFloat(tokenAmountStr) * prices[symbol]).toFixed(2)}]`
    );

    const amount = BigNumber.from(item.amount);
    const platformFee = amount.mul(fee.platformPercentage).div(1e7);
    const boostFee = amount.mul(fee.boostPercentage).div(1e7);
    if (symbol === "SDT") {
      console.log(
        `  + treasury[${ethers.utils.formatEther(platformFee)} SDT]`,
        `delegation[${ethers.utils.formatEther(boostFee)} SDT]`,
        `staker[${ethers.utils.formatEther(amount.sub(platformFee).sub(boostFee))} SDT]`
      );
    } else {
      const amountSDT = ethers.utils.parseEther(
        ((parseFloat(ethers.utils.formatUnits(boostFee, TOKENS[symbol].decimals)) * prices[symbol]) / priceSDT).toFixed(
          18
        )
      );
      const amountCRV = ethers.utils.parseEther(
        (
          (parseFloat(ethers.utils.formatUnits(amount.sub(platformFee).sub(boostFee), TOKENS[symbol].decimals)) *
            prices[symbol]) /
          priceCRV
        ).toFixed(18)
      );
      console.log(
        `  + treasury[${ethers.utils.formatEther(platformFee)} ${symbol}]`,
        `delegation[~${ethers.utils.formatEther(amountSDT)} SDT]`,
        `staker[~${ethers.utils.formatEther(amountCRV)} CRV]`
      );
    }
  }

  const root = await stash.callStatic.merkleRoot(claimParams[0].token);
  if (!(await locker.claimed(claimParams[0].token, root))) {
    console.log("data:", vault.interface.encodeFunctionData("harvestBribes", [claimParams]));
    const gasEstimate = await ethers.provider.estimateGas({
      from: KEEPER,
      to: vault.address,
      data: vault.interface.encodeFunctionData("harvestBribes", [claimParams]),
    });
    console.log("gas estimate:", gasEstimate.toString());
  }

  if (KEEPER === deployer.address) {
    if (!(await locker.claimed(claimParams[0].token, root))) {
      const tx = await vault.harvestBribes(claimParams);
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

    for (const item of claimParams) {
      if (item.token.toLowerCase() !== TOKENS.SDT.address.toLowerCase()) {
        const symbol: string = Object.entries(TOKENS).filter(
          ([, { address }]) => address.toLowerCase() === item.token.toLowerCase()
        )[0][0];
        const amount = BigNumber.from(item.amount);
        const platformFee = amount.mul(fee.platformPercentage).div(1e7);
        const boostFee = amount.mul(fee.boostPercentage).div(1e7);

        const amountSDT = ethers.utils.parseEther(
          (
            (parseFloat(ethers.utils.formatUnits(boostFee, TOKENS[symbol].decimals)) * prices[symbol]) /
            priceSDT
          ).toFixed(18)
        );
        const amountCRV = ethers.utils.parseEther(
          (
            (parseFloat(ethers.utils.formatUnits(amount.sub(platformFee).sub(boostFee), TOKENS[symbol].decimals)) *
              prices[symbol]) /
            priceCRV
          ).toFixed(18)
        );

        console.log(`Burn token[${symbol}] address[${item.token}] to SDT`);
        const tx = await burner.burn(
          item.token,
          ZAP_ROUTES[symbol].SDT,
          amountSDT.mul(99).div(100),
          ZAP_ROUTES[symbol].CRV,
          amountCRV.mul(99).div(100)
        );
        console.log("waiting for tx:", tx.hash);
        const receipt = await tx.wait();
        console.log("confirmed, gas used:", receipt.gasUsed.toString());
        let treasuryAmount = constants.Zero;
        let delegationAmount = constants.Zero;
        let stakerAmount = constants.Zero;
        for (const log of receipt.logs) {
          if (log.topics[0] === "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef") {
            const [from] = ethers.utils.defaultAbiCoder.decode(["address"], log.topics[1]) as [string];
            const [to] = ethers.utils.defaultAbiCoder.decode(["address"], log.topics[2]) as [string];
            const [value] = ethers.utils.defaultAbiCoder.decode(["uint256"], log.data) as [BigNumber];
            if (
              log.address.toLowerCase() === item.token.toLowerCase() &&
              from === burner.address &&
              to === DEPLOYED_CONTRACTS.Concentrator.Treasury
            ) {
              treasuryAmount = value;
            }
            if (
              log.address.toLowerCase() === TOKENS.SDT.address.toLowerCase() &&
              from === burner.address &&
              to === delegation.address
            ) {
              delegationAmount = value;
            }
            if (
              log.address.toLowerCase() === TOKENS.CRV.address.toLowerCase() &&
              from === burner.address &&
              to === vault.address
            ) {
              stakerAmount = value;
            }
          }
        }
        console.log(
          "actual reward CRV:",
          ethers.utils.formatEther(stakerAmount),
          `treasury ${symbol}:`,
          ethers.utils.formatUnits(treasuryAmount, TOKENS[symbol].decimals),
          "delegation SDT:",
          ethers.utils.formatEther(delegationAmount)
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
