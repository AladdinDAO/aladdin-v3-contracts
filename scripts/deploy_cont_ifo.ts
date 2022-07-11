/* eslint-disable node/no-missing-import */
import { constants } from "ethers";
import { defaultAbiCoder } from "ethers/lib/utils";
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
import { DEPLOYED_CONTRACTS, ACRV_IFO_VAULTS, VAULT_CONFIG, ADDRESS } from "./utils";

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
  StartTimestamp: 1657670400,
  EndTimestamp: 1689120000,
  GaugeImpl: "0xdc892358d55d5ae1ec47a531130d62151eba36e5",
  BalancerPoolAddress: "0x80A8eA2f9EBFC2Db9a093BD46E01471267914E49",
  BalancerPoolId: "0x80a8ea2f9ebfc2db9a093bd46e01471267914e490002000000000000000002a2",
  ProxyAdmin: "0x1Ea204f50526429C7BcEd629EB402954Cf5eb760",
  GaugeRewardDistributor: "0xF57b53df7326e2c6bCFA81b4A128A92E69Cb87B0",
  PlatformFeeDistributor: "0xd2791781C367B2F512396105c8aB26479876e973",
  ConcentratorIFOVault: "0x3Cf54F3A1969be9916DAD548f3C084331C4450b5",
  TokenZapLogic: "0x6258B0fBC8D33d412f4C731B7D83879c3396c425",
  ConcentratorGateway: "0xD069866AceD882582b88E327E9E79Da4c88292B1",
  GaugeFactory: "0x9098E25a09EfA247EeD07ced3b46546c5A6e58ad",
  CTR: "0xb3Ad645dB386D7F6D753B2b9C3F4B853DA6890B8",
  veCTR: "0xe4C09928d834cd58D233CD77B5af3545484B4968",
  SmartWalletWhitelist: "0x3557bD058D674DD0981a3FF10515432159F63318",
  BalancerLPGauge: "0x33e411ebE366D72d058F3eF22F1D0Cf8077fDaB0",
  BalancerLPGaugeGateway: "0xb44f8Ba6CD9FfeE97F8482D064E62Ba55edD4D72",
  veCTRFeeDistributor: constants.AddressZero,
};

let ctr: CTR;
let ve: VeCTR;
// eslint-disable-next-line no-unused-vars
let veCTRFeeDistributor: VeCTRFeeDistributor;
let gaugeFactory: GaugeFactory;
let gauge: ICurveGaugeV4V5;
let gaugeRewardDistributor: GaugeRewardDistributor;
let platformFeeDistributor: PlatformFeeDistributor;
let concentratorIFOVault: ConcentratorIFOVault;
let whitelist: SmartWalletWhitelist;

// eslint-disable-next-line no-unused-vars
async function addLiquidity() {
  const [deployer] = await ethers.getSigners();
  const vault = await ethers.getContractAt("IBalancerVault", "0xBA12222222228d8Ba445958a75a0704d566BF2C8", deployer);
  const aCRV = await ethers.getContractAt("IAladdinCRV", DEPLOYED_CONTRACTS.Concentrator.aCRV, deployer);
  const crv = await ethers.getContractAt("IERC20", ADDRESS.CRV, deployer);
  console.log(await crv.balanceOf(deployer.address));
  if ((await crv.allowance(deployer.address, aCRV.address)).eq(constants.Zero)) {
    const tx = await crv.approve(aCRV.address, constants.MaxUint256);
    console.log("approve, tx:", tx.hash);
  }
  // await aCRV.depositWithCRV(deployer.address, ethers.utils.parseEther("50000"));
  if ((await aCRV.allowance(deployer.address, vault.address)).eq(constants.Zero)) {
    const tx = await aCRV.approve(vault.address, constants.MaxUint256);
    console.log("approve, tx:", tx.hash);
  }
  if ((await ctr.allowance(deployer.address, vault.address)).eq(constants.Zero)) {
    const tx = await ctr.approve(vault.address, constants.MaxUint256);
    console.log("approve, tx:", tx.hash);
  }
  console.log(
    vault.interface.encodeFunctionData("joinPool", [
      config.BalancerPoolId,
      "0xA0FB1b11ccA5871fb0225B64308e249B97804E99",
      "0xA0FB1b11ccA5871fb0225B64308e249B97804E99",
      {
        assets: [DEPLOYED_CONTRACTS.Concentrator.aCRV, ctr.address],
        maxAmountsIn: [constants.MaxUint256, constants.MaxUint256],
        userData: defaultAbiCoder.encode(
          ["uint8", "uint256[]"],
          [0, [ethers.utils.parseEther("37800"), ethers.utils.parseEther("771.4285714")]]
        ),
        fromInternalBalance: false,
      },
    ])
  );
}

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
    !(await concentratorIFOVault.endTime()).eq(config.EndTimestamp) ||
    (await concentratorIFOVault.ctr()) !== ctr.address
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
    const gaugeAddress = await gaugeFactory.callStatic.deploy_gauge(config.BalancerPoolAddress, { gasLimit: 500000 });
    await gaugeFactory.deploy_gauge(config.BalancerPoolAddress, { gasLimit: 500000 });
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
  }
  if ((await platformFeeDistributor.getRewardCount()).eq(constants.Zero)) {
    const tx = await platformFeeDistributor.addRewardToken(ctr.address, 1e9, 0);
    console.log("PlatformFeeDistributor add CTR, hash:", tx.hash);
    await tx.wait();
    console.log("✅ Done");
  }
  if ((await platformFeeDistributor.getRewardCount()).eq(constants.One)) {
    const tx = await platformFeeDistributor.addRewardToken(DEPLOYED_CONTRACTS.Concentrator.aCRV, 0, 1e9);
    console.log("PlatformFeeDistributor add aCRV, hash:", tx.hash);
    await tx.wait();
    console.log("✅ Done");
  }

  /*
  if (config.veCTRFeeDistributor) {
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
  */
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
