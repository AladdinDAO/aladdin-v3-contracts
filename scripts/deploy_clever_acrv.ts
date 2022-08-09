/* eslint-disable node/no-missing-import */
import { ethers } from "hardhat";
import { CLeverToken, ProxyAdmin, MetaFurnace, MetaCLever, AladdinCRVStrategy } from "../typechain";
import { ADDRESS } from "./utils";

const config: {
  proxyAdmin?: string;
  clevCRV?: string;
  strategy?: string;
  furnace?: string;
  clever?: string;
} = {
  proxyAdmin: "0xeb5EB007Ab39e9831a1921E8116Bc353AFE5BA2C",
  clevCRV: "0xDAF03D70Fe637b91bA6E521A32E1Fb39256d3EC9",
  furnace: "0x7a5A9332638CD6846f17661851D7F472220dFdA8",
  clever: "0xD6E3BB7b1D6Fa75A71d48CFB10096d59ABbf99E1",
  strategy: "0xAe9D13Aab81c752290dfbE536931a4fec80C77D7",
};

const PLATFORM = "0xFC08757c505eA28709dF66E54870fB6dE09f0C5E";
const PLATFORM_FEE_PERCENTAGE = 2e7; // 2%
const HARVEST_BOUNTY_PERCENTAGE = 1e7; // 1%
const REPAY_FEE_PERCENTAGE = 5e7; // 5%
const RESERVE_RATE = 5e8; // 50%
const MINT_CEILING = ethers.utils.parseEther("10000000");
const CRV = ADDRESS.CRV;

let proxyAdmin: ProxyAdmin;
let clevCRV: CLeverToken;
let furnace: MetaFurnace;
let strategy: AladdinCRVStrategy;
let clever: MetaCLever;

async function initialSetup() {
  if (!(await clever.reserveRate()).eq(RESERVE_RATE)) {
    const tx = await clever.updateReserveRate(RESERVE_RATE);
    console.log("setup reserve rate in tx:", tx.hash);
    const receipt = await tx.wait();
    console.log("done, gas used:", receipt.gasUsed.toString());
  }

  const feeInfo = await clever.feeInfo();
  if (
    feeInfo.platform !== PLATFORM ||
    feeInfo.platformPercentage !== PLATFORM_FEE_PERCENTAGE ||
    feeInfo.repayPercentage !== REPAY_FEE_PERCENTAGE ||
    feeInfo.bountyPercentage !== HARVEST_BOUNTY_PERCENTAGE
  ) {
    const tx = await clever.updateFeeInfo(
      PLATFORM,
      PLATFORM_FEE_PERCENTAGE,
      HARVEST_BOUNTY_PERCENTAGE,
      REPAY_FEE_PERCENTAGE
    );
    console.log("setup fees in CLever in tx:", tx.hash);
    const receipt = await tx.wait();
    console.log("done, gas used:", receipt.gasUsed.toString());
  }

  if (!(await furnace.isWhitelisted(clever.address))) {
    const tx = await furnace.updateWhitelists([clever.address], true);
    console.log("setup furnace whitelists in tx:", tx.hash);
    const receipt = await tx.wait();
    console.log("done, gas used:", receipt.gasUsed.toString());
  }

  if (!(await clevCRV.isMinter(clever.address))) {
    const tx = await clevCRV.updateMinters([clever.address], true);
    console.log("setup minter in tx:", tx.hash);
    const receipt = await tx.wait();
    console.log("done, gas used:", receipt.gasUsed.toString());
  }

  if (!(await clevCRV.minterInfo(clever.address)).ceiling.eq(MINT_CEILING)) {
    const tx = await clevCRV.updateCeiling(clever.address, MINT_CEILING);
    console.log("setup minter ceiling in tx:", tx.hash);
    const receipt = await tx.wait();
    console.log("done, gas used:", receipt.gasUsed.toString());
  }

  const [, strategies] = await clever.getActiveYieldStrategies();
  if (!strategies.includes(strategy.address)) {
    const tx = await clever.addYieldStrategy(strategy.address, []);
    console.log("setup add AladdinCRVStrategy to CLever in tx:", tx.hash);
    const receipt = await tx.wait();
    console.log("done, gas used:", receipt.gasUsed.toString());
  }
}

async function main() {
  const [deployer] = await ethers.getSigners();

  if (config.proxyAdmin) {
    proxyAdmin = await ethers.getContractAt("ProxyAdmin", config.proxyAdmin, deployer);
    console.log("Found ProxyAdmin at:", proxyAdmin.address);
  } else {
    const ProxyAdmin = await ethers.getContractFactory("ProxyAdmin", deployer);
    proxyAdmin = await ProxyAdmin.deploy();
    await proxyAdmin.deployed();
    console.log("Deploy ProxyAdmin at:", proxyAdmin.address);
  }

  if (config.clevCRV) {
    clevCRV = (await ethers.getContractAt("CLeverToken", config.clevCRV, deployer)) as CLeverToken;
    console.log("Found clevCRV at:", clevCRV.address);
  } else {
    const CLeverToken = await ethers.getContractFactory("CLeverToken", deployer);
    clevCRV = (await CLeverToken.deploy("CLever CRV", "clevCRV")) as CLeverToken;
    await clevCRV.deployed();
    console.log("Deploy clevCRV at:", clevCRV.address);
  }

  if (config.furnace) {
    furnace = await ethers.getContractAt("MetaFurnace", config.furnace, deployer);
    console.log("Found MetaFurnace at:", furnace.address);
  } else {
    const MetaFurnace = await ethers.getContractFactory("MetaFurnace", deployer);
    const impl = await MetaFurnace.deploy();
    await impl.deployed();
    console.log("Deploy MetaFurnace Impl at:", impl.address);

    const data = impl.interface.encodeFunctionData("initialize", [CRV, clevCRV.address]);
    const TransparentUpgradeableProxy = await ethers.getContractFactory("TransparentUpgradeableProxy", deployer);
    const proxy = await TransparentUpgradeableProxy.deploy(impl.address, proxyAdmin.address, data);
    await proxy.deployed();
    furnace = await ethers.getContractAt("MetaFurnace", proxy.address, deployer);
    console.log("Deploy MetaFurnace at:", furnace.address);
  }

  if (config.clever) {
    clever = await ethers.getContractAt("MetaCLever", config.clever, deployer);
    console.log("Found MetaCLever at:", clever.address);
  } else {
    const MetaCLever = await ethers.getContractFactory("MetaCLever", deployer);
    const impl = await MetaCLever.deploy();
    await impl.deployed();
    console.log("Deploy MetaCLever Impl at:", impl.address);

    const data = impl.interface.encodeFunctionData("initialize", [clevCRV.address, furnace.address]);
    const TransparentUpgradeableProxy = await ethers.getContractFactory("TransparentUpgradeableProxy", deployer);
    const proxy = await TransparentUpgradeableProxy.deploy(impl.address, proxyAdmin.address, data);
    await proxy.deployed();
    clever = await ethers.getContractAt("MetaCLever", proxy.address, deployer);
    console.log("Deploy MetaCLever at:", clever.address);
  }

  if (config.strategy) {
    strategy = await ethers.getContractAt("AladdinCRVStrategy", config.strategy, deployer);
    console.log("Found AladdinCRVStrategy at:", strategy.address);
  } else {
    const AladdinCRVStrategy = await ethers.getContractFactory("AladdinCRVStrategy", deployer);
    strategy = await AladdinCRVStrategy.deploy(clever.address);
    await strategy.deployed();
    console.log("Deploy AladdinCRVStrategy at:", strategy.address);
  }

  await initialSetup();
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
