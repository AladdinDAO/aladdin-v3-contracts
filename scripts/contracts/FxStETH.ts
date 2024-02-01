import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { MaxUint256, Overrides, ZeroAddress, id } from "ethers";
import { network, ethers } from "hardhat";

import { TOKENS } from "@/utils/tokens";

import { DeploymentHelper, contractCall, ownerContractCall } from "./helpers";
import * as FxGovernance from "./FxGovernance";
import * as Multisig from "./Multisig";
import * as FxOracle from "./FxOracle";
import * as ProxyAdmin from "./ProxyAdmin";

const ReservePoolBonusRatio = ethers.parseEther("0.05"); // 5%

export interface FxStETHDeployment {
  FractionalToken: {
    implementation: string;
    proxy: string;
  };
  LeveragedToken: {
    implementation: string;
    proxy: string;
  };
  stETHTreasury: {
    implementation: string;
    proxy: string;
  };
  Market: {
    implementation: string;
    proxy: string;
  };
  RebalancePool: {
    implementation: string;
    APool: string;
    APoolRebalancer: string;
  };
  ShareableRebalancePool: {
    implementation: string;
    splitter: string;
    claimer: string;
    gauge: string;
    APool: string;
    BPool: string;
    APoolRebalancer: string;
    BPoolRebalancer: string;
  };
  wrapper: {
    wstETHWrapper: string;
    StETHAndxETHWrapper: string;
  };
  stETHGateway: string;
  FxGateway: string;
  RebalancePoolRegistry: string;
}

const LiquidatableCollateralRatio: bigint = 1305500000000000000n;

