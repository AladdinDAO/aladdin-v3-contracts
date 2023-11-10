import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { Overrides, ZeroAddress } from "ethers";
import { network, ethers } from "hardhat";

import { selectDeployments } from "@/utils/deploys";
import { TOKENS } from "@/utils/tokens";

import { contractCall, contractDeploy, ownerContractCall } from "./helpers";
import * as ProxyAdmin from "./ProxyAdmin";
import * as FxGovernance from "./FxGovernance";

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
    BPool: string;
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
  RebalanceWithBonusToken: { APool: string; BPool: string };
  RebalancePoolRegistry: string;
  RebalancePoolSplitter: string;
}

const ChainlinkPriceFeed: { [name: string]: string } = {
  ETH: "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419",
  stETH: "0xCfE54B5cD566aB89272946F602D76Ea879CAb4a8",
};

export async function deploy(deployer: HardhatEthersSigner, overrides?: Overrides): Promise<FxStETHDeployment> {
  const admin = await ProxyAdmin.deploy(deployer);
  const governance = await FxGovernance.deploy(deployer, overrides);

  console.log("");
  const deployment = selectDeployments(network.name, "Fx.stETH");

  // deploy implementation
  for (const name of ["FractionalToken", "LeveragedToken", "Market", "RebalancePool"]) {
    if (!deployment.get(name + ".implementation")) {
      const address = await contractDeploy(deployer, name + " implementation", name, [], overrides);
      deployment.set(name + ".implementation", address);
    } else {
      console.log(`Found ${name} implementation at:`, deployment.get(name + ".implementation"));
    }
  }
  if (!deployment.get("stETHTreasury.implementation")) {
    const address = await contractDeploy(
      deployer,
      "stETHTreasury implementation",
      "stETHTreasury",
      [ethers.parseEther("0.5")],
      overrides
    );
    deployment.set("stETHTreasury.implementation", address);
  } else {
    console.log(`Found stETHTreasury implementation at:`, deployment.get("stETHTreasury.implementation"));
  }

  // deploy proxy for FractionalToken, LeveragedToken, stETHTreasury and Market
  for (const name of ["FractionalToken", "LeveragedToken", "stETHTreasury", "Market"]) {
    if (!deployment.get(`${name}.proxy`)) {
      const address = await contractDeploy(
        deployer,
        `${name} Proxy`,
        "TransparentUpgradeableProxy",
        [deployment.get(`${name}.implementation`), admin.Fx, "0x"],
        overrides
      );
      deployment.set(`${name}.proxy`, address);
    } else {
      console.log(`Found ${name} Proxy at:`, deployment.get(`${name}.proxy`));
    }
  }
  // deploy proxy for RebalancePool A and B
  for (const name of ["APool", "BPool"]) {
    const selector = `RebalancePool.${name}`;
    if (!deployment.get(selector)) {
      const address = await contractDeploy(
        deployer,
        `${selector} Proxy`,
        "TransparentUpgradeableProxy",
        [deployment.get("RebalancePool.implementation"), admin.Fx, "0x"],
        overrides
      );
      deployment.set(selector, address);
    } else {
      console.log(`Found ${selector} Proxy at:`, deployment.get(selector));
    }
  }

  // deploy stETHGateway
  if (!deployment.get("stETHGateway")) {
    const address = await contractDeploy(
      deployer,
      "stETHGateway",
      "stETHGateway",
      [deployment.get("Market.proxy"), deployment.get("FractionalToken.proxy"), deployment.get("LeveragedToken.proxy")],
      overrides
    );
    deployment.set("stETHGateway", address);
  } else {
    console.log(`Found stETHGateway at:`, deployment.get("stETHGateway"));
  }

  // deploy wstETHWrapper
  if (!deployment.get("wrapper.wstETHWrapper")) {
    const address = await contractDeploy(deployer, "wstETHWrapper", "wstETHWrapper", [], overrides);
    deployment.set("wrapper.wstETHWrapper", address);
  } else {
    console.log(`Found wstETHWrapper at:`, deployment.get("wrapper.wstETHWrapper"));
  }

  // deploy StETHAndxETHWrapper
  if (!deployment.get("wrapper.StETHAndxETHWrapper")) {
    const address = await contractDeploy(
      deployer,
      "StETHAndxETHWrapper",
      "StETHAndxETHWrapper",
      [deployment.get("LeveragedToken.proxy"), deployment.get("Market.proxy"), governance.PlatformFeeSpliter],
      overrides
    );
    deployment.set("wrapper.StETHAndxETHWrapper", address);
  } else {
    console.log(`Found StETHAndxETHWrapper at:`, deployment.get("wrapper.StETHAndxETHWrapper"));
  }

  // deploy chainlink twap oracle
  for (const symbol of ["ETH", "stETH"]) {
    if (!deployment.get("ChainlinkTwapOracle." + symbol)) {
      const address = await contractDeploy(
        deployer,
        "ChainlinkTwapOracleV3 for " + symbol,
        "ChainlinkTwapOracleV3",
        [ChainlinkPriceFeed[symbol], 1, 10800, symbol],
        overrides
      );
      deployment.set("ChainlinkTwapOracle." + symbol, address);
    } else {
      console.log(`Found ChainlinkTwapOracleV3 for ${symbol} at:`, deployment.get("ChainlinkTwapOracle." + symbol));
    }
  }

  // deploy FxETHTwapOracle
  if (!deployment.get("FxETHTwapOracle")) {
    const address = await contractDeploy(
      deployer,
      "FxETHTwapOracle",
      "FxETHTwapOracle",
      [
        deployment.get("ChainlinkTwapOracle.stETH"),
        deployment.get("ChainlinkTwapOracle.ETH"),
        "0x21e27a5e5513d6e65c4f830167390997aa84843a",
      ],
      overrides
    );
    deployment.set("FxETHTwapOracle", address);
  } else {
    console.log(`Found FxETHTwapOracle at:`, deployment.get("FxETHTwapOracle"));
  }

  // deploy FxGateway
  if (!deployment.get("FxGateway")) {
    const address = await contractDeploy(
      deployer,
      "FxGateway",
      "FxGateway",
      [
        deployment.get("Market.proxy"),
        TOKENS.stETH.address,
        deployment.get("FractionalToken.proxy"),
        deployment.get("LeveragedToken.proxy"),
      ],
      overrides
    );
    deployment.set("FxGateway", address);
  } else {
    console.log(`Found FxGateway at:`, deployment.get("FxGateway"));
  }

  // deploy ReservePool
  if (!deployment.get("ReservePool")) {
    const address = await contractDeploy(
      deployer,
      "ReservePool",
      "ReservePool",
      [deployment.get("Market.proxy"), deployment.get("FractionalToken.proxy")],
      overrides
    );
    deployment.set("ReservePool", address);
  } else {
    console.log(`Found ReservePool at:`, deployment.get("ReservePool"));
  }

  // deploy RebalanceWithBonusToken
  for (const pool of ["APool", "BPool"]) {
    const selector = `RebalanceWithBonusToken.${pool}`;
    if (!deployment.get(selector)) {
      const address = await contractDeploy(
        deployer,
        selector,
        "RebalanceWithBonusToken",
        [deployment.get(`RebalancePool.${pool}`), governance.FXN],
        overrides
      );
      deployment.set(selector, address);
    } else {
      console.log(`Found ${selector} at:`, deployment.get(selector));
    }
  }

  // deploy RebalancePoolRegistry
  if (!deployment.get("RebalancePoolRegistry")) {
    const address = await contractDeploy(deployer, "RebalancePoolRegistry", "RebalancePoolRegistry", [], overrides);
    deployment.set("RebalancePoolRegistry", address);
  } else {
    console.log(`Found RebalancePoolRegistry at:`, deployment.get("RebalancePoolRegistry"));
  }

  // deploy RebalancePoolSplitter
  if (!deployment.get("RebalancePoolSplitter")) {
    const address = await contractDeploy(deployer, "RebalancePoolSplitter", "RebalancePoolSplitter", [], overrides);
    deployment.set("RebalancePoolSplitter", address);
  } else {
    console.log(`Found RebalancePoolSplitter at:`, deployment.get("RebalancePoolSplitter"));
  }

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
  // upgrade proxy for RebalancePool A and B
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
  if (
    (await proxyAdmin.getProxyImplementation(deployment.RebalancePool.BPool)) !==
    deployment.RebalancePool.implementation
  ) {
    await ownerContractCall(
      proxyAdmin,
      "ProxyAdmin upgrade RebalancePool B",
      "upgrade",
      [deployment.RebalancePool.BPool, deployment.RebalancePool.implementation],
      overrides
    );
  }
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
  const rebalancePoolB = await ethers.getContractAt("RebalancePool", deployment.RebalancePool.BPool, deployer);
  const rebalancerA = await ethers.getContractAt(
    "RebalanceWithBonusToken",
    deployment.RebalanceWithBonusToken.APool,
    deployer
  );
  const rebalancerB = await ethers.getContractAt(
    "RebalanceWithBonusToken",
    deployment.RebalanceWithBonusToken.APool,
    deployer
  );
  const rebalancePoolRegistry = await ethers.getContractAt(
    "RebalancePoolRegistry",
    deployment.RebalancePoolRegistry,
    deployer
  );
  const rebalancePoolSplitter = await ethers.getContractAt(
    "RebalancePoolSplitter",
    deployment.RebalancePoolSplitter,
    deployer
  );

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

  // Initialize RebalancePool BPool
  if ((await rebalancePoolB.treasury()) === ZeroAddress) {
    await contractCall(
      rebalancePoolB,
      "RebalancePool BPool initialize",
      "initialize",
      [await treasury.getAddress(), await market.getAddress()],
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
  if ((await rebalancePoolA.liquidator()) !== deployment.RebalanceWithBonusToken.APool) {
    await ownerContractCall(
      rebalancePoolA,
      "RebalancePool APool updateLiquidator",
      "updateLiquidator",
      [deployment.RebalanceWithBonusToken.APool],
      overrides
    );
  }
  if ((await rebalancePoolA.rewardManager(TOKENS.wstETH.address)) === ZeroAddress) {
    await ownerContractCall(
      rebalancePoolA,
      "RebalancePool.APool add wstETH as reward",
      "addReward",
      [TOKENS.wstETH.address, deployment.RebalancePoolSplitter, 86400 * 7],
      overrides
    );
  }
  if ((await rebalancePoolA.rewardManager(TOKENS.wstETH.address)) !== deployment.RebalancePoolSplitter) {
    await ownerContractCall(
      rebalancePoolA,
      "RebalancePool.APool updateReward for wstETH",
      "updateReward",
      [TOKENS.wstETH.address, deployment.RebalancePoolSplitter, 86400 * 7],
      overrides
    );
  }

  // Setup RebalancePool BPool
  if ((await rebalancePoolB.wrapper()) !== deployment.wrapper.StETHAndxETHWrapper) {
    await ownerContractCall(
      rebalancePoolB,
      "RebalancePool BPool updateWrapper to StETHAndxETHWrapper",
      "updateWrapper",
      [deployment.wrapper.StETHAndxETHWrapper],
      overrides
    );
  }
  if ((await rebalancePoolB.liquidator()) !== deployment.RebalanceWithBonusToken.BPool) {
    await ownerContractCall(
      rebalancePoolB,
      "RebalancePool BPool updateLiquidator",
      "updateLiquidator",
      [deployment.RebalanceWithBonusToken.BPool],
      overrides
    );
  }
  if ((await rebalancePoolB.rewardManager(TOKENS.wstETH.address)) === ZeroAddress) {
    await ownerContractCall(
      rebalancePoolB,
      "RebalancePool.BPool add wstETH as reward",
      "addReward",
      [TOKENS.wstETH.address, deployment.RebalancePoolSplitter, 86400 * 7],
      overrides
    );
  }
  if ((await rebalancePoolB.rewardManager(TOKENS.wstETH.address)) !== deployment.RebalancePoolSplitter) {
    await ownerContractCall(
      rebalancePoolB,
      "RebalancePool.BPool updateReward for wstETH",
      "updateReward",
      [TOKENS.wstETH.address, deployment.RebalancePoolSplitter, 86400 * 7],
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
  if (!pools.includes(await rebalancePoolB.getAddress())) {
    await ownerContractCall(
      rebalancePoolRegistry,
      "RebalancePoolRegistry register RebalancePool BPool",
      "registerRebalancePool",
      [await rebalancePoolB.getAddress()],
      overrides
    );
  }

  // Setup RebalancePoolSplitter
  if ((await rebalancePoolSplitter.splitter(TOKENS.wstETH.address)) !== deployment.stETHTreasury.proxy) {
    await ownerContractCall(
      rebalancePoolSplitter,
      "RebalancePoolSplitter set splitter for wstETH",
      "setSplitter",
      [TOKENS.wstETH.address, deployment.stETHTreasury.proxy],
      overrides
    );
  }
  const [receivers] = await rebalancePoolSplitter.getReceivers(TOKENS.wstETH.address);
  if (receivers.length === 0) {
    await ownerContractCall(
      rebalancePoolSplitter,
      "RebalancePoolSplitter add RebalancePool.APool",
      "registerReceiver",
      [TOKENS.wstETH.address, deployment.RebalancePool.APool, [1e9]],
      overrides
    );
  }
  if (receivers.length === 1) {
    await ownerContractCall(
      rebalancePoolSplitter,
      "RebalancePoolSplitter add RebalancePool.BPool",
      "registerReceiver",
      [TOKENS.wstETH.address, deployment.RebalancePool.BPool, [5e8, 5e8]],
      overrides
    );
  }

  // Setup RebalanceWithBonusToken APool
  if ((await rebalancerA.bonus()) !== ethers.parseEther("2")) {
    await ownerContractCall(
      rebalancerA,
      "RebalanceWithBonusToken APool set bonus to 2 FXN",
      "updateBonus",
      [ethers.parseEther("2")],
      overrides
    );
  }

  // Setup RebalanceWithBonusToken BPool
  if ((await rebalancerB.bonus()) !== ethers.parseEther("2")) {
    await ownerContractCall(
      rebalancerB,
      "RebalanceWithBonusToken BPool set bonus to 2 FXN",
      "updateBonus",
      [ethers.parseEther("2")],
      overrides
    );
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
