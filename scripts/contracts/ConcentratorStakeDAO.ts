/* eslint-disable camelcase */
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { Contract, Overrides, ZeroAddress } from "ethers";
import { ethers, network } from "hardhat";

import {
  AladdinSdCRV__factory,
  ConcentratorStakeDAOLocker__factory,
  ConcentratorVaultForAsdCRV,
  ConcentratorVaultForAsdCRV__factory,
  StakeDAOCRVVault__factory,
  VeSDTDelegation__factory,
} from "@/types/index";
import { ADDRESS, AVAILABLE_VAULTS, DEPLOYED_VAULTS, TOKENS } from "@/utils/index";

import { DeploymentHelper, contractCall, minimalProxyDeploy, ownerContractCall } from "./helpers";
import * as Multisig from "./Multisig";
import * as ProxyAdmin from "./ProxyAdmin";

const Strategy: { [name: string]: string } = {
  AutoCompoundingConvexFraxStrategy: "0x6Cc546cE582b0dD106c231181f7782C79Ef401da",
  AutoCompoundingConvexCurveStrategy: ZeroAddress,
  ManualCompoundingConvexCurveStrategy: "0xE25f0E29060AeC19a0559A2EF8366a5AF086222e",
  ManualCompoundingCurveGaugeStrategy: "0x188bd82BF11cC321F7872acdCa4B1a3Bf9a802dE",
  CLeverGaugeStrategy: ZeroAddress,
  AMOConvexCurveStrategy: "0x2be5B652836C630E15c3530bf642b544ae901239",
};

export interface ConcentratorStakeDAODeployment {
  ConcentratorStakeDAOLocker: {
    proxy: string;
    implementation: string;
  };
  VeSDTDelegation: {
    proxy: string;
    implementation: string;
  };
  StakeDAOCRVVault: {
    proxy: string;
    implementation: string;
  };
  SdCrvCompounder: {
    proxy: string;
    implementation: string;
    stash: string;
  };
  ConcentratorVault: {
    proxy: string;
    implementation: string;
  };
  ConcentratorSdCrvGaugeWrapper: {
    proxy: string;
    implementation: string;
  };
  SdCRVBribeBurner: string;
  SdCRVBribeBurnerV2: string;
}

const KEEPER = "0x11E91BB6d1334585AA37D8F4fde3932C7960B938";
const SDCRV_GAUGE = "0x7f50786A0b15723D741727882ee99a0BF34e3466";

