/* eslint-disable node/no-missing-import */
import { ethers } from "hardhat";
import {
  ConcentratorFeeDistributor,
  ConcentratorGaugeController,
  ConcentratorIFOVault,
  ConcentratorLiquidityGauge,
  CTR,
  CTRMinter,
  PlatformFeeDistributor,
  ProxyAdmin,
  VeCTR,
} from "../typechain";
import { ADDRESS, IFO_VAULTS, V3_CTRRACTS } from "./config";

const config: {
  acrv?: string;
  proxyAdmin?: string;
  aladdinZap?: string;
  ctr?: string;
  ve?: string;
  distributor?: string;
  minter?: string;
  controller?: string;
  gauge?: string;
  rewarder?: string;
  ifo?: string;
} = {
  proxyAdmin: "0xFfc272E72EeE0d6eD1253dD0165ef7473Cf7Acf4",
  acrv: V3_CTRRACTS.aCRV,
  aladdinZap: V3_CTRRACTS.AladdinZap,
  ctr: "0xf68EadE8f0d8bBAecd6E7ebcb3Ac6B782732DC55",
  ve: "0xbcC95708e0ea0a1e5EcF339bf1ead789EE728824",
  controller: "0x9B1d8B625E15cdF13dEF590B9D177a2EC699CDDb",
  minter: "0xabC97025F57B1E6a655d12A1fFc2acBCD025c585",
  distributor: "0x664921049AFB10AFA3d774D615d52282a9E1C4e8",
  gauge: "0x9939dFbFFB25364cdE728A2e725B22f59d6e1e40",
  rewarder: "0x695136781e9eF600636745789AE9411154BDCb6F",
  ifo: "0x251E903c2Dd553AAF3d093A3346FC42A997560A8",
};

let proxyAdmin: ProxyAdmin;
let ctr: CTR;
let ve: VeCTR;
let distributor: ConcentratorFeeDistributor;
let minter: CTRMinter;
let controller: ConcentratorGaugeController;
let gauge: ConcentratorLiquidityGauge;
let rewarder: PlatformFeeDistributor;
let ifo: ConcentratorIFOVault;

