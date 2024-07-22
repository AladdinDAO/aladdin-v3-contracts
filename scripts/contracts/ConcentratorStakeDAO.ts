/* eslint-disable camelcase */
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { Contract, id, Overrides, ZeroAddress } from "ethers";
import { ethers, network } from "hardhat";

import {
  AladdinSdCRV__factory,
  ConcentratorSdCrvGaugeWrapper,
  ConcentratorStakeDAOLocker,
  ConcentratorStakeDAOLocker__factory,
  ConcentratorVaultForAsdCRV,
  ConcentratorVaultForAsdCRV__factory,
  ConverterRegistry,
  PlatformFeeSpliter,
  SdCRVBribeBurnerV2,
  SdPendleBribeBurner,
  SdPendleCompounder,
  SdPendleGaugeStrategy,
  StakeDAOBribeClaimer,
  StakeDAOCRVVault__factory,
  VeSDTDelegation__factory,
} from "@/types/index";
import { ADDRESS, AVAILABLE_VAULTS, CONVERTER_ROUTRS, DEPLOYED_VAULTS, selectDeployments, TOKENS } from "@/utils/index";

import { ContractCallHelper, DeploymentHelper, contractCall, minimalProxyDeploy, ownerContractCall } from "./helpers";
import { ConcentratorGovernanceDeployment } from "./ConcentratorGovernance";
import { ProxyAdminDeployment } from "./ProxyAdmin";
import { MultisigDeployment } from "./Multisig";
import { GatewayDeployment } from "./Gateway";
import { ConverterDeployment } from "./Converter";

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
  StakeDAOBribeClaimer: string;
  SdPendleCompounder: {
    proxy: string;
    implementation: string;
  };
  SdPendleGaugeStrategy: string;
  SdPendleBribeBurner: string;
}

const KEEPER = "0x11E91BB6d1334585AA37D8F4fde3932C7960B938";
const SdCrvGauge = "0x7f50786A0b15723D741727882ee99a0BF34e3466";
const SdPendleGauge = "0x50DC9aE51f78C593d4138263da7088A973b8184E";
const PERIOD_LENGTH = 0; // distribute immediately