export async function deploy(
  deployer: HardhatEthersSigner,
  overrides?: Overrides
): Promise<ConcentratorStakeDAODeployment> {
  const admin = await ProxyAdmin.deploy(deployer);
  const deployment = new DeploymentHelper(network.name, "Concentrator.StakeDAO", deployer, overrides);

  // deploy ConcentratorStakeDAOLocker
  await deployment.contractDeploy(
    "ConcentratorStakeDAOLocker.implementation",
    "ConcentratorStakeDAOLocker implementation",
    "ConcentratorStakeDAOLocker",
    []
  );
  await deployment.proxyDeploy(
    "ConcentratorStakeDAOLocker.proxy",
    "ConcentratorStakeDAOLocker proxy",
    deployment.get("ConcentratorStakeDAOLocker.implementation"),
    admin.Concentrator,
    ConcentratorStakeDAOLocker__factory.createInterface().encodeFunctionData("initialize")
  );

  // deploy VeSDTDelegation
  await deployment.contractDeploy(
    "VeSDTDelegation.implementation",
    "VeSDTDelegation implementation",
    "VeSDTDelegation",
    [deployment.get("ConcentratorStakeDAOLocker.proxy")]
  );
  await deployment.proxyDeploy(
    "VeSDTDelegation.proxy",
    "VeSDTDelegation proxy",
    deployment.get("VeSDTDelegation.implementation"),
    admin.Concentrator,
    VeSDTDelegation__factory.createInterface().encodeFunctionData("initialize", [1675728000])
  );

  // deploy StakeDAOCRVVault and SdCRVBribeBurner
  await deployment.contractDeploy(
    "StakeDAOCRVVault.implementation",
    "StakeDAOCRVVault implementation",
    "StakeDAOCRVVault",
    [deployment.get("ConcentratorStakeDAOLocker.proxy"), deployment.get("VeSDTDelegation.proxy")]
  );
  await deployment.proxyDeploy(
    "StakeDAOCRVVault.proxy",
    "StakeDAOCRVVault proxy",
    deployment.get("StakeDAOCRVVault.implementation"),
    admin.Concentrator,
    StakeDAOCRVVault__factory.createInterface().encodeFunctionData("initialize", [SDCRV_GAUGE, 86400])
  );
  await deployment.contractDeploy("SdCRVBribeBurner", "SdCRVBribeBurner", "SdCRVBribeBurner", [
    "0xEBdB538e339fB7523C52397087b8f2B06c1A718e",
  ]);

  // deploy ConcentratorSdCrvGaugeWrapper and SdCRVBribeBurnerV2
  await deployment.contractDeploy(
    "ConcentratorSdCrvGaugeWrapper.implementation",
    "ConcentratorSdCrvGaugeWrapper implementation",
    "ConcentratorSdCrvGaugeWrapper",
    [SDCRV_GAUGE, deployment.get("ConcentratorStakeDAOLocker.proxy"), deployment.get("VeSDTDelegation.proxy")]
  );
  await deployment.proxyDeploy(
    "ConcentratorSdCrvGaugeWrapper.proxy",
    "ConcentratorSdCrvGaugeWrapper proxy",
    deployment.get("ConcentratorSdCrvGaugeWrapper.implementation"),
    admin.Concentrator,
    "0x"
  );
  await deployment.contractDeploy("SdCRVBribeBurnerV2", "SdCRVBribeBurnerV2", "SdCRVBribeBurnerV2", [
    deployment.get("ConcentratorSdCrvGaugeWrapper.proxy"),
  ]);

  // deploy SdCrvCompounder and LegacyCompounderStash
  await deployment.contractDeploy(
    "SdCrvCompounder.implementation",
    "SdCrvCompounder implementation",
    "SdCrvCompounder",
    [deployment.get("StakeDAOCRVVault.proxy"), deployment.get("ConcentratorSdCrvGaugeWrapper.proxy")]
  );
  await deployment.proxyDeploy(
    "SdCrvCompounder.proxy",
    "SdCrvCompounder proxy",
    deployment.get("SdCrvCompounder.implementation"),
    admin.Concentrator,
    AladdinSdCRV__factory.createInterface().encodeFunctionData("initialize", [
      "0x1104b4DF568fa7Af90B1Bed1D78A2F71e748dc8a",
    ])
  );
  await deployment.contractDeploy(
    "SdCrvCompounder.stash",
    "LegacyCompounderStash for SdCrvCompounder",
    "LegacyCompounderStash",
    [deployment.get("SdCrvCompounder.proxy")]
  );

  // deploy ConcentratorVault
  await deployment.contractDeploy(
    "ConcentratorVault.implementation",
    "ConcentratorVault implementation",
    "ConcentratorVaultForAsdCRV",
    []
  );
  await deployment.proxyDeploy(
    "ConcentratorVault.proxy",
    "ConcentratorVault proxy",
    deployment.get("ConcentratorVault.implementation"),
    admin.Concentrator,
    ConcentratorVaultForAsdCRV__factory.createInterface().encodeFunctionData("initialize", [
      deployment.get("SdCrvCompounder.proxy"),
      "0x1104b4DF568fa7Af90B1Bed1D78A2F71e748dc8a",
      "0x32366846354DB5C08e92b4Ab0D2a510b2a2380C8",
    ])
  );

  return deployment.toObject() as ConcentratorStakeDAODeployment;
}

