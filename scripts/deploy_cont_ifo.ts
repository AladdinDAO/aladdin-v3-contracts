/* eslint-disable node/no-missing-import */
import { constants } from "ethers";
import { ethers } from "hardhat";
import {
  VeCTRFeeDistributor,
  ConcentratorIFOVault,
  CTR,
  GaugeRewardDistributor,
  PlatformFeeDistributor,
  ProxyAdmin,
  VeCTR,
  ICurveGaugeV4V5,
} from "../typechain";
import { GaugeFactory } from "../typechain/GaugeFactory";
import { IFO_VAULTS } from "./config";
import { ADDRESS, DEPLOYED_CONTRACTS } from "./utils";

const config: {
  StartTimestamp: number;
  EndTimestamp: number;
  aCRV: string;
  BalancerVault: string;
  BalancerPoolFactory: string;
  GaugeImpl: string;
  ProxyAdmin?: string;
  CTR?: string;
  veCTR?: string;
  veCTRFeeDistributor?: string;
  GaugeFactory?: string;
  GaugeRewardDistributor?: string;
  PlatformFeeDistributor?: string;
  AladdinConvexVaultImpl?: string;
  ConcentratorIFOVault?: string;
  BalancerPoolAddress?: string;
  BalancerPoolId?: string;
  BalancerLPGauge?: string;
  TokenZapLogic?: string;
  ConcentratorGateway?: string;
  BalancerLPGaugeGateway?: string;
} = {
  StartTimestamp: 1654444800,
  EndTimestamp: 1655105421 + 86400 * 10,
  aCRV: DEPLOYED_CONTRACTS.aCRV,
  GaugeImpl: "0xdc892358d55d5ae1ec47a531130d62151eba36e5",
  BalancerVault: "0xBA12222222228d8Ba445958a75a0704d566BF2C8",
  BalancerPoolFactory: "0x8E9aa87E45e92bad84D5F8DD1bff34Fb92637dE9",
  ProxyAdmin: "0xDdf819a8c95b4788Dd1Ed31Db6E3726c229f3f8B",
  CTR: "0xBAb0eE407c0eA76d4087c6A69deddf3050d5C8DD",
  veCTR: "0x9b6f014cD3b777DD936bd34DCE4577A29D5333E9",
  veCTRFeeDistributor: "0x233afB2B064ee0C6C633fAB93Ce9aE9fF794Dd1b",
  GaugeFactory: "0x26d983F11ec58c46cb175B661b0030548ea794D6",
  BalancerLPGauge: "0x5596db1a563a77Ee944CCC069C6d858DFE3D47C8",
  GaugeRewardDistributor: "0xfc0E6AB473468826fD06cBD9081F1a5EB43beD2E",
  PlatformFeeDistributor: "0x3557bD058D674DD0981a3FF10515432159F63318",
  AladdinConvexVaultImpl: "0x12Dbfb62Ca5f0CB793714A7dEbddc293f2A06a12",
  ConcentratorIFOVault: "0x4206Cb9248B013811634dfd68e7EDcd58fb67627",
  BalancerPoolAddress: "0x68454578f7017bA0C0c5bD1091975d7a7F3001c8",
  BalancerPoolId: "0x68454578f7017ba0c0c5bd1091975d7a7f3001c800020000000000000000025b",
  TokenZapLogic: "0x39B056f1a15bA9AB69B12f09e0e0BA5645ce925e",
  ConcentratorGateway: "0x2B5C0Fc7BE8cE3A69b6FC504E0040DC0a7C44b5a",
  BalancerLPGaugeGateway: "0x8d3D57C1eBB7802174e6e179735E04b142bB6a2D",
};

let proxyAdmin: ProxyAdmin;
let ctr: CTR;
let ve: VeCTR;
let veCTRFeeDistributor: VeCTRFeeDistributor;
let gaugeFactory: GaugeFactory;
let gauge: ICurveGaugeV4V5;
let gaugeRewardDistributor: GaugeRewardDistributor;
let platformFeeDistributor: PlatformFeeDistributor;
let concentratorIFOVault: ConcentratorIFOVault;