export async function deploy(
  deployer: HardhatEthersSigner,
  cmd: string,
  overrides?: Overrides
): Promise<ConcentratorStakeDAODeployment> {
  const admin = selectDeployments(network.name, "ProxyAdmin").toObject() as ProxyAdminDeployment;
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

  // StakeDAOBribeClaimer
  await deployment.contractDeploy("StakeDAOBribeClaimer", "StakeDAOBribeClaimer", "StakeDAOBribeClaimer", []);

  if (cmd === "StakeDAO.sdCRV") {
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
      StakeDAOCRVVault__factory.createInterface().encodeFunctionData("initialize", [SdCrvGauge, 86400])
    );
    await deployment.contractDeploy("SdCRVBribeBurner", "SdCRVBribeBurner", "SdCRVBribeBurner", [
      "0xEBdB538e339fB7523C52397087b8f2B06c1A718e",
    ]);

    // deploy ConcentratorSdCrvGaugeWrapper and SdCRVBribeBurnerV2
    await deployment.contractDeploy(
      "ConcentratorSdCrvGaugeWrapper.implementation",
      "ConcentratorSdCrvGaugeWrapper implementation",
      "ConcentratorSdCrvGaugeWrapper",
      [
        SdCrvGauge,
        deployment.get("ConcentratorStakeDAOLocker.proxy"),
        deployment.get("VeSDTDelegation.proxy"),
        deployment.get("StakeDAOBribeClaimer"),
      ]
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
  } else if (cmd === "StakeDAO.sdPENDLE") {
    // deploy SdPendleCompounder
    await deployment.contractDeploy(
      "SdPendleCompounder.implementation",
      "SdPendleCompounder implementation",
      "SdPendleCompounder",
      [PERIOD_LENGTH, deployment.get("StakeDAOBribeClaimer")]
    );
    await deployment.proxyDeploy(
      "SdPendleCompounder.proxy",
      "SdPendleCompounder proxy",
      deployment.get("SdPendleCompounder.implementation"),
      admin.Concentrator,
      "0x"
    );
    // deploy SdPendleGaugeStrategy
    await deployment.contractDeploy("SdPendleGaugeStrategy", "SdPendleGaugeStrategy", "SdPendleGaugeStrategy", [
      deployment.get("SdPendleCompounder.proxy"),
    ]);
    // deploy SdPendleBribeBurner
    await deployment.contractDeploy("SdPendleBribeBurner", "SdPendleBribeBurner", "SdPendleBribeBurner", [
      deployment.get("SdPendleCompounder.proxy"),
    ]);
  }

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
  cmd: string,
  deployment: ConcentratorStakeDAODeployment,
  overrides?: Overrides
): Promise<void> {
  const admin = selectDeployments(network.name, "ProxyAdmin").toObject() as ProxyAdminDeployment;
  const gateway = selectDeployments(network.name, "Gateway").toObject() as GatewayDeployment;
  const converter = selectDeployments(network.name, "Converter").toObject() as ConverterDeployment;
  const governance = selectDeployments(
    network.name,
    "Concentrator.Governance"
  ).toObject() as ConcentratorGovernanceDeployment;
  const multisig = selectDeployments(network.name, "Multisig").toObject() as MultisigDeployment;
  const caller = new ContractCallHelper(deployer, overrides);

  const locker = await caller.contract<ConcentratorStakeDAOLocker>(
    "ConcentratorStakeDAOLocker",
    deployment.ConcentratorStakeDAOLocker.proxy
  );
  const bribeClaimer = await caller.contract<StakeDAOBribeClaimer>(
    "StakeDAOBribeClaimer",
    deployment.StakeDAOBribeClaimer
  );
  const registry = await caller.contract<ConverterRegistry>("ConverterRegistry", converter.ConverterRegistry);
  const splitter = await caller.contract<PlatformFeeSpliter>("PlatformFeeSpliter", governance.PlatformFeeSplitter);
  const BRIBE_RECEIVER_ROLE = id("BRIBE_RECEIVER_ROLE");

  if ((await locker.claimer()) !== deployment.StakeDAOBribeClaimer) {
    await caller.ownerCall(locker, "ConcentratorStakeDAOLocker.updateClaimer", "updateClaimer", [
      await bribeClaimer.getAddress(),
    ]);
  }

  // do upgrade if possible
  for (const name of ["ConcentratorStakeDAOLocker"]) {
    await caller.upgrade(
      admin.Concentrator,
      name,
      (deployment as any)[name].proxy,
      (deployment as any)[name].implementation
    );
  }

  if (cmd === "StakeDAO.sdCRV") {
    const vault = await caller.contract<ConcentratorVaultForAsdCRV>(
      "ConcentratorVaultForAsdCRV",
      deployment.ConcentratorVault.proxy
    );
    const wrapper = await caller.contract<ConcentratorSdCrvGaugeWrapper>(
      "ConcentratorSdCrvGaugeWrapper",
      deployment.ConcentratorSdCrvGaugeWrapper.proxy
    );
    const burner = await caller.contract<SdCRVBribeBurnerV2>("SdCRVBribeBurnerV2", deployment.SdCRVBribeBurnerV2);

    // do upgrade if possible
    for (const name of ["ConcentratorSdCrvGaugeWrapper", "SdCrvCompounder"]) {
      await caller.upgrade(
        admin.Concentrator,
        name,
        (deployment as any)[name].proxy,
        (deployment as any)[name].implementation
      );
    }

    // setup ConcentratorStakeDAOLocker for SdCrvGauge
    if ((await locker.operators(SdCrvGauge)) !== deployment.ConcentratorSdCrvGaugeWrapper.proxy) {
      await ownerContractCall(
        locker,
        "ConcentratorStakeDAOLocker.updateOperator",
        "updateOperator",
        [SdCrvGauge, deployment.ConcentratorSdCrvGaugeWrapper.proxy],
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
    const gauge = await ethers.getContractAt("ICurveGauge", SdCrvGauge, deployer);
    const stash = await wrapper.stash();
    if ((await gauge.rewards_receiver(locker.getAddress())) !== stash) {
      await ownerContractCall(
        locker,
        "ConcentratorStakeDAOLocker.updateGaugeRewardReceiver",
        "updateGaugeRewardReceiver",
        [SdCrvGauge, stash],
        overrides
      );
    }

    // setup StakeDAOBribeClaimer for SdCrvGauge
    if (!(await bribeClaimer.hasRole(BRIBE_RECEIVER_ROLE, wrapper.getAddress()))) {
      await caller.ownerCall(bribeClaimer, "StakeDAOBribeClaimer grant BRIBE_RECEIVER_ROLE", "grantRole", [
        BRIBE_RECEIVER_ROLE,
        await wrapper.getAddress(),
      ]);
    }

    // setup ConcentratorSdCrvGaugeWrapper
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

    // setup vaults
    await vaultAddPool(deployer, vault, overrides);
  } else if (cmd === "StakeDAO.sdPENDLE") {
    const compounder = await caller.contract<SdPendleCompounder>(
      "SdPendleCompounder",
      deployment.SdPendleCompounder.proxy
    );
    const strategy = await caller.contract<SdPendleGaugeStrategy>(
      "SdPendleGaugeStrategy",
      deployment.SdPendleGaugeStrategy
    );
    const burner = await caller.contract<SdPendleBribeBurner>("SdPendleBribeBurner", deployment.SdPendleBribeBurner);

    // setup SdPendleCompounder
    if ((await compounder.treasury()) === ZeroAddress) {
      await caller.call(compounder, "SdPendleCompounder.initialize", "initialize", [
        "Aladdin sdPENDLE",
        "asdPENDLE",
        governance.PlatformFeeSplitter,
        gateway.ConcentratorHarvester,
        converter.GeneralTokenConverter,
        await strategy.getAddress(),
        await burner.getAddress(),
      ]);
    }
    // 10% platform
    if ((await compounder.getExpenseRatio()) !== 100000000n) {
      await caller.ownerCall(compounder, "SdPendleCompounder updateExpenseRatio", "updateExpenseRatio", [100000000n]);
    }
    // 2% harvester
    if ((await compounder.getHarvesterRatio()) !== 20000000n) {
      await caller.ownerCall(compounder, "SdPendleCompounder updateHarvesterRatio", "updateHarvesterRatio", [
        20000000n,
      ]);
    }
    // 10% booster
    if ((await compounder.getBoosterRatio()) !== 100000000n) {
      await caller.ownerCall(compounder, "SdPendleCompounder updateBoosterRatio", "updateBoosterRatio", [100000000n]);
    }

    // setup ConcentratorStakeDAOLocker for SdPendleGauge
    if ((await locker.operators(SdPendleGauge)) !== deployment.SdPendleGaugeStrategy) {
      await caller.ownerCall(locker, "ConcentratorStakeDAOLocker.updateOperator for sdPENDLE", "updateOperator", [
        SdPendleGauge,
        await strategy.getAddress(),
      ]);
    }
    const gauge = await ethers.getContractAt("ICurveGauge", SdPendleGauge, deployer);
    const stash = await strategy.stash();
    if ((await gauge.rewards_receiver(locker.getAddress())) !== stash) {
      await caller.ownerCall(
        locker,
        "ConcentratorStakeDAOLocker.updateGaugeRewardReceiver for sdPENDLE",
        "updateGaugeRewardReceiver",
        [SdPendleGauge, stash]
      );
    }

    // setup StakeDAOBribeClaimer for SdPendleGauge
    if (!(await bribeClaimer.hasRole(BRIBE_RECEIVER_ROLE, compounder.getAddress()))) {
      await caller.ownerCall(bribeClaimer, "StakeDAOBribeClaimer grant BRIBE_RECEIVER_ROLE", "grantRole", [
        BRIBE_RECEIVER_ROLE,
        await compounder.getAddress(),
      ]);
    }

    for (const [src, dst] of [["WETH", "PENDLE"]]) {
      if ((await registry.getRoutes(TOKENS[src].address, TOKENS[dst].address)).length === 0) {
        await caller.ownerCall(registry, `ConverterRegistry add ${src} => ${dst} route`, "updateRoute", [
          TOKENS[src].address,
          TOKENS[dst].address,
          CONVERTER_ROUTRS[src][dst],
        ]);
      }
    }

    if ((await splitter.burners(compounder.getAddress())) === ZeroAddress) {
      await caller.ownerCall(splitter, "PlatformFeeSplitter add asdPENDLE", "addRewardToken", [
        await compounder.getAddress(),
        governance.Burners.PlatformFeeBurner,
        0,
        500000000,
        500000000,
      ]);
    }
  }
}