// eslint-disable-next-line no-unused-vars
async function addVaults() {
  for (const { convexId, rewards, withdrawFee, harvestBounty, platformFee } of IFO_VAULTS) {
    console.log("Adding pool with pid:", convexId, "rewards:", rewards.join("/"));
    const tx = await ifo.addPool(convexId, rewards, withdrawFee, platformFee, harvestBounty);
    console.log("wait for tx:", tx.hash);
    await tx.wait();
    console.log("Added with tx:", tx.hash);
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

  if (config.ctr) {
    ctr = await ethers.getContractAt("CTR", config.ctr, deployer);
    console.log("Found CTR at:", ctr.address);
  } else {
    const CTR = await ethers.getContractFactory("CTR", deployer);
    ctr = await CTR.deploy("Concentrator", "CTR", 18);
    await ctr.deployed();
    console.log("Deploy CTR at:", ctr.address);
  }

  if (config.ve) {
    ve = (await ethers.getContractAt("veCTR", config.ve, deployer)) as VeCTR;
    console.log("Found veCTR at:", ve.address);
  } else {
    const veCTR = await ethers.getContractFactory("veCTR", deployer);
    ve = (await veCTR.deploy(ctr.address, "Vote Escrowed CTR", "veCTR", "veCTR_1.0.0")) as VeCTR;
    await ve.deployed();
    console.log("Deploy veCTR at:", ve.address);
  }

  if (config.controller) {
    controller = await ethers.getContractAt("ConcentratorGaugeController", config.controller, deployer);
    console.log("Found ConcentratorGaugeController at:", controller.address);
  } else {
    const ConcentratorGaugeController = await ethers.getContractFactory("ConcentratorGaugeController", deployer);
    controller = await ConcentratorGaugeController.deploy(ctr.address, ve.address);
    await controller.deployed();
    console.log("Deploy ConcentratorGaugeController at:", controller.address);
  }

  if (config.minter) {
    minter = await ethers.getContractAt("CTRMinter", config.minter, deployer);
    console.log("Found CTRMinter at:", minter.address);
  } else {
    const CTRMinter = await ethers.getContractFactory("CTRMinter", deployer);
    minter = await CTRMinter.deploy(ctr.address, controller.address);
    await minter.deployed();
    console.log("Deploy CTRMinter at:", minter.address);
  }

  if (config.distributor) {
    distributor = await ethers.getContractAt("ConcentratorFeeDistributor", config.distributor, deployer);
    console.log("Found ConcentratorFeeDistributor at:", distributor.address);
  } else {
    const ConcentratorFeeDistributor = await ethers.getContractFactory("ConcentratorFeeDistributor", deployer);
    // @todo change admin on mainnet deploy
    distributor = await ConcentratorFeeDistributor.deploy(
      ve.address,
      0,
      ctr.address,
      deployer.address,
      deployer.address
    );
    await distributor.deployed();
    console.log("Deploy ConcentratorFeeDistributor at:", distributor.address);
  }

  if (config.gauge) {
    gauge = await ethers.getContractAt("ConcentratorLiquidityGauge", config.gauge, deployer);
    console.log("Found ConcentratorLiquidityGauge at:", gauge.address);
  } else {
    const ConcentratorLiquidityGauge = await ethers.getContractFactory("ConcentratorLiquidityGauge", deployer);
    // @todo change admin and lp on mainnet deploy
    gauge = await ConcentratorLiquidityGauge.deploy(ADDRESS.CVX, minter.address, deployer.address);
    await gauge.deployed();
    console.log("Deploy ConcentratorLiquidityGauge at:", gauge.address);
  }

  if (config.rewarder) {
    rewarder = await ethers.getContractAt("PlatformFeeDistributor", config.rewarder, deployer);
    console.log("Found PlatformFeeDistributor at:", rewarder.address);
  } else {
    const PlatformFeeDistributor = await ethers.getContractFactory("PlatformFeeDistributor", deployer);
    rewarder = await PlatformFeeDistributor.deploy(gauge.address, V3_CTRRACTS.CommunityMultisig, distributor.address, [
      {
        token: ctr.address,
        gaugePercentage: 1e9,
        treasuryPercentage: 0,
      },
      {
        token: V3_CTRRACTS.aCRV,
        gaugePercentage: 0,
        treasuryPercentage: 1e9,
      },
    ]);
    await rewarder.deployed();
    console.log("Deploy LiquidityMiningRewarder at:", rewarder.address);
  }

  if (config.ifo) {
    ifo = await ethers.getContractAt("ConcentratorIFOVault", config.ifo, deployer);
    console.log("Found ConcentratorIFOVault at:", ifo.address);
  } else {
    const ConcentratorIFOVault = await ethers.getContractFactory("ConcentratorIFOVault", deployer);
    const impl = await ConcentratorIFOVault.deploy();
    console.log("Deploy ConcentratorIFOVault Impl at:", impl.address);

    const data = impl.interface.encodeFunctionData("initialize", [
      V3_CTRRACTS.aCRV,
      V3_CTRRACTS.AladdinZap,
      rewarder.address,
    ]);
    const TransparentUpgradeableProxy = await ethers.getContractFactory("TransparentUpgradeableProxy", deployer);
    const proxy = await TransparentUpgradeableProxy.deploy(impl.address, proxyAdmin.address, data);
    await proxy.deployed();
    ifo = await ethers.getContractAt("ConcentratorIFOVault", proxy.address, deployer);
    console.log("Deploy ConcentratorIFOVault at:", ifo.address);
  }

  await addVaults();
  {
    const tx = await ifo.updateIFOConfig(ctr.address, 1654444800, 1655049600);
    console.log("updateIFOConfig:", tx.hash);
    await tx.wait();
  }
  {
    // @todo change admin on mainnet deploy
    const tx = await ctr.set_admin(deployer.address);
    console.log("CTR set_admin:", tx.hash);
    await tx.wait();
  }
  {
    const tx = await ctr.set_minter(ifo.address);
    console.log("CTR set minter:", tx.hash);
    await tx.wait();
  }
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