// eslint-disable-next-line no-unused-vars
async function addVaults(from?: number, to?: number) {
  for (const { convexId, rewards, withdrawFee, harvestBounty, platformFee } of IFO_VAULTS.slice(from, to)) {
    console.log("Adding pool with pid:", convexId, "rewards:", rewards.join("/"));
    const tx = await concentratorIFOVault.addPool(convexId, rewards, withdrawFee, platformFee, harvestBounty);
    console.log("wait for tx:", tx.hash);
    await tx.wait();
    console.log("Added with tx:", tx.hash);
  }
}

async function main() {
  const [deployer] = await ethers.getSigners();

  if (config.ProxyAdmin) {
    proxyAdmin = await ethers.getContractAt("ProxyAdmin", config.ProxyAdmin, deployer);
    console.log("Found ProxyAdmin at:", proxyAdmin.address);
  } else {
    const ProxyAdmin = await ethers.getContractFactory("ProxyAdmin", deployer);
    proxyAdmin = await ProxyAdmin.deploy();
    await proxyAdmin.deployed();
    console.log("Deploy ProxyAdmin at:", proxyAdmin.address);
  }

  if (config.CTR) {
    ctr = await ethers.getContractAt("CTR", config.CTR, deployer);
    console.log("Found CTR at:", ctr.address);
  } else {
    const CTR = await ethers.getContractFactory("CTR", deployer);
    ctr = await CTR.deploy("Concentrator", "CTR", 18);
    await ctr.deployed();
    console.log("Deploy CTR at:", ctr.address);
  }

  if (config.BalancerPoolAddress === undefined) {
    const factory = await ethers.getContractAt("IBalancerWeightedPoolFactory", config.BalancerPoolFactory, deployer);

    const poolAddress = await factory.callStatic.create(
      "Balancer 2 CTR 98 aCRV",
      "B-2CTR-98aCRV",
      ctr.address.toLowerCase() < config.aCRV.toLowerCase() ? [ctr.address, config.aCRV] : [config.aCRV, ctr.address],
      ctr.address.toLowerCase() < config.aCRV.toLowerCase()
        ? [ethers.utils.parseEther("0.02"), ethers.utils.parseEther("0.98")]
        : [ethers.utils.parseEther("0.98"), ethers.utils.parseEther("0.02")],
      1e12,
      deployer.address
    );
    await factory.create(
      "Balancer 2 CTR 98 aCRV",
      "B-2CTR-98aCRV",
      ctr.address.toLowerCase() < config.aCRV.toLowerCase() ? [ctr.address, config.aCRV] : [config.aCRV, ctr.address],
      ctr.address.toLowerCase() < config.aCRV.toLowerCase()
        ? [ethers.utils.parseEther("0.02"), ethers.utils.parseEther("0.98")]
        : [ethers.utils.parseEther("0.98"), ethers.utils.parseEther("0.02")],
      1e12,
      deployer.address
    );
    const pool = await ethers.getContractAt("IBalancerPool", poolAddress, deployer);
    const poolId = await pool.getPoolId();
    console.log("address:", pool.address, "poolId:", poolId);
    config.BalancerPoolAddress = pool.address;
    config.BalancerPoolId = poolId;
  }
  const vault = await ethers.getContractAt("IBalancerVault", config.BalancerVault, deployer);
  const balance = await ctr.balanceOf(vault.address);
  if (balance.eq(constants.Zero)) {
    const aCRV = await ethers.getContractAt("AladdinCRV", config.aCRV, deployer);
    const crv = await ethers.getContractAt("IERC20", ADDRESS.CRV, deployer);
    console.log("CRV balance", await crv.balanceOf(deployer.address));
    await crv.approve(aCRV.address, constants.MaxUint256);
    await aCRV.depositWithCRV(deployer.address, ethers.utils.parseEther("2000"));
    console.log("aCRV balance:", await aCRV.balanceOf(deployer.address));

    await aCRV.approve(vault.address, constants.MaxUint256);
    await ctr.approve(vault.address, constants.MaxUint256);
    await vault.joinPool(config.BalancerPoolId!, deployer.address, deployer.address, {
      assets:
        ctr.address.toLowerCase() < DEPLOYED_CONTRACTS.aCRV.toLowerCase()
          ? [ctr.address, DEPLOYED_CONTRACTS.aCRV]
          : [DEPLOYED_CONTRACTS.aCRV, ctr.address],
      maxAmountsIn: [constants.MaxUint256, constants.MaxUint256],
      userData: ethers.utils.defaultAbiCoder.encode(
        ["uint8", "uint256[]"],
        [
          0,
          ctr.address.toLowerCase() < DEPLOYED_CONTRACTS.aCRV.toLowerCase()
            ? [ethers.utils.parseEther("200"), ethers.utils.parseEther("1000")]
            : [ethers.utils.parseEther("1000"), ethers.utils.parseEther("200")],
        ]
      ),
      fromInternalBalance: false,
    });
  }

  if (config.veCTR) {
    ve = (await ethers.getContractAt("veCTR", config.veCTR, deployer)) as VeCTR;
    console.log("Found veCTR at:", ve.address);
  } else {
    const veCTR = await ethers.getContractFactory("veCTR", deployer);
    ve = (await veCTR.deploy(ctr.address, "Vote Escrowed CTR", "veCTR", "veCTR_1.0.0")) as VeCTR;
    await ve.deployed();
    console.log("Deploy veCTR at:", ve.address);
  }

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
      deployer.address
    )) as VeCTRFeeDistributor;
    await veCTRFeeDistributor.deployed();
    console.log("Deploy ConcentratorFeeDistributor at:", veCTRFeeDistributor.address);
  }

  if (config.GaugeFactory) {
    gaugeFactory = await ethers.getContractAt("GaugeFactory", config.GaugeFactory, deployer);
    console.log("Found GaugeFactory at:", gaugeFactory.address);
  } else {
    const GaugeFactory = await ethers.getContractFactory("GaugeFactory", deployer);
    // @todo change admin and lp on mainnet deploy
    gaugeFactory = await GaugeFactory.deploy(config.GaugeImpl);
    await gaugeFactory.deployed();
    console.log("Deploy GaugeFactory at:", gaugeFactory.address);
  }

  if (config.BalancerLPGauge) {
    gauge = await ethers.getContractAt("ICurveGaugeV4V5", config.BalancerLPGauge, deployer);
    console.log("Found BalancerLPGauge at:", gauge.address);
  } else {
    const gaugeAddress = await gaugeFactory.callStatic.deploy_gauge(config.BalancerPoolAddress);
    await gaugeFactory.deploy_gauge(config.BalancerPoolAddress);
    gauge = await ethers.getContractAt("ICurveGaugeV4V5", gaugeAddress, deployer);
    console.log("Deploy BalancerLPGauge at:", gauge.address);
  }

  if (config.GaugeRewardDistributor) {
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

  if (config.PlatformFeeDistributor) {
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
      DEPLOYED_CONTRACTS.CommunityMultisig,
      veCTRFeeDistributor.address,
      [
        {
          token: ctr.address,
          gaugePercentage: 1e9,
          treasuryPercentage: 0,
        },
        {
          token: DEPLOYED_CONTRACTS.aCRV,
          gaugePercentage: 0,
          treasuryPercentage: 1e9,
        },
      ]
    );
    await platformFeeDistributor.deployed();
    console.log("Deploy PlatformFeeDistributor at:", platformFeeDistributor.address);
  }

  if (config.AladdinConvexVaultImpl) {
    const impl = await ethers.getContractAt("AladdinConvexVault", config.AladdinConvexVaultImpl, deployer);
    console.log("Found AladdinConvexVault Impl at:", impl.address);
  } else {
    const AladdinConvexVault = await ethers.getContractFactory("AladdinConvexVault", deployer);
    const impl = await AladdinConvexVault.deploy();
    console.log("Deploy AladdinConvexVault Impl at:", impl.address);
  }

  if (config.ConcentratorIFOVault) {
    concentratorIFOVault = await ethers.getContractAt("ConcentratorIFOVault", config.ConcentratorIFOVault, deployer);
    console.log("Found ConcentratorIFOVault at:", concentratorIFOVault.address);
  } else {
    const ConcentratorIFOVault = await ethers.getContractFactory("ConcentratorIFOVault", deployer);
    const impl = await ConcentratorIFOVault.deploy();
    console.log("Deploy ConcentratorIFOVault Impl at:", impl.address);

    const data = impl.interface.encodeFunctionData("initialize", [
      DEPLOYED_CONTRACTS.aCRV,
      DEPLOYED_CONTRACTS.AladdinZap,
      platformFeeDistributor.address,
    ]);
    const TransparentUpgradeableProxy = await ethers.getContractFactory("TransparentUpgradeableProxy", deployer);
    const proxy = await TransparentUpgradeableProxy.deploy(impl.address, proxyAdmin.address, data);
    await proxy.deployed();
    concentratorIFOVault = await ethers.getContractAt("ConcentratorIFOVault", proxy.address, deployer);
    console.log("Deploy ConcentratorIFOVault at:", concentratorIFOVault.address);
  }

  if (config.TokenZapLogic) {
    const logic = await ethers.getContractAt("CTRMinter", config.TokenZapLogic, deployer);
    console.log("Found TokenZapLogic at:", logic.address);
  } else {
    const TokenZapLogic = await ethers.getContractFactory("TokenZapLogic", deployer);
    const logic = await TokenZapLogic.deploy();
    await logic.deployed();
    config.TokenZapLogic = logic.address;
    console.log("Deploy TokenZapLogic at:", logic.address);
  }

  if (config.ConcentratorGateway) {
    const gateway = await ethers.getContractAt("ConcentratorGateway", config.ConcentratorGateway, deployer);
    console.log("Found ConcentratorGateway at:", gateway.address);
  } else {
    const ConcentratorGateway = await ethers.getContractFactory("ConcentratorGateway", deployer);
    const gateway = await ConcentratorGateway.deploy(config.TokenZapLogic);
    await gateway.deployed();
    config.ConcentratorGateway = gateway.address;
    console.log("Deploy ConcentratorGateway at:", gateway.address);
  }

  if (config.BalancerLPGaugeGateway) {
    const gateway = await ethers.getContractAt("BalancerLPGaugeGateway", config.BalancerLPGaugeGateway, deployer);
    console.log("Found BalancerLPGaugeGateway at:", gateway.address);
  } else {
    const BalancerLPGaugeGateway = await ethers.getContractFactory("BalancerLPGaugeGateway", deployer);
    const gateway = await BalancerLPGaugeGateway.deploy(
      ctr.address,
      gauge.address,
      config.BalancerPoolId!,
      config.TokenZapLogic!
    );
    await gateway.deployed();
    config.BalancerLPGaugeGateway = gateway.address;
    console.log("Deploy BalancerLPGaugeGateway at:", gateway.address);
  }

  await addVaults(0, 0);
  if (
    !(await concentratorIFOVault.startTime()).eq(config.StartTimestamp) ||
    !(await concentratorIFOVault.endTime()).eq(config.EndTimestamp)
  ) {
    const tx = await concentratorIFOVault.updateIFOConfig(ctr.address, 1654444800, 1655105421 + 86400 * 10);
    console.log("ConcentratorIFOVault update IFO config, hash:", tx.hash);
    await tx.wait();
  }
  if ((await platformFeeDistributor.gauge()) !== gaugeRewardDistributor.address) {
    const tx = await platformFeeDistributor.updateGauge(gaugeRewardDistributor.address);
    console.log("PlatformFeeDistributor update gauge to GaugeRewardDistributor, hash:", tx.hash);
    await tx.wait();
  }
  // @todo change admin on mainnet deploy
  if ((await ctr.admin()) !== deployer.address) {
    const tx = await ctr.set_admin(deployer.address);
    console.log(`CTR set_admin to ${deployer.address}, hash:`, tx.hash);
    await tx.wait();
  }
  if ((await ctr.minter()) === constants.AddressZero) {
    const tx = await ctr.set_minter(concentratorIFOVault.address);
    console.log("CTR set minter to ConcentratorIFOVault, hash:", tx.hash);
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
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