async function vaultAddPool(
  deployer: HardhatEthersSigner,
  vault: ConcentratorVaultForAsdCRV,
  overrides?: Overrides
): Promise<void> {
  const pools = DEPLOYED_VAULTS.asdCRV;

  const startIndex = Number(await vault.poolLength());
  for (let pid = startIndex; pid < pools.length; ++pid) {
    const pool = pools[pid];
    const vaultConfig = AVAILABLE_VAULTS[pool.name];
    const strategyName = `ManualCompounding${pool.strategy}Strategy`;

    // deploy strategy
    let strategy: Contract;
    {
      const address = await minimalProxyDeploy(deployer, strategyName, Strategy[strategyName], overrides);
      strategy = await ethers.getContractAt(strategyName, address, deployer);
    }
    const underlying = ADDRESS[`${vaultConfig.token}_TOKEN`];
    if (strategyName === "ManualCompoundingConvexCurveStrategy") {
      await contractCall(
        strategy,
        `Initialize ${strategyName} for pool[${pool.name}]`,
        "initialize",
        [await vault.getAddress(), underlying, vaultConfig.rewarder!, vaultConfig.rewards],
        overrides
      );
    } else if (strategyName === "ManualCompoundingCurveGaugeStrategy") {
      await contractCall(
        strategy,
        `Initialize ${strategyName} for pool[${pool.name}]`,
        "initialize",
        [await vault.getAddress(), underlying, vaultConfig.gauge!, vaultConfig.rewards],
        overrides
      );
    } else {
      throw new Error(`strategy ${strategyName} not supported`);
    }

    await ownerContractCall(
      vault as unknown as Contract,
      `Add pool[${pool.name}] with pid[${pid}]`,
      "addPool",
      [underlying, await strategy.getAddress(), pool.fees.withdraw, pool.fees.platform, pool.fees.harvest],
      overrides
    );
  }
}

