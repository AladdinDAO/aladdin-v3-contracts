/* eslint-disable node/no-missing-import */
import { constants } from "ethers";
import { ethers } from "hardhat";
import {
  VeCTRFeeDistributor,
  ConcentratorIFOVault,
  CTR,
  GaugeRewardDistributor,
  PlatformFeeDistributor,
  VeCTR,
  ICurveGaugeV4V5,
  SmartWalletWhitelist,
} from "../typechain";
import { GaugeFactory } from "../typechain/GaugeFactory";
import { DEPLOYED_CONTRACTS, ACRV_IFO_VAULTS, VAULT_CONFIG } from "./utils";

const config: {
  StartTimestamp: number;
  EndTimestamp: number;
  GaugeImpl: string;
  BalancerPoolAddress: string;
  BalancerPoolId: string;
  ProxyAdmin: string;
  GaugeRewardDistributor: string;
  PlatformFeeDistributor: string;
  ConcentratorIFOVault: string;
  TokenZapLogic: string;
  ConcentratorGateway: string;
  GaugeFactory: string;
  CTR: string;
  veCTR: string;
  SmartWalletWhitelist: string;
  BalancerLPGauge: string;
  BalancerLPGaugeGateway: string;
  veCTRFeeDistributor?: string;
} = {
  StartTimestamp: 1657584000,
  EndTimestamp: 1689120000,
  GaugeImpl: "0xdc892358d55d5ae1ec47a531130d62151eba36e5",
  BalancerPoolAddress: "0xf017335728C91b57b335D778f31358953f6eB748",
  BalancerPoolId: "0xf017335728c91b57b335d778f31358953f6eb74800020000000000000000029f",
  ProxyAdmin: "0x1Ea204f50526429C7BcEd629EB402954Cf5eb760",
  GaugeRewardDistributor: "0xF57b53df7326e2c6bCFA81b4A128A92E69Cb87B0",
  PlatformFeeDistributor: "0xd2791781C367B2F512396105c8aB26479876e973",
  ConcentratorIFOVault: "0x3Cf54F3A1969be9916DAD548f3C084331C4450b5",
  TokenZapLogic: "0x6258B0fBC8D33d412f4C731B7D83879c3396c425",
  ConcentratorGateway: "0xD069866AceD882582b88E327E9E79Da4c88292B1",
  GaugeFactory: "0x9098E25a09EfA247EeD07ced3b46546c5A6e58ad",
  CTR: "0xE73B8a36093850Fc2d7029d678CEe8ec482a79B3",
  veCTR: "0xC4763c35569f7ce0cE42B30EDebFc5bC80EB96b4",
  SmartWalletWhitelist: "0x3557bD058D674DD0981a3FF10515432159F63318",
  BalancerLPGauge: "0xBFC61CB66Bb1e3eC7Ba5B2Bb6e9117C6fF46AA11",
  BalancerLPGaugeGateway: "0xcfE4AD4B0960a3AAB7Dd4dD2cCAA0A721A76012f",
  veCTRFeeDistributor: constants.AddressZero,
};

let ctr: CTR;
let ve: VeCTR;
let veCTRFeeDistributor: VeCTRFeeDistributor;
let gaugeFactory: GaugeFactory;
let gauge: ICurveGaugeV4V5;
let gaugeRewardDistributor: GaugeRewardDistributor;
let platformFeeDistributor: PlatformFeeDistributor;
let concentratorIFOVault: ConcentratorIFOVault;
let whitelist: SmartWalletWhitelist;

// eslint-disable-next-line no-unused-vars
async function addVaults(from?: number, to?: number) {
  for (const { name, fees } of ACRV_IFO_VAULTS.slice(from, to)) {
    const rewards = VAULT_CONFIG[name].rewards;
    const convexId = VAULT_CONFIG[name].convexId;
    console.log(`Adding pool[${name}] with convexId[${convexId}], rewards[${rewards.join("/")}]`);
    const tx = await concentratorIFOVault.addPool(convexId, rewards, fees.withdraw, fees.platform, fees.harvest);
    console.log("wait for tx:", tx.hash);
    await tx.wait();
    console.log("Added with tx:", tx.hash);
  }
}

