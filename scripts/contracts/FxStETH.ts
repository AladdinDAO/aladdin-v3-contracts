import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { Overrides, ZeroAddress } from "ethers";
import { network, ethers } from "hardhat";

import { TOKENS } from "@/utils/tokens";

import { DeploymentHelper, contractCall, ownerContractCall } from "./helpers";
import * as FxGovernance from "./FxGovernance";
// import * as Multisig from "./Multisig";
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
  BoostableRebalancePool: {
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
  ChainlinkTwapOracle: {
    ETH: string;
    stETH: string;
  };
  FxETHTwapOracle: string;
  FxGateway: string;
  ReservePool: string;
  RebalancePoolRegistry: string;
}

const ChainlinkPriceFeed: { [name: string]: string } = {
  ETH: "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419",
  stETH: "0xCfE54B5cD566aB89272946F602D76Ea879CAb4a8",
};

export async function deploy(deployer: HardhatEthersSigner, overrides?: Overrides): Promise<FxStETHDeployment> {
  // const multisig = Multisig.deploy(network.name);
  const admin = await ProxyAdmin.deploy(deployer);
  // const governance = await FxGovernance.deploy(deployer, overrides);

  const deployment = new DeploymentHelper(network.name, "Fx.stETH", deployer, overrides);

  // deploy implementation
  for (const name of ["FractionalToken", "LeveragedToken", "Market", "RebalancePool"]) {
    await deployment.contractDeploy(name + ".implementation", name + " implementation", name, []);
  }
  // deploy stETHTreasury implementation
  await deployment.contractDeploy("stETHTreasury.implementation", "stETHTreasury implementation", "stETHTreasury", [
    ethers.parseEther("0.5"),
  ]);
  /*
  // deploy BoostableRebalancePool implementation
  await deployment.contractDeploy(
    "BoostableRebalancePool.implementation",
    "BoostableRebalancePool implementation",
    "BoostableRebalancePool",
    [governance.FXN, governance.veFXN, governance.VotingEscrowProxy, governance.TokenMinter]
  );
  */

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

  /*
  // deploy proxy for BoostableRebalancePool A and B
  for (const name of ["APool", "BPool"]) {
    await deployment.proxyDeploy(
      `BoostableRebalancePool.${name}`,
      `BoostableRebalancePool.${name} Proxy`,
      deployment.get("BoostableRebalancePool.implementation"),
      admin.Fx,
      "0x"
    );
  }
  // deploy RebalanceWithBonusToken for BoostableRebalancePool A and B
  for (const pool of ["APool", "BPool"]) {
    await deployment.contractDeploy(
      `BoostableRebalancePool.${pool}Rebalancer`,
      `RebalanceWithBonusToken for BoostableRebalancePool.${pool}`,
      "RebalanceWithBonusToken",
      [deployment.get(`BoostableRebalancePool.${pool}`), governance.FXN]
    );
  }
  // deploy FundraiseGauge for BoostableRebalancePool
  await deployment.minimalProxyDeploy(
    "BoostableRebalancePool.gauge",
    "BoostableRebalancePool (fETH) FundraiseGauge",
    governance.FundraiseGauge.implementation.FundraisingGaugeFx
  );
  */
  // deploy RebalancePoolSplitter for BoostableRebalancePool
  await deployment.contractDeploy(
    "BoostableRebalancePool.splitter",
    "RebalancePoolSplitter of BoostableRebalancePool (fETH)",
    "RebalancePoolSplitter",
    []
  );
  /*
  // deploy RebalancePoolGaugeClaimer for BoostableRebalancePool
  await deployment.contractDeploy(
    "BoostableRebalancePool.claimer",
    "RebalancePoolGaugeClaimer of BoostableRebalancePool (fETH)",
    "RebalancePoolGaugeClaimer",
    [
      multisig.Fx,
      deployment.get("stETHTreasury.proxy"),
      deployment.get("BoostableRebalancePool.gauge"),
      deployment.get("BoostableRebalancePool.splitter"),
    ]
  );
  */

  // deploy stETHGateway
  await deployment.contractDeploy("stETHGateway", "stETHGateway", "stETHGateway", [
    deployment.get("Market.proxy"),
    deployment.get("FractionalToken.proxy"),
    deployment.get("LeveragedToken.proxy"),
  ]);

  // deploy wstETHWrapper
  await deployment.contractDeploy("wrapper.wstETHWrapper", "wstETHWrapper", "wstETHWrapper", []);

  /*
  // deploy StETHAndxETHWrapper
  await deployment.contractDeploy("wrapper.StETHAndxETHWrapper", "StETHAndxETHWrapper", "StETHAndxETHWrapper", [
    deployment.get("LeveragedToken.proxy"),
    deployment.get("Market.proxy"),
    governance.PlatformFeeSpliter,
  ]);
  */

  // deploy chainlink twap oracle
  for (const symbol of ["ETH", "stETH"]) {
    await deployment.contractDeploy(
      "ChainlinkTwapOracle." + symbol,
      "ChainlinkTwapOracleV3 for " + symbol,
      "ChainlinkTwapOracleV3",
      [ChainlinkPriceFeed[symbol], 1, 10800, symbol]
    );
  }

  // deploy FxETHTwapOracle
  await deployment.contractDeploy("FxETHTwapOracle", "FxETHTwapOracle", "FxETHTwapOracle", [
    deployment.get("ChainlinkTwapOracle.stETH"),
    deployment.get("ChainlinkTwapOracle.ETH"),
    "0x21e27a5e5513d6e65c4f830167390997aa84843a", // Curve ETH/stETH pool
  ]);

  // deploy FxGateway
  await deployment.contractDeploy("FxGateway", "FxGateway", "FxGateway", [
    deployment.get("Market.proxy"),
    TOKENS.stETH.address,
    deployment.get("FractionalToken.proxy"),
    deployment.get("LeveragedToken.proxy"),
  ]);

  // deploy ReservePool
  await deployment.contractDeploy("ReservePool", "ReservePool", "ReservePool", [
    deployment.get("Market.proxy"),
    deployment.get("FractionalToken.proxy"),
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
  /*
  // upgrade proxy for BoostableRebalancePool A
  if (
    (await proxyAdmin.getProxyImplementation(deployment.BoostableRebalancePool.APool)) !==
    deployment.BoostableRebalancePool.implementation
  ) {
    await ownerContractCall(
      proxyAdmin,
      "ProxyAdmin upgrade BoostableRebalancePool A",
      "upgrade",
      [deployment.BoostableRebalancePool.APool, deployment.BoostableRebalancePool.implementation],
      overrides
    );
  }
  // upgrade proxy for BoostableRebalancePool B
  if (
    (await proxyAdmin.getProxyImplementation(deployment.BoostableRebalancePool.BPool)) !==
    deployment.BoostableRebalancePool.implementation
  ) {
    await ownerContractCall(
      proxyAdmin,
      "ProxyAdmin upgrade BoostableRebalancePool B",
      "upgrade",
      [deployment.BoostableRebalancePool.BPool, deployment.BoostableRebalancePool.implementation],
      overrides
    );
  }
  */
}

export async function initialize(deployer: HardhatEthersSigner, deployment: FxStETHDeployment, overrides?: Overrides) {
  const admin = await ProxyAdmin.deploy(deployer);
  const governance = await FxGovernance.deploy(deployer, overrides);

  await upgrade(deployer, deployment, admin.Fx, overrides);

  const treasury = await ethers.getContractAt("stETHTreasury", deployment.stETHTreasury.proxy, deployer);
  const market = await ethers.getContractAt("Market", deployment.Market.proxy, deployer);
  const reservePool = await ethers.getContractAt("ReservePool", deployment.ReservePool, deployer);
  const gateway = await ethers.getContractAt("FxGateway", deployment.FxGateway, deployer);
  const platformFeeSpliter = await ethers.getContractAt("PlatformFeeSpliter", governance.PlatformFeeSpliter, deployer);
  const rebalancePoolA = await ethers.getContractAt("RebalancePool", deployment.RebalancePool.APool, deployer);
  const rebalancerA = await ethers.getContractAt(
    "RebalanceWithBonusToken",
    deployment.RebalancePool.APoolRebalancer,
    deployer
  );
  /*
  const boostableRebalancePoolA = await ethers.getContractAt(
    "BoostableRebalancePool",
    deployment.BoostableRebalancePool.APool,
    deployer
  );
  const boostableRebalancePoolB = await ethers.getContractAt(
    "BoostableRebalancePool",
    deployment.BoostableRebalancePool.BPool,
    deployer
  );
  const boostableRebalancerA = await ethers.getContractAt(
    "RebalanceWithBonusToken",
    deployment.BoostableRebalancePool.APoolRebalancer,
    deployer
  );
  const boostableRebalancerB = await ethers.getContractAt(
    "RebalanceWithBonusToken",
    deployment.BoostableRebalancePool.BPoolRebalancer,
    deployer
  );
  */
  const rebalancePoolRegistry = await ethers.getContractAt(
    "RebalancePoolRegistry",
    deployment.RebalancePoolRegistry,
    deployer
  );
  const rebalancePoolSplitter = await ethers.getContractAt(
    "RebalancePoolSplitter",
    deployment.BoostableRebalancePool.splitter,
    deployer
  );
  /*
  const boostableGauge = await ethers.getContractAt(
    "FundraisingGaugeFx",
    deployment.BoostableRebalancePool.gauge,
    deployer
  );
  const rebalancePoolClaimer = await ethers.getContractAt(
    "RebalancePoolGaugeClaimer",
    deployment.BoostableRebalancePool.claimer,
    deployer
  );
  */

  // const controller = await ethers.getContractAt("GaugeController", governance.GaugeController, deployer);

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

  /*
  // Initialize BoostableRebalancePool APool
  if ((await boostableRebalancePoolA.treasury()) === ZeroAddress) {
    await contractCall(
      boostableRebalancePoolA,
      "BoostableRebalancePool APool initialize",
      "initialize",
      [await treasury.getAddress(), await market.getAddress(), ZeroAddress],
      overrides
    );
  }

  // Initialize BoostableRebalancePool BPool
  if ((await boostableRebalancePoolB.treasury()) === ZeroAddress) {
    await contractCall(
      boostableRebalancePoolB,
      "BoostableRebalancePool BPool initialize",
      "initialize",
      [await treasury.getAddress(), await market.getAddress(), ZeroAddress],
      overrides
    );
  }
  */

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
      [TOKENS.wstETH.address, deployment.BoostableRebalancePool.splitter, 86400 * 7],
      overrides
    );
  }
  if ((await rebalancePoolA.rewardManager(TOKENS.wstETH.address)) !== deployment.BoostableRebalancePool.splitter) {
    await ownerContractCall(
      rebalancePoolA,
      "RebalancePool.APool updateReward for wstETH",
      "updateReward",
      [TOKENS.wstETH.address, deployment.BoostableRebalancePool.splitter, 86400 * 7],
      overrides
    );
  }

  /*
  // Setup BoostableRebalancePool.gauge
  if ((await boostableGauge.receiver()) !== deployment.BoostableRebalancePool.claimer) {
    await contractCall(
      boostableGauge,
      `FundraisingGaugeFx for BoostableRebalancePool initialize`,
      "initialize",
      [deployment.BoostableRebalancePool.claimer, MaxUint256],
      overrides
    );
  }
  await FxGovernance.addGauge(controller, "BoostableRebalancePool (fETH)", deployment.BoostableRebalancePool.gauge, 3);

  const LIQUIDATOR_ROLE = await boostableRebalancePoolB.LIQUIDATOR_ROLE();
  // Setup BoostableRebalancePool APool
  if ((await boostableRebalancePoolA.wrapper()) !== deployment.wrapper.wstETHWrapper) {
    await ownerContractCall(
      boostableRebalancePoolA,
      "BoostableRebalancePool.APool updateWrapper to wstETHWrapper",
      "updateWrapper",
      [deployment.wrapper.wstETHWrapper],
      overrides
    );
  }
  if (!(await boostableRebalancePoolA.hasRole(LIQUIDATOR_ROLE, deployment.BoostableRebalancePool.APoolRebalancer))) {
    await ownerContractCall(
      boostableRebalancePoolA,
      "BoostableRebalancePool.APool add liquidator",
      "grantRole",
      [LIQUIDATOR_ROLE, deployment.BoostableRebalancePool.APoolRebalancer],
      overrides
    );
  }
  if ((await boostableRebalancePoolA.distributors(TOKENS.wstETH.address)) === ZeroAddress) {
    await ownerContractCall(
      boostableRebalancePoolA,
      "BoostableRebalancePool.APool add wstETH as reward",
      "registerRewardToken",
      [TOKENS.wstETH.address, deployment.BoostableRebalancePool.splitter],
      overrides
    );
  }
  if ((await boostableRebalancePoolA.distributors(TOKENS.FXN.address)) === ZeroAddress) {
    await ownerContractCall(
      boostableRebalancePoolA,
      "BoostableRebalancePool.APool add FXN as reward",
      "registerRewardToken",
      [TOKENS.FXN.address, deployment.BoostableRebalancePool.splitter],
      overrides
    );
  }
  // Setup BoostableRebalancePool BPool
  if ((await boostableRebalancePoolB.wrapper()) !== deployment.wrapper.StETHAndxETHWrapper) {
    await ownerContractCall(
      boostableRebalancePoolB,
      "BoostableRebalancePool BPool updateWrapper to StETHAndxETHWrapper",
      "updateWrapper",
      [deployment.wrapper.StETHAndxETHWrapper],
      overrides
    );
  }
  if (!(await boostableRebalancePoolB.hasRole(LIQUIDATOR_ROLE, deployment.BoostableRebalancePool.BPoolRebalancer))) {
    await ownerContractCall(
      boostableRebalancePoolB,
      "BoostableRebalancePool BPool add liquidator",
      "grantRole",
      [LIQUIDATOR_ROLE, deployment.BoostableRebalancePool.BPoolRebalancer],
      overrides
    );
  }
  if ((await boostableRebalancePoolB.distributors(TOKENS.wstETH.address)) === ZeroAddress) {
    await ownerContractCall(
      boostableRebalancePoolB,
      "BoostableRebalancePool.BPool add wstETH as reward",
      "registerRewardToken",
      [TOKENS.wstETH.address, deployment.BoostableRebalancePool.splitter],
      overrides
    );
  }
  if ((await boostableRebalancePoolB.distributors(TOKENS.FXN.address)) === ZeroAddress) {
    await ownerContractCall(
      boostableRebalancePoolB,
      "BoostableRebalancePool.BPool add FXN as reward",
      "registerRewardToken",
      [TOKENS.FXN.address, deployment.BoostableRebalancePool.splitter],
      overrides
    );
  }
  */

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
  /*
  if (!pools.includes(await boostableRebalancePoolA.getAddress())) {
    await ownerContractCall(
      rebalancePoolRegistry,
      "RebalancePoolRegistry register BoostableRebalancePool APool",
      "registerRebalancePool",
      [await boostableRebalancePoolA.getAddress()],
      overrides
    );
  }
  if (!pools.includes(await boostableRebalancePoolB.getAddress())) {
    await ownerContractCall(
      rebalancePoolRegistry,
      "RebalancePoolRegistry register BoostableRebalancePool BPool",
      "registerRebalancePool",
      [await boostableRebalancePoolB.getAddress()],
      overrides
    );
  }
  */

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
  /*
  // Setup BoostableRebalancePool APoolRebalancer
  if ((await boostableRebalancerA.bonus()) !== ethers.parseEther("2")) {
    await ownerContractCall(
      boostableRebalancerA,
      "BoostableRebalancePool.APoolRebalancer set bonus to 2 FXN",
      "updateBonus",
      [ethers.parseEther("2")],
      overrides
    );
  }
  // Setup BoostableRebalancePool BPoolRebalancer
  if ((await boostableRebalancerB.bonus()) !== ethers.parseEther("2")) {
    await ownerContractCall(
      boostableRebalancerB,
      "BoostableRebalancePool.BPoolRebalancer set bonus to 2 FXN",
      "updateBonus",
      [ethers.parseEther("2")],
      overrides
    );
  }
  */

  // Setup BoostableRebalancePool.RebalancePoolGaugeClaimer

  // Setup wstETH for BoostableRebalancePool.RebalancePoolSplitter
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
    if (receivers.length < 1) {
      await ownerContractCall(
        rebalancePoolSplitter,
        "RebalancePoolSplitter.wstETH add RebalancePool.APool",
        "registerReceiver",
        [TOKENS.wstETH.address, deployment.RebalancePool.APool, [1e9]],
        overrides
      );
    }
    /*
    if (receivers.length < 1) {
      await ownerContractCall(
        rebalancePoolSplitter,
        "RebalancePoolSplitter.wstETH add BoostableRebalancePool.APool",
        "registerReceiver",
        [TOKENS.wstETH.address, deployment.BoostableRebalancePool.APool, [1e9]],
        overrides
      );
    }
    if (receivers.length < 2) {
      await ownerContractCall(
        rebalancePoolSplitter,
        "RebalancePoolSplitter.wstETH add BoostableRebalancePool.BPool",
        "registerReceiver",
        [TOKENS.wstETH.address, deployment.BoostableRebalancePool.BPool, [5e8, 5e8]],
        overrides
      );
    }
    */
  }
  /*
  // Setup FXN for BoostableRebalancePool.RebalancePoolSplitter
  if ((await rebalancePoolSplitter.splitter(TOKENS.FXN.address)) !== deployment.BoostableRebalancePool.claimer) {
    await ownerContractCall(
      rebalancePoolSplitter,
      "RebalancePoolSplitter set splitter for FXN",
      "setSplitter",
      [TOKENS.FXN.address, deployment.BoostableRebalancePool.claimer],
      overrides
    );
  }
  {
    const [receivers] = await rebalancePoolSplitter.getReceivers(TOKENS.FXN.address);
    if (receivers.length < 1) {
      await ownerContractCall(
        rebalancePoolSplitter,
        "RebalancePoolSplitter.FXN add BoostableRebalancePool.APool",
        "registerReceiver",
        [TOKENS.FXN.address, deployment.BoostableRebalancePool.APool, [1e9]],
        overrides
      );
    }
    if (receivers.length < 2) {
      await ownerContractCall(
        rebalancePoolSplitter,
        "RebalancePoolSplitter.FXN add BoostableRebalancePool.BPool",
        "registerReceiver",
        [TOKENS.FXN.address, deployment.BoostableRebalancePool.BPool, [5e8, 5e8]],
        overrides
      );
    }
  }
  */

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

  // Setup stETHTreasury
  if ((await treasury.priceOracle()) !== deployment.FxETHTwapOracle) {
    await ownerContractCall(
      treasury,
      "stETHTreasury update price oracle",
      "updatePriceOracle",
      [deployment.FxETHTwapOracle],
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
  /*
  if ((await treasury.rebalancePool()) !== deployment.RebalancePoolSplitter) {
    await ownerContractCall(
      treasury,
      "stETHTreasury updateRebalancePool to RebalancePoolSplitter",
      "updateRebalancePool",
      [deployment.RebalancePoolSplitter],
      overrides
    );
  }
  if ((await treasury.emaLeverageRatio()).lastTime === 0n) {
    await contractCall(treasury, "stETHTreasury initializeV2", "initializeV2", [15 * 60], overrides);
  }
  */

  // Setup Market
  if ((await market.reservePool()) !== deployment.ReservePool) {
    await ownerContractCall(
      treasury,
      "Market update reserve pool",
      "updateReservePool",
      [deployment.ReservePool],
      overrides
    );
  }
  /*
  if ((await market.registry()) !== deployment.RebalancePoolRegistry) {
    await ownerContractCall(
      treasury,
      "Market update rebalance pool registry",
      "updateRebalancePoolRegistry",
      [deployment.RebalancePoolRegistry],
      overrides
    );
  }
  */

  // Setup FxGateway
  for (const target of ["0x99a58482bd75cbab83b27ec03ca68ff489b5788f", "0x1111111254eeb25477b68fb85ed929f73a960582"]) {
    if (!(await gateway.approvedTargets(target))) {
      await ownerContractCall(gateway, "FxGateway approve " + target, "updateTargetStatus", [target, true], overrides);
    }
  }

  // Setup PlatformFeeSpliter
  if ((await platformFeeSpliter.treasury()) !== deployment.ReservePool) {
    await ownerContractCall(
      platformFeeSpliter,
      "PlatformFeeSpliter set ReservePool as Treasury",
      "updateTreasury",
      [deployment.ReservePool],
      overrides
    );
  }
  if ((await platformFeeSpliter.staker()) !== "0x11E91BB6d1334585AA37D8F4fde3932C7960B938") {
    await ownerContractCall(
      platformFeeSpliter,
      "PlatformFeeSpliter set keeper as staker",
      "updateStaker",
      ["0x11E91BB6d1334585AA37D8F4fde3932C7960B938"],
      overrides
    );
  }

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
        governance.FeeDistributor.stETH,
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