export async function deploy(deployer: HardhatEthersSigner, overrides?: Overrides): Promise<FxStETHDeployment> {
  const multisig = Multisig.deploy(network.name);
  const admin = await ProxyAdmin.deploy(deployer);
  const governance = await FxGovernance.deploy(deployer, overrides);

  const deployment = new DeploymentHelper(network.name, "Fx.stETH", deployer, overrides);

  // deploy implementation
  for (const name of ["FractionalToken", "LeveragedToken", "Market", "RebalancePool"]) {
    await deployment.contractDeploy(name + ".implementation", name + " implementation", name, []);
  }
  // deploy stETHTreasury implementation
  await deployment.contractDeploy("stETHTreasury.implementation", "stETHTreasury implementation", "stETHTreasury", [
    ethers.parseEther("0.5"),
  ]);
  // deploy ShareableRebalancePool implementation
  await deployment.contractDeploy(
    "ShareableRebalancePool.implementation",
    "ShareableRebalancePool implementation",
    "ShareableRebalancePool",
    [governance.FXN, governance.veFXN, governance.VotingEscrowHelper, governance.TokenMinter]
  );

  // deploy proxy for FractionalToken, LeveragedToken, stETHTreasury and Market
  for (const name of ["FractionalToken", "LeveragedToken", "stETHTreasury", "Market"]) {
    await deployment.proxyDeploy(
      `${name}.proxy`,
      `${name} Proxy`,
      deployment.get(`${name}.implementation`),
      admin.Fx,
      "0x"
    );
  }
  // deploy proxy for RebalancePool A
  for (const name of ["APool"]) {
    await deployment.proxyDeploy(
      `RebalancePool.${name}`,
      `RebalancePool.${name} Proxy`,
      deployment.get("RebalancePool.implementation"),
      admin.Fx,
      "0x"
    );
  }

  // deploy proxy for ShareableRebalancePool A and B
  for (const name of ["APool", "BPool"]) {
    await deployment.proxyDeploy(
      `ShareableRebalancePool.${name}`,
      `ShareableRebalancePool.${name} Proxy`,
      deployment.get("ShareableRebalancePool.implementation"),
      admin.Fx,
      "0x"
    );
  }
  // deploy RebalanceWithBonusToken for ShareableRebalancePool A and B
  for (const pool of ["APool", "BPool"]) {
    await deployment.contractDeploy(
      `ShareableRebalancePool.${pool}Rebalancer`,
      `RebalanceWithBonusToken for ShareableRebalancePool.${pool}`,
      "RebalanceWithBonusToken",
      [deployment.get(`ShareableRebalancePool.${pool}`), governance.FXN]
    );
  }
  // deploy FundraiseGauge for ShareableRebalancePool
  await deployment.minimalProxyDeploy(
    "ShareableRebalancePool.gauge",
    "ShareableRebalancePool (fETH) FundraiseGauge",
    governance.FundraiseGauge.implementation.FundraisingGaugeFx
  );
  // deploy RebalancePoolSplitter for ShareableRebalancePool
  await deployment.contractDeploy(
    "ShareableRebalancePool.splitter",
    "RebalancePoolSplitter of ShareableRebalancePool (fETH)",
    "RebalancePoolSplitter",
    []
  );
  // deploy RebalancePoolGaugeClaimer for ShareableRebalancePool
  await deployment.contractDeploy(
    "ShareableRebalancePool.claimer",
    "RebalancePoolGaugeClaimer of ShareableRebalancePool (fETH)",
    "RebalancePoolGaugeClaimer",
    [
      multisig.Fx,
      deployment.get("stETHTreasury.proxy"),
      deployment.get("ShareableRebalancePool.gauge"),
      deployment.get("ShareableRebalancePool.splitter"),
    ]
  );

  // deploy stETHGateway
  await deployment.contractDeploy("stETHGateway", "stETHGateway", "stETHGateway", [
    deployment.get("Market.proxy"),
    deployment.get("FractionalToken.proxy"),
    deployment.get("LeveragedToken.proxy"),
  ]);

  // deploy wstETHWrapper
  await deployment.contractDeploy("wrapper.wstETHWrapper", "wstETHWrapper", "wstETHWrapper", []);

  // deploy StETHAndxETHWrapper
  await deployment.contractDeploy("wrapper.StETHAndxETHWrapper", "StETHAndxETHWrapper", "StETHAndxETHWrapper", [
    deployment.get("LeveragedToken.proxy"),
    deployment.get("Market.proxy"),
    governance.PlatformFeeSpliter,
  ]);

  // deploy FxGateway
  await deployment.contractDeploy("FxGateway", "FxGateway", "FxGateway", [
    deployment.get("Market.proxy"),
    TOKENS.stETH.address,
    deployment.get("FractionalToken.proxy"),
    deployment.get("LeveragedToken.proxy"),
  ]);

  // deploy RebalancePoolRegistry
  await deployment.contractDeploy("RebalancePoolRegistry", "RebalancePoolRegistry", "RebalancePoolRegistry", []);

  return deployment.toObject() as FxStETHDeployment;
}

async function upgrade(
  deployer: HardhatEthersSigner,
  deployment: FxStETHDeployment,
  admin: string,
  overrides?: Overrides
) {
  const proxyAdmin = await ethers.getContractAt("ProxyAdmin", admin, deployer);

  // upgrade proxy for FractionalToken, LeveragedToken, stETHTreasury and Market
  for (const name of ["FractionalToken", "LeveragedToken", "stETHTreasury", "Market"]) {
    const impl = (deployment as any)[name].implementation;
    const proxy = (deployment as any)[name].proxy;
    if ((await proxyAdmin.getProxyImplementation(proxy)) !== impl) {
      await ownerContractCall(proxyAdmin, "ProxyAdmin upgrade " + name, "upgrade", [proxy, impl], overrides);
    }
  }
  // upgrade proxy for RebalancePool A
  if (
    (await proxyAdmin.getProxyImplementation(deployment.RebalancePool.APool)) !==
    deployment.RebalancePool.implementation
  ) {
    await ownerContractCall(
      proxyAdmin,
      "ProxyAdmin upgrade RebalancePool A",
      "upgrade",
      [deployment.RebalancePool.APool, deployment.RebalancePool.implementation],
      overrides
    );
  }
  // upgrade proxy for ShareableRebalancePool A
  if (
    (await proxyAdmin.getProxyImplementation(deployment.ShareableRebalancePool.APool)) !==
    deployment.ShareableRebalancePool.implementation
  ) {
    await ownerContractCall(
      proxyAdmin,
      "ProxyAdmin upgrade ShareableRebalancePool A",
      "upgrade",
      [deployment.ShareableRebalancePool.APool, deployment.ShareableRebalancePool.implementation],
      overrides
    );
  }
  // upgrade proxy for ShareableRebalancePool B
  if (
    (await proxyAdmin.getProxyImplementation(deployment.ShareableRebalancePool.BPool)) !==
    deployment.ShareableRebalancePool.implementation
  ) {
    await ownerContractCall(
      proxyAdmin,
      "ProxyAdmin upgrade ShareableRebalancePool B",
      "upgrade",
      [deployment.ShareableRebalancePool.BPool, deployment.ShareableRebalancePool.implementation],
      overrides
    );
  }
}