async function main() {
  const [deployer] = await ethers.getSigners();

  if (config.GaugeRewardDistributor !== "") {
    gaugeRewardDistributor = await ethers.getContractAt(
      "GaugeRewardDistributor",
      config.GaugeRewardDistributor,
      deployer
    );
    console.log("Found GaugeRewardDistributor at:", gaugeRewardDistributor.address);
  } else {
    const GaugeRewardDistributor = await ethers.getContractFactory("GaugeRewardDistributor", deployer);
    gaugeRewardDistributor = await GaugeRewardDistributor.deploy();
    await gaugeRewardDistributor.deployed();
    console.log("Deploy GaugeRewardDistributor at:", gaugeRewardDistributor.address);
  }

  if (config.PlatformFeeDistributor !== "") {
    platformFeeDistributor = await ethers.getContractAt(
      "PlatformFeeDistributor",
      config.PlatformFeeDistributor,
      deployer
    );
    console.log("Found PlatformFeeDistributor at:", platformFeeDistributor.address);
  } else {
    const PlatformFeeDistributor = await ethers.getContractFactory("PlatformFeeDistributor", deployer);
    platformFeeDistributor = await PlatformFeeDistributor.deploy(
      gaugeRewardDistributor.address,
      DEPLOYED_CONTRACTS.Concentrator.Treasury,
      DEPLOYED_CONTRACTS.Concentrator.Treasury, // should change after launch
      []
    );
    await platformFeeDistributor.deployed();
    console.log("Deploy PlatformFeeDistributor at:", platformFeeDistributor.address);
  }

  if (config.ConcentratorIFOVault !== "") {
    concentratorIFOVault = await ethers.getContractAt("ConcentratorIFOVault", config.ConcentratorIFOVault, deployer);
    console.log("Found ConcentratorIFOVault at:", concentratorIFOVault.address);
  } else {
    // const ConcentratorIFOVault = await ethers.getContractFactory("ConcentratorIFOVault", deployer);
    // const impl = await ConcentratorIFOVault.deploy();
    // console.log("Deploy ConcentratorIFOVault Impl at:", impl.address);
    const impl = await ethers.getContractAt(
      "ConcentratorIFOVault",
      "0x99373AE646ed89b9A466c4256b09b10dbCC07B40",
      deployer
    );

    const data = impl.interface.encodeFunctionData("initialize", [
      DEPLOYED_CONTRACTS.Concentrator.aCRV,
      DEPLOYED_CONTRACTS.AladdinZap,
      platformFeeDistributor.address,
    ]);
    const TransparentUpgradeableProxy = await ethers.getContractFactory("TransparentUpgradeableProxy", deployer);
    const proxy = await TransparentUpgradeableProxy.deploy(impl.address, config.ProxyAdmin, data);
    await proxy.deployed();
    concentratorIFOVault = await ethers.getContractAt("ConcentratorIFOVault", proxy.address, deployer);
    console.log("Deploy ConcentratorIFOVault at:", concentratorIFOVault.address);
  }

  if (config.TokenZapLogic !== "") {
    const logic = await ethers.getContractAt("CTRMinter", config.TokenZapLogic, deployer);
    console.log("Found TokenZapLogic at:", logic.address);
  } else {
    const TokenZapLogic = await ethers.getContractFactory("TokenZapLogic", deployer);
    const logic = await TokenZapLogic.deploy();
    await logic.deployed();
    config.TokenZapLogic = logic.address;
    console.log("Deploy TokenZapLogic at:", logic.address);
  }

  if (config.ConcentratorGateway !== "") {
    const gateway = await ethers.getContractAt("ConcentratorGateway", config.ConcentratorGateway, deployer);
    console.log("Found ConcentratorGateway at:", gateway.address);
  } else {
    const ConcentratorGateway = await ethers.getContractFactory("ConcentratorGateway", deployer);
    const gateway = await ConcentratorGateway.deploy(config.TokenZapLogic);
    await gateway.deployed();
    config.ConcentratorGateway = gateway.address;
    console.log("Deploy ConcentratorGateway at:", gateway.address);
  }

  if (config.GaugeFactory !== "") {
    gaugeFactory = await ethers.getContractAt("GaugeFactory", config.GaugeFactory, deployer);
    console.log("Found GaugeFactory at:", gaugeFactory.address);
  } else {
    const GaugeFactory = await ethers.getContractFactory("GaugeFactory", deployer);
    gaugeFactory = await GaugeFactory.deploy(config.GaugeImpl);
    await gaugeFactory.deployed();
    console.log("Deploy GaugeFactory at:", gaugeFactory.address);
  }

  if (config.CTR !== "") {
    ctr = await ethers.getContractAt("CTR", config.CTR, deployer);
    console.log("Found CTR at:", ctr.address);
  } else {
    const CTR = await ethers.getContractFactory("CTR", deployer);
    ctr = await CTR.deploy("Concentrator Token", "CTR", 18);
    await ctr.deployed();
    console.log("Deploy CTR at:", ctr.address);
  }

  if ((await ctr.minter()) === constants.AddressZero) {
    const tx = await ctr.set_minter(concentratorIFOVault.address);
    console.log("CTR set minter to ConcentratorIFOVault, hash:", tx.hash);
    await tx.wait();
  }

  if ((await ctr.admin()) !== DEPLOYED_CONTRACTS.Concentrator.Treasury) {
    const tx = await ctr.set_admin(DEPLOYED_CONTRACTS.Concentrator.Treasury);
    console.log(`CTR set_admin to ${DEPLOYED_CONTRACTS.Concentrator.Treasury}, hash:`, tx.hash);
    await tx.wait();
  }

  if (
    !(await concentratorIFOVault.startTime()).eq(config.StartTimestamp) ||
    !(await concentratorIFOVault.endTime()).eq(config.EndTimestamp)
  ) {
    const tx = await concentratorIFOVault.updateIFOConfig(ctr.address, config.StartTimestamp, config.EndTimestamp);
    console.log("ConcentratorIFOVault update IFO config, hash:", tx.hash);
    await tx.wait();
  }

  if (config.veCTR !== "") {
    ve = (await ethers.getContractAt("veCTR", config.veCTR, deployer)) as VeCTR;
    console.log("Found veCTR at:", ve.address);
  } else {
    const veCTR = await ethers.getContractFactory("veCTR", deployer);
    ve = (await veCTR.deploy(ctr.address, "Vote Escrowed CTR", "veCTR", "veCTR_1.0.0")) as VeCTR;
    await ve.deployed();
    console.log("Deploy veCTR at:", ve.address);
  }

  if (
    (await ve.admin()) !== DEPLOYED_CONTRACTS.Concentrator.Treasury &&
    (await ve.future_admin()) !== DEPLOYED_CONTRACTS.Concentrator.Treasury
  ) {
    const tx = await ve.commit_transfer_ownership(DEPLOYED_CONTRACTS.Concentrator.Treasury);
    console.log(`veCTR set future admin to ${DEPLOYED_CONTRACTS.Concentrator.Treasury}, hash:`, tx.hash);
    await tx.wait();
  }

  if (config.SmartWalletWhitelist !== "") {
    whitelist = await ethers.getContractAt("SmartWalletWhitelist", config.SmartWalletWhitelist, deployer);
    console.log("Found SmartWalletWhitelist at:", whitelist.address);
  } else {
    const SmartWalletWhitelist = await ethers.getContractFactory("SmartWalletWhitelist", deployer);
    whitelist = await SmartWalletWhitelist.deploy();
    await whitelist.deployed();
    console.log("Deploy SmartWalletWhitelist at:", whitelist.address);
  }

  if (
    (await ve.smart_wallet_checker()) !== whitelist.address &&
    (await ve.future_smart_wallet_checker()) !== whitelist.address
  ) {
    const tx = await ve.commit_smart_wallet_checker(whitelist.address);
    console.log(`veCTR set future smart wallet checker to ${whitelist.address}, hash:`, tx.hash);
    await tx.wait();
  }

  if (
    (await ve.smart_wallet_checker()) !== whitelist.address &&
    (await ve.future_smart_wallet_checker()) === whitelist.address
  ) {
    const tx = await ve.apply_smart_wallet_checker();
    console.log(`veCTR apply smart wallet checker to ${whitelist.address}, hash:`, tx.hash);
    await tx.wait();
  }

  if (config.BalancerLPGauge !== "") {
    gauge = await ethers.getContractAt("ICurveGaugeV4V5", config.BalancerLPGauge, deployer);
    console.log("Found BalancerLPGauge at:", gauge.address);
  } else {
    const gaugeAddress = await gaugeFactory.callStatic.deploy_gauge(config.BalancerPoolAddress);
    await gaugeFactory.deploy_gauge(config.BalancerPoolAddress);
    gauge = await ethers.getContractAt("ICurveGaugeV4V5", gaugeAddress, deployer);
    console.log("Deploy BalancerLPGauge at:", gauge.address);
  }

  if (config.BalancerLPGaugeGateway !== "") {
    const gateway = await ethers.getContractAt("BalancerLPGaugeGateway", config.BalancerLPGaugeGateway, deployer);
    console.log("Found BalancerLPGaugeGateway at:", gateway.address);
  } else {
    const BalancerLPGaugeGateway = await ethers.getContractFactory("BalancerLPGaugeGateway", deployer);
    const gateway = await BalancerLPGaugeGateway.deploy(
      ctr.address,
      gauge.address,
      config.BalancerPoolId,
      config.TokenZapLogic
    );
    await gateway.deployed();
    config.BalancerLPGaugeGateway = gateway.address;
    console.log("Deploy BalancerLPGaugeGateway at:", gateway.address);
  }

  /*if (config.veCTRFeeDistributor) {
    veCTRFeeDistributor = (await ethers.getContractAt(
      "veCTRFeeDistributor",
      config.veCTRFeeDistributor,
      deployer
    )) as VeCTRFeeDistributor;
    console.log("Found veFeeDistributor at:", veCTRFeeDistributor.address);
  } else {
    const VeCTRFeeDistributor = await ethers.getContractFactory("veCTRFeeDistributor", deployer);
    // @todo change admin on mainnet deploy
    veCTRFeeDistributor = (await VeCTRFeeDistributor.deploy(
      ve.address,
      0,
      ctr.address,
      deployer.address,
      DEPLOYED_CONTRACTS.Concentrator.Treasury
    )) as VeCTRFeeDistributor;
    await veCTRFeeDistributor.deployed();
    console.log("Deploy ConcentratorFeeDistributor at:", veCTRFeeDistributor.address);
  }

  await addVaults(0, 0);
  if ((await platformFeeDistributor.gauge()) !== gaugeRewardDistributor.address) {
    const tx = await platformFeeDistributor.updateGauge(gaugeRewardDistributor.address);
    console.log("PlatformFeeDistributor update gauge to GaugeRewardDistributor, hash:", tx.hash);
    await tx.wait();
  }
  if ((await gaugeRewardDistributor.distributor()) === constants.AddressZero) {
    const tx = await gaugeRewardDistributor.updateDistributor(platformFeeDistributor.address);
    console.log("GaugeRewardDistributor set distributor to PlatformFeeDistributor, hash:", tx.hash);
    await tx.wait();
  }
  if ((await gaugeRewardDistributor.getGaugeInfo(gauge.address)).gaugeType === 0) {
    const tx = await gaugeRewardDistributor.updateGaugeTypes([gauge.address], [2]);
    console.log("GaugeRewardDistributor update gauge type, hash:", tx.hash);
    await tx.wait();
  }
  if ((await gaugeRewardDistributor.getGaugeInfo(gauge.address)).tokens.length === 0) {
    const tx = await gaugeRewardDistributor.addRewardToken(ctr.address, [gauge.address], [1e9]);
    console.log("GaugeRewardDistributor add reward token, hash:", tx.hash);
    await tx.wait();
  }
  if ((await gauge.reward_data(ctr.address)).distributor === constants.AddressZero) {
    const tx = await gauge.add_reward(ctr.address, gaugeRewardDistributor.address);
    console.log("Gauge add reward token, hash:", tx.hash);
    await tx.wait();
  }*/
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