export async function initialize(
  deployer: HardhatEthersSigner,
  deployment: ConcentratorStakeDAODeployment,
  overrides?: Overrides
): Promise<void> {
  const multisig = Multisig.deploy(network.name);
  const admin = await ProxyAdmin.deploy(deployer);

  const proxyAdmin = await ethers.getContractAt("ProxyAdmin", admin.Concentrator, deployer);
  const vault = await ethers.getContractAt("ConcentratorVaultForAsdCRV", deployment.ConcentratorVault.proxy, deployer);
  const wrapper = await ethers.getContractAt(
    "ConcentratorSdCrvGaugeWrapper",
    deployment.ConcentratorSdCrvGaugeWrapper.proxy,
    deployer
  );
  const burner = await ethers.getContractAt("SdCRVBribeBurnerV2", deployment.SdCRVBribeBurnerV2, deployer);
  const locker = await ethers.getContractAt(
    "ConcentratorStakeDAOLocker",
    deployment.ConcentratorStakeDAOLocker.proxy,
    deployer
  );
  const compounder = await ethers.getContractAt("SdCrvCompounder", deployment.SdCrvCompounder.proxy, deployer);

  // upgrade
  for (const name of ["ConcentratorStakeDAOLocker"]) {
    const impl = (deployment as any)[name].implementation;
    const proxy = (deployment as any)[name].proxy;
    if ((await proxyAdmin.getProxyImplementation(proxy)) !== impl) {
      await ownerContractCall(proxyAdmin, "ProxyAdmin upgrade " + name, "upgrade", [proxy, impl], overrides);
    }
  }

  // setup ConcentratorStakeDAOLocker
  if ((await locker.operators(SDCRV_GAUGE)) !== deployment.ConcentratorSdCrvGaugeWrapper.proxy) {
    await ownerContractCall(
      locker,
      "ConcentratorStakeDAOLocker.updateOperator",
      "updateOperator",
      [SDCRV_GAUGE, deployment.ConcentratorSdCrvGaugeWrapper.proxy],
      overrides
    );
  }
  if ((await wrapper.treasury()) === ZeroAddress) {
    await contractCall(
      wrapper,
      "ConcentratorSdCrvGaugeWrapper initialize",
      "initialize",
      [multisig.Concentrator, deployment.SdCRVBribeBurnerV2],
      overrides
    );
  }
  const gauge = await ethers.getContractAt("ICurveGauge", SDCRV_GAUGE, deployer);
  const stash = await wrapper.stash();
  if ((await gauge.rewards_receiver(locker.getAddress())) !== stash) {
    await ownerContractCall(
      locker,
      "ConcentratorStakeDAOLocker.updateGaugeRewardReceiver",
      "updateGaugeRewardReceiver",
      [SDCRV_GAUGE, stash],
      overrides
    );
  }
  if ((await locker.claimer()) !== deployment.ConcentratorSdCrvGaugeWrapper.proxy) {
    await ownerContractCall(
      locker,
      "ConcentratorStakeDAOLocker.updateClaimer",
      "updateClaimer",
      [deployment.ConcentratorSdCrvGaugeWrapper.proxy],
      overrides
    );
  }

  // setup ConcentratorSdCrvGaugeWrapper
  const REWARD_MANAGER_ROLE = await wrapper.REWARD_MANAGER_ROLE();
  if (!(await wrapper.hasRole(REWARD_MANAGER_ROLE, deployer.address))) {
    await ownerContractCall(
      wrapper,
      "ConcentratorSdCrvGaugeWrapper grant REWARD_MANAGER_ROLE",
      "grantRole",
      [REWARD_MANAGER_ROLE, deployer.address],
      overrides
    );
  }
  if ((await wrapper.distributors(TOKENS.sdCRV.address)) !== deployment.SdCRVBribeBurnerV2) {
    await ownerContractCall(
      wrapper,
      "ConcentratorSdCrvGaugeWrapper add sdCRV distributor",
      "updateRewardDistributor",
      [TOKENS.sdCRV.address, deployment.SdCRVBribeBurnerV2],
      overrides
    );
  }
  if ((await wrapper.distributors(TOKENS.CRV.address)) !== deployment.SdCRVBribeBurnerV2) {
    await ownerContractCall(
      wrapper,
      "ConcentratorSdCrvGaugeWrapper add CRV distributor",
      "updateRewardDistributor",
      [TOKENS.CRV.address, deployment.SdCRVBribeBurnerV2],
      overrides
    );
  }
  // 5% platform
  if ((await wrapper.getExpenseRatio()) !== 50000000n) {
    await ownerContractCall(
      wrapper,
      "ConcentratorSdCrvGaugeWrapper updateExpenseRatio",
      "updateExpenseRatio",
      [50000000n],
      overrides
    );
  }
  // 2% harvester
  if ((await wrapper.getHarvesterRatio()) !== 20000000n) {
    await ownerContractCall(
      wrapper,
      "ConcentratorSdCrvGaugeWrapper updateHarvesterRatio",
      "updateHarvesterRatio",
      [20000000n],
      overrides
    );
  }
  // 10% booster
  if ((await wrapper.getBoosterRatio()) !== 100000000n) {
    await ownerContractCall(
      wrapper,
      "ConcentratorSdCrvGaugeWrapper updateBoosterRatio",
      "updateBoosterRatio",
      [100000000n],
      overrides
    );
  }

  // setup SdCRVBribeBurnerV2
  const WHITELIST_BURNER_ROLE = await burner.WHITELIST_BURNER_ROLE();
  if (!(await burner.hasRole(WHITELIST_BURNER_ROLE, KEEPER))) {
    await ownerContractCall(
      burner,
      "SdCRVBribeBurnerV2 grant WHITELIST_BURNER_ROLE",
      "grantRole",
      [WHITELIST_BURNER_ROLE, KEEPER],
      overrides
    );
  }

  // upgrade and setup SdCrvCompounder
  if (
    (await proxyAdmin.getProxyImplementation(deployment.SdCrvCompounder.proxy)) !==
    deployment.SdCrvCompounder.implementation
  ) {
    await ownerContractCall(
      proxyAdmin,
      "ProxyAdmin upgrade SdCrvCompounder",
      "upgradeAndCall",
      [
        deployment.SdCrvCompounder.proxy,
        deployment.SdCrvCompounder.implementation,
        compounder.interface.encodeFunctionData("initializeV2", [deployment.SdCrvCompounder.stash]),
      ],
      overrides
    );
  }

  // setup vaults
  await vaultAddPool(deployer, vault, overrides);
}