export async function initialize(deployer: HardhatEthersSigner, deployment: FxStETHDeployment, overrides?: Overrides) {
  const admin = await ProxyAdmin.deploy(deployer);
  const governance = await FxGovernance.deploy(deployer, overrides);
  const oracle = await FxOracle.deploy(deployer, overrides);

  await upgrade(deployer, deployment, admin.Fx, overrides);

  const treasury = await ethers.getContractAt("stETHTreasury", deployment.stETHTreasury.proxy, deployer);
  const market = await ethers.getContractAt("Market", deployment.Market.proxy, deployer);
  const reservePool = await ethers.getContractAt("ReservePoolV2", governance.ReservePool, deployer);
  const gateway = await ethers.getContractAt("FxGateway", deployment.FxGateway, deployer);
  const platformFeeSpliter = await ethers.getContractAt("PlatformFeeSpliter", governance.PlatformFeeSpliter, deployer);
  const rebalancePoolA = await ethers.getContractAt("RebalancePool", deployment.RebalancePool.APool, deployer);
  const rebalancerA = await ethers.getContractAt(
    "RebalanceWithBonusToken",
    deployment.RebalancePool.APoolRebalancer,
    deployer
  );
  const ShareableRebalancePoolA = await ethers.getContractAt(
    "ShareableRebalancePool",
    deployment.ShareableRebalancePool.APool,
    deployer
  );
  const ShareableRebalancePoolB = await ethers.getContractAt(
    "ShareableRebalancePool",
    deployment.ShareableRebalancePool.BPool,
    deployer
  );
  const boostableRebalancerA = await ethers.getContractAt(
    "RebalanceWithBonusToken",
    deployment.ShareableRebalancePool.APoolRebalancer,
    deployer
  );
  const boostableRebalancerB = await ethers.getContractAt(
    "RebalanceWithBonusToken",
    deployment.ShareableRebalancePool.BPoolRebalancer,
    deployer
  );
  const rebalancePoolRegistry = await ethers.getContractAt(
    "RebalancePoolRegistry",
    deployment.RebalancePoolRegistry,
    deployer
  );
  const rebalancePoolSplitter = await ethers.getContractAt(
    "RebalancePoolSplitter",
    deployment.ShareableRebalancePool.splitter,
    deployer
  );
  const boostableGauge = await ethers.getContractAt(
    "FundraisingGaugeFx",
    deployment.ShareableRebalancePool.gauge,
    deployer
  );
  /*
  const rebalancePoolClaimer = await ethers.getContractAt(
    "RebalancePoolGaugeClaimer",
    deployment.ShareableRebalancePool.claimer,
    deployer
  );
  */

  const controller = await ethers.getContractAt("GaugeController", governance.GaugeController, deployer);

  // Initialize RebalancePool APool
  if ((await rebalancePoolA.treasury()) === ZeroAddress) {
    await contractCall(
      rebalancePoolA,
      "RebalancePool APool initialize",
      "initialize",
      [await treasury.getAddress(), await market.getAddress()],
      overrides
    );
  }

  // Initialize ShareableRebalancePool APool
  if ((await ShareableRebalancePoolA.treasury()) === ZeroAddress) {
    await contractCall(
      ShareableRebalancePoolA,
      "ShareableRebalancePool APool initialize",
      "initialize",
      [await treasury.getAddress(), await market.getAddress(), ZeroAddress],
      overrides
    );
  }

  // Initialize ShareableRebalancePool BPool
  if ((await ShareableRebalancePoolB.treasury()) === ZeroAddress) {
    await contractCall(
      ShareableRebalancePoolB,
      "ShareableRebalancePool BPool initialize",
      "initialize",
      [await treasury.getAddress(), await market.getAddress(), ZeroAddress],
      overrides
    );
  }

  // Setup RebalancePool APool
  if ((await rebalancePoolA.wrapper()) !== deployment.wrapper.wstETHWrapper) {
    await ownerContractCall(
      rebalancePoolA,
      "RebalancePool APool updateWrapper to wstETHWrapper",
      "updateWrapper",
      [deployment.wrapper.wstETHWrapper],
      overrides
    );
  }
  if ((await rebalancePoolA.liquidator()) !== deployment.RebalancePool.APoolRebalancer) {
    await ownerContractCall(
      rebalancePoolA,
      "RebalancePool APool updateLiquidator",
      "updateLiquidator",
      [deployment.RebalancePool.APoolRebalancer],
      overrides
    );
  }
  if ((await rebalancePoolA.rewardManager(TOKENS.wstETH.address)) === ZeroAddress) {
    await ownerContractCall(
      rebalancePoolA,
      "RebalancePool.APool add wstETH as reward",
      "addReward",
      [TOKENS.wstETH.address, deployment.ShareableRebalancePool.splitter, 86400 * 7],
      overrides
    );
  }
  if ((await rebalancePoolA.rewardManager(TOKENS.wstETH.address)) !== deployment.ShareableRebalancePool.splitter) {
    await ownerContractCall(
      rebalancePoolA,
      "RebalancePool.APool updateReward for wstETH",
      "updateReward",
      [TOKENS.wstETH.address, deployment.ShareableRebalancePool.splitter, 86400 * 7],
      overrides
    );
  }

  // Setup ShareableRebalancePool.gauge
  if ((await boostableGauge.receiver()) !== deployment.ShareableRebalancePool.claimer) {
    await contractCall(
      boostableGauge,
      `FundraisingGaugeFx for ShareableRebalancePool initialize`,
      "initialize",
      [deployment.ShareableRebalancePool.claimer, MaxUint256],
      overrides
    );
  }
  await FxGovernance.addGauge(controller, "ShareableRebalancePool (fETH)", deployment.ShareableRebalancePool.gauge, 1);

  const LIQUIDATOR_ROLE = await ShareableRebalancePoolB.LIQUIDATOR_ROLE();
  // Setup ShareableRebalancePool APool
  if ((await ShareableRebalancePoolA.wrapper()) !== deployment.wrapper.wstETHWrapper) {
    await ownerContractCall(
      ShareableRebalancePoolA,
      "ShareableRebalancePool.APool updateWrapper to wstETHWrapper",
      "updateWrapper",
      [deployment.wrapper.wstETHWrapper],
      overrides
    );
  }
  if (!(await ShareableRebalancePoolA.hasRole(LIQUIDATOR_ROLE, deployment.ShareableRebalancePool.APoolRebalancer))) {
    await ownerContractCall(
      ShareableRebalancePoolA,
      "ShareableRebalancePool.APool add liquidator",
      "grantRole",
      [LIQUIDATOR_ROLE, deployment.ShareableRebalancePool.APoolRebalancer],
      overrides
    );
  }
  if ((await ShareableRebalancePoolA.distributors(TOKENS.wstETH.address)) === ZeroAddress) {
    await ownerContractCall(
      ShareableRebalancePoolA,
      "ShareableRebalancePool.APool add wstETH as reward",
      "registerRewardToken",
      [TOKENS.wstETH.address, deployment.ShareableRebalancePool.splitter],
      overrides
    );
  }
  if ((await ShareableRebalancePoolA.liquidatableCollateralRatio()) !== LiquidatableCollateralRatio) {
    await ownerContractCall(
      ShareableRebalancePoolA,
      "ShareableRebalancePool.APool update LiquidatableCollateralRatio",
      "updateLiquidatableCollateralRatio",
      [LiquidatableCollateralRatio],
      overrides
    );
  }
  if ((await ShareableRebalancePoolA.distributors(TOKENS.FXN.address)) === ZeroAddress) {
    await ownerContractCall(
      ShareableRebalancePoolA,
      "ShareableRebalancePool.APool add FXN as reward",
      "registerRewardToken",
      [TOKENS.FXN.address, deployment.ShareableRebalancePool.splitter],
      overrides
    );
  }
  // Setup ShareableRebalancePool BPool
  if ((await ShareableRebalancePoolB.wrapper()) !== deployment.wrapper.StETHAndxETHWrapper) {
    await ownerContractCall(
      ShareableRebalancePoolB,
      "ShareableRebalancePool BPool updateWrapper to StETHAndxETHWrapper",
      "updateWrapper",
      [deployment.wrapper.StETHAndxETHWrapper],
      overrides
    );
  }
  if (!(await ShareableRebalancePoolB.hasRole(LIQUIDATOR_ROLE, deployment.ShareableRebalancePool.BPoolRebalancer))) {
    await ownerContractCall(
      ShareableRebalancePoolB,
      "ShareableRebalancePool BPool add liquidator",
      "grantRole",
      [LIQUIDATOR_ROLE, deployment.ShareableRebalancePool.BPoolRebalancer],
      overrides
    );
  }
  if ((await ShareableRebalancePoolB.distributors(TOKENS.wstETH.address)) === ZeroAddress) {
    await ownerContractCall(
      ShareableRebalancePoolB,
      "ShareableRebalancePool.BPool add wstETH as reward",
      "registerRewardToken",
      [TOKENS.wstETH.address, deployment.ShareableRebalancePool.splitter],
      overrides
    );
  }
  if ((await ShareableRebalancePoolB.distributors(TOKENS.xETH.address)) === ZeroAddress) {
    await ownerContractCall(
      ShareableRebalancePoolB,
      "ShareableRebalancePool.BPool add xETH as reward",
      "registerRewardToken",
      [TOKENS.xETH.address, deployment.ShareableRebalancePool.BPool],
      overrides
    );
  }
  if ((await ShareableRebalancePoolB.liquidatableCollateralRatio()) !== LiquidatableCollateralRatio) {
    await ownerContractCall(
      ShareableRebalancePoolB,
      "ShareableRebalancePool.BPool update LiquidatableCollateralRatio",
      "updateLiquidatableCollateralRatio",
      [LiquidatableCollateralRatio],
      overrides
    );
  }
  if ((await ShareableRebalancePoolB.distributors(TOKENS.FXN.address)) === ZeroAddress) {
    await ownerContractCall(
      ShareableRebalancePoolB,
      "ShareableRebalancePool.BPool add FXN as reward",
      "registerRewardToken",
      [TOKENS.FXN.address, deployment.ShareableRebalancePool.splitter],
      overrides
    );
  }

  // Setup RebalancePoolRegistry
  const pools = await rebalancePoolRegistry.getPools();
  if (!pools.includes(await rebalancePoolA.getAddress())) {
    await ownerContractCall(
      rebalancePoolRegistry,
      "RebalancePoolRegistry register RebalancePool APool",
      "registerRebalancePool",
      [await rebalancePoolA.getAddress()],
      overrides
    );
  }
  if (!pools.includes(await ShareableRebalancePoolA.getAddress())) {
    await ownerContractCall(
      rebalancePoolRegistry,
      "RebalancePoolRegistry register ShareableRebalancePool APool",
      "registerRebalancePool",
      [await ShareableRebalancePoolA.getAddress()],
      overrides
    );
  }
  if (!pools.includes(await ShareableRebalancePoolB.getAddress())) {
    await ownerContractCall(
      rebalancePoolRegistry,
      "RebalancePoolRegistry register ShareableRebalancePool BPool",
      "registerRebalancePool",
      [await ShareableRebalancePoolB.getAddress()],
      overrides
    );
  }

  // Setup RebalancePool APoolRebalancer
  if ((await rebalancerA.bonus()) !== ethers.parseEther("2")) {
    await ownerContractCall(
      rebalancerA,
      "RebalanceWithBonusToken APool set bonus to 2 FXN",
      "updateBonus",
      [ethers.parseEther("2")],
      overrides
    );
  }
  // Setup ShareableRebalancePool APoolRebalancer
  if ((await boostableRebalancerA.bonus()) !== ethers.parseEther("1")) {
    await ownerContractCall(
      boostableRebalancerA,
      "ShareableRebalancePool.APoolRebalancer set bonus to 1 FXN",
      "updateBonus",
      [ethers.parseEther("1")],
      overrides
    );
  }
  // Setup ShareableRebalancePool BPoolRebalancer
  if ((await boostableRebalancerB.bonus()) !== ethers.parseEther("1")) {
    await ownerContractCall(
      boostableRebalancerB,
      "ShareableRebalancePool.BPoolRebalancer set bonus to 1 FXN",
      "updateBonus",
      [ethers.parseEther("1")],
      overrides
    );
  }

  // Setup ShareableRebalancePool.RebalancePoolGaugeClaimer

  // Setup wstETH for ShareableRebalancePool.RebalancePoolSplitter
  if ((await rebalancePoolSplitter.splitter(TOKENS.wstETH.address)) !== deployment.stETHTreasury.proxy) {
    await ownerContractCall(
      rebalancePoolSplitter,
      "RebalancePoolSplitter set splitter for wstETH",
      "setSplitter",
      [TOKENS.wstETH.address, deployment.stETHTreasury.proxy],
      overrides
    );
  }
  {
    const [receivers] = await rebalancePoolSplitter.getReceivers(TOKENS.wstETH.address);
    if (receivers.length === 1 && receivers[0] === deployment.RebalancePool.APool) {
      await ownerContractCall(
        rebalancePoolSplitter,
        "RebalancePoolSplitter.wstETH remove RebalancePool.APool",
        "deregisterReceiver",
        [TOKENS.wstETH.address, deployment.RebalancePool.APool, []],
        overrides
      );
      await ownerContractCall(
        rebalancePoolSplitter,
        "RebalancePoolSplitter.wstETH add ShareableRebalancePool.APool",
        "registerReceiver",
        [TOKENS.wstETH.address, deployment.ShareableRebalancePool.APool, [1e9]],
        overrides
      );
      await ownerContractCall(
        rebalancePoolSplitter,
        "RebalancePoolSplitter.wstETH add ShareableRebalancePool.BPool",
        "registerReceiver",
        [TOKENS.wstETH.address, deployment.ShareableRebalancePool.BPool, [5e8, 5e8]],
        overrides
      );
    } else {
      if (receivers.length < 1) {
        await ownerContractCall(
          rebalancePoolSplitter,
          "RebalancePoolSplitter.wstETH add ShareableRebalancePool.APool",
          "registerReceiver",
          [TOKENS.wstETH.address, deployment.ShareableRebalancePool.APool, [1e9]],
          overrides
        );
      }
      if (receivers.length < 2) {
        await ownerContractCall(
          rebalancePoolSplitter,
          "RebalancePoolSplitter.wstETH add ShareableRebalancePool.BPool",
          "registerReceiver",
          [TOKENS.wstETH.address, deployment.ShareableRebalancePool.BPool, [5e8, 5e8]],
          overrides
        );
      }
    }
  }
  // Setup FXN for ShareableRebalancePool.RebalancePoolSplitter
  if ((await rebalancePoolSplitter.splitter(TOKENS.FXN.address)) !== deployment.ShareableRebalancePool.claimer) {
    await ownerContractCall(
      rebalancePoolSplitter,
      "RebalancePoolSplitter set splitter for FXN",
      "setSplitter",
      [TOKENS.FXN.address, deployment.ShareableRebalancePool.claimer],
      overrides
    );
  }
  {
    const [receivers] = await rebalancePoolSplitter.getReceivers(TOKENS.FXN.address);
    if (receivers.length < 1) {
      await ownerContractCall(
        rebalancePoolSplitter,
        "RebalancePoolSplitter.FXN add ShareableRebalancePool.APool",
        "registerReceiver",
        [TOKENS.FXN.address, deployment.ShareableRebalancePool.APool, [1e9]],
        overrides
      );
    }
    if (receivers.length < 2) {
      await ownerContractCall(
        rebalancePoolSplitter,
        "RebalancePoolSplitter.FXN add ShareableRebalancePool.BPool",
        "registerReceiver",
        [TOKENS.FXN.address, deployment.ShareableRebalancePool.BPool, [5e8, 5e8]],
        overrides
      );
    }
  }

  // Setup ReservePool
  if ((await reservePool.bonusRatio(TOKENS.stETH.address)) !== ReservePoolBonusRatio) {
    await ownerContractCall(
      reservePool,
      "ReservePool updateBonusRatio for stETH",
      "updateBonusRatio",
      [TOKENS.stETH.address, ReservePoolBonusRatio],
      overrides
    );
  }
  if (!(await reservePool.hasRole(id("MARKET_ROLE"), deployment.Market.proxy))) {
    await ownerContractCall(
      reservePool,
      "reservePool add stETH Market",
      "grantRole",
      [id("MARKET_ROLE"), deployment.Market.proxy],
      overrides
    );
  }

  // Setup stETHTreasury
  if ((await treasury.priceOracle()) !== oracle.FxStETHTwapOracle) {
    await ownerContractCall(
      treasury,
      "stETHTreasury update price oracle",
      "updatePriceOracle",
      [oracle.FxStETHTwapOracle],
      overrides
    );
  }
  if ((await treasury.platform()) !== governance.PlatformFeeSpliter) {
    await ownerContractCall(
      treasury,
      "stETHTreasury update platform",
      "updatePlatform",
      [governance.PlatformFeeSpliter],
      overrides
    );
  }
  if ((await treasury.rebalancePool()) !== deployment.ShareableRebalancePool.splitter) {
    await ownerContractCall(
      treasury,
      "stETHTreasury updateRebalancePool to RebalancePoolSplitter",
      "updateRebalancePool",
      [deployment.ShareableRebalancePool.splitter],
      overrides
    );
  }
  if ((await treasury.emaLeverageRatio()).lastTime === 0n) {
    await contractCall(treasury, "stETHTreasury initializeV2", "initializeV2", [15 * 60], overrides);
  }

  // Setup Market
  if ((await market.reservePool()) !== governance.ReservePool) {
    await ownerContractCall(
      market,
      "Market update reserve pool",
      "updateReservePool",
      [governance.ReservePool],
      overrides
    );
  }
  if ((await market.registry()) !== deployment.RebalancePoolRegistry) {
    await ownerContractCall(
      market,
      "Market update rebalance pool registry",
      "updateRebalancePoolRegistry",
      [deployment.RebalancePoolRegistry],
      overrides
    );
  }

  // Setup FxGateway
  for (const target of ["0x99a58482bd75cbab83b27ec03ca68ff489b5788f", "0x1111111254eeb25477b68fb85ed929f73a960582"]) {
    if (!(await gateway.approvedTargets(target))) {
      await ownerContractCall(gateway, "FxGateway approve " + target, "updateTargetStatus", [target, true], overrides);
    }
  }

  // Setup PlatformFeeSpliter
  const length = await platformFeeSpliter.getRewardCount();
  let foundIndex = -1;
  for (let i = 0; i < length; i++) {
    if ((await platformFeeSpliter.rewards(i)).token === TOKENS.stETH.address) {
      foundIndex = i;
    }
  }
  if (foundIndex === -1) {
    await ownerContractCall(
      platformFeeSpliter,
      "PlatformFeeSpliter add stETH",
      "addRewardToken",
      [
        TOKENS.stETH.address,
        governance.Burner.PlatformFeeBurner,
        0n,
        ethers.parseUnits("0.25", 9),
        ethers.parseUnits("0.75", 9),
      ],
      overrides
    );
  }
  if ((await platformFeeSpliter.burners(TOKENS.stETH.address)) !== governance.Burner.PlatformFeeBurner) {
    await ownerContractCall(
      platformFeeSpliter,
      "PlatformFeeSpliter set burner for stETH",
      "updateRewardTokenBurner",
      [TOKENS.stETH.address, governance.Burner.PlatformFeeBurner],
      overrides
    );
  }
}
