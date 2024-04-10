/* eslint-disable camelcase */
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { Overrides, getAddress, id } from "ethers";
import { network, ethers } from "hardhat";

import { FxUSD, FxUSD__factory, PlatformFeeSpliter, ReservePoolV2 } from "@/types/index";
import { TOKENS, selectDeployments } from "@/utils/index";

import { ContractCallHelper, DeploymentHelper } from "./helpers";
import { FxGovernanceDeployment, FxUSDDeployment, MarketConfig } from "./FxConfig";
import * as FxFundingCostMarket from "./FxFundingCostMarket";
import * as FxWrappedTokenMarket from "./FxWrappedTokenMarket";
import { ProxyAdminDeployment } from "./ProxyAdmin";

export async function deploy(deployer: HardhatEthersSigner, overrides?: Overrides): Promise<FxUSDDeployment> {
  const admin = selectDeployments(network.name, "ProxyAdmin").toObject() as ProxyAdminDeployment;
  const governance = selectDeployments(network.name, "Fx.Governance").toObject() as FxGovernanceDeployment;
  const deployment = new DeploymentHelper(network.name, "Fx.FxUSD", deployer, overrides);

  // deploy placeholder
  await deployment.contractDeploy("EmptyContract", "EmptyContract", "EmptyContract", []);
  // deploy FxUSDRebalancer
  await deployment.contractDeploy("FxUSDRebalancer", "FxUSDRebalancer", "FxUSDRebalancer", [governance.FXN]);
  // deploy FxUSDShareableRebalancePool
  await deployment.contractDeploy(
    "FxUSDShareableRebalancePool",
    "FxUSDShareableRebalancePool",
    "FxUSDShareableRebalancePool",
    [governance.FXN, governance.veFXN, governance.VotingEscrowHelper, governance.TokenMinter]
  );
  /*
  // deploy ShareableRebalancePoolV2
  await deployment.contractDeploy("ShareableRebalancePoolV2", "ShareableRebalancePoolV2", "ShareableRebalancePoolV2", [
    governance.FXN,
    governance.veFXN,
    governance.VotingEscrowHelper,
    governance.TokenMinter,
  ]);
  */

  // deploy fxUSD
  await deployment.contractDeploy("FxUSD.implementation", "FxUSD implementation", "FxUSD", []);
  await deployment.proxyDeploy(
    "FxUSD.proxy.fxUSD",
    "fxUSD proxy",
    deployment.get("FxUSD.implementation"),
    admin.Fx,
    FxUSD__factory.createInterface().encodeFunctionData("initialize", ["f(x) USD", "fxUSD"])
  );
  await deployment.proxyDeploy(
    "FxUSD.proxy.rUSD",
    "rUSD proxy",
    deployment.get("FxUSD.implementation"),
    admin.Fx,
    FxUSD__factory.createInterface().encodeFunctionData("initialize", ["f(x) rUSD", "rUSD"])
  );
  await deployment.proxyDeploy(
    "FxUSD.proxy.btcUSD",
    "btcUSD proxy",
    deployment.get("FxUSD.implementation"),
    admin.Fx,
    FxUSD__factory.createInterface().encodeFunctionData("initialize", ["f(x) btcUSD", "btcUSD"])
  );

  // deploy markets
  await FxWrappedTokenMarket.deploy(deployment, "wstETH", deployment.get("FxUSD.proxy.fxUSD"));
  await FxWrappedTokenMarket.deploy(deployment, "sfrxETH", deployment.get("FxUSD.proxy.fxUSD"));
  await FxWrappedTokenMarket.deploy(deployment, "weETH", deployment.get("FxUSD.proxy.rUSD"));
  await FxWrappedTokenMarket.deploy(deployment, "ezETH", deployment.get("FxUSD.proxy.rUSD"));
  await FxFundingCostMarket.deploy(deployment, "WBTC", deployment.get("FxUSD.proxy.btcUSD"));
  // await deployMarket(deployment, "apxETH", deployment.get("FxUSD.proxy.rUSD"));
  // await deployMarket(deployment, "aCVX", ZeroAddress);

  return deployment.toObject() as FxUSDDeployment;
}

async function initializeFxUSD(
  caller: ContractCallHelper,
  deployment: FxUSDDeployment,
  fxUSD: FxUSD,
  baseSymbols: string[],
  allPools: string[]
) {
  const fxUSDSymbol = await fxUSD.symbol();
  const markets = await fxUSD.getMarkets();
  for (const baseSymbol of baseSymbols) {
    if (!markets.includes(getAddress(TOKENS[baseSymbol].address))) {
      await caller.ownerCall(fxUSD, `add ${baseSymbol} to ${fxUSDSymbol}`, "addMarket", [
        deployment.Markets[baseSymbol].Market.proxy,
        MarketConfig[baseSymbol].FxUSDMintCapacity,
      ]);
    }
    if ((await fxUSD.markets(TOKENS[baseSymbol].address)).mintCap !== MarketConfig[baseSymbol].FxUSDMintCapacity) {
      await caller.ownerCall(fxUSD, `${fxUSDSymbol} updateMintCap for ${baseSymbol}`, "updateMintCap", [
        TOKENS[baseSymbol].address,
        MarketConfig[baseSymbol].FxUSDMintCapacity,
      ]);
    }
  }
  const addedPools = await fxUSD.getRebalancePools();
  const poolsToAdd = [];
  for (const pool of allPools) {
    if (!addedPools.includes(getAddress(pool))) poolsToAdd.push(pool);
  }
  if (poolsToAdd.length > 0) {
    await caller.ownerCall(fxUSD, "addRebalancePools", "addRebalancePools", [poolsToAdd]);
  }
}

export async function initialize(deployer: HardhatEthersSigner, deployment: FxUSDDeployment, overrides?: Overrides) {
  const caller = new ContractCallHelper(deployer, overrides);
  const governance = selectDeployments(network.name, "Fx.Governance").toObject() as FxGovernanceDeployment;

  await FxWrappedTokenMarket.initialize(caller, "wstETH", deployment.FxUSD.proxy.fxUSD);
  await FxWrappedTokenMarket.initialize(caller, "sfrxETH", deployment.FxUSD.proxy.fxUSD);
  await FxWrappedTokenMarket.initialize(caller, "weETH", deployment.FxUSD.proxy.rUSD);
  await FxWrappedTokenMarket.initialize(caller, "ezETH", deployment.FxUSD.proxy.rUSD);
  await FxFundingCostMarket.initialize(caller, "WBTC", deployment.FxUSD.proxy.btcUSD);
  // await initializeMarket(deployer, deployment, "apxETH", deployment.FxUSD.proxy.rUSD, overrides);
  // await initializeMarket(deployer, deployment, "aCVX", ZeroAddress, overrides);

  const fxUSD = await caller.contract<FxUSD>("FxUSD", deployment.FxUSD.proxy.fxUSD);
  const rUSD = await caller.contract<FxUSD>("FxUSD", deployment.FxUSD.proxy.rUSD);
  const btcUSD = await caller.contract<FxUSD>("FxUSD", deployment.FxUSD.proxy.btcUSD);
  const reservePool = await caller.contract<ReservePoolV2>("ReservePoolV2", governance.ReservePool);
  const platformFeeSpliter = await caller.contract<PlatformFeeSpliter>(
    "PlatformFeeSpliter",
    governance.PlatformFeeSpliter
  );

  // setup fxUSD
  await initializeFxUSD(
    caller,
    deployment,
    fxUSD,
    ["wstETH", "sfrxETH"],
    [
      deployment.Markets.wstETH.RebalancePool.wstETH.pool,
      deployment.Markets.wstETH.RebalancePool.xstETH.pool,
      deployment.Markets.sfrxETH.RebalancePool.sfrxETH.pool,
      deployment.Markets.sfrxETH.RebalancePool.xfrxETH.pool,
    ]
  );

  // setup rUSD
  await initializeFxUSD(
    caller,
    deployment,
    rUSD,
    ["weETH", "ezETH"],
    [
      deployment.Markets.weETH.RebalancePool.weETH.pool,
      deployment.Markets.weETH.RebalancePool.xeETH.pool,
      deployment.Markets.ezETH.RebalancePool.ezETH.pool,
      deployment.Markets.ezETH.RebalancePool.xezETH.pool,
    ]
  );

  // setup btcUSD
  await initializeFxUSD(
    caller,
    deployment,
    btcUSD,
    ["WBTC"],
    [deployment.Markets.WBTC.RebalancePool.WBTC.pool, deployment.Markets.WBTC.RebalancePool.xWBTC.pool]
  );

  // Setup ReservePool
  for (const baseSymbol of ["wstETH", "sfrxETH", "weETH", "ezETH", "WBTC"]) {
    if ((await reservePool.bonusRatio(TOKENS[baseSymbol].address)) !== MarketConfig[baseSymbol].ReservePoolBonusRatio) {
      await caller.ownerCall(reservePool, "ReservePool updateBonusRatio for " + baseSymbol, "updateBonusRatio", [
        TOKENS[baseSymbol].address,
        MarketConfig[baseSymbol].ReservePoolBonusRatio,
      ]);
    }
    if (!(await reservePool.hasRole(id("MARKET_ROLE"), deployment.Markets[baseSymbol].Market.proxy))) {
      await caller.ownerCall(reservePool, `reservePool add ${baseSymbol} Market`, "grantRole", [
        id("MARKET_ROLE"),
        deployment.Markets[baseSymbol].Market.proxy,
      ]);
    }
  }

  // Setup PlatformFeeSpliter
  const length = await platformFeeSpliter.getRewardCount();
  const rewardToken: Array<string> = [];
  for (let i = 0; i < length; i++) {
    rewardToken.push((await platformFeeSpliter.rewards(i)).token);
  }
  if (!rewardToken.includes(getAddress(TOKENS.wstETH.address))) {
    await caller.ownerCall(platformFeeSpliter, "PlatformFeeSpliter add wstETH", "addRewardToken", [
      TOKENS.wstETH.address,
      governance.FeeDistributor.wstETH,
      0n,
      ethers.parseUnits("0.25", 9),
      ethers.parseUnits("0.75", 9),
    ]);
  }
  for (const baseSymbol of ["stETH", "sfrxETH", "weETH", "ezETH", "WBTC"]) {
    if (!rewardToken.includes(getAddress(TOKENS[baseSymbol].address))) {
      await caller.ownerCall(platformFeeSpliter, "PlatformFeeSpliter add " + baseSymbol, "addRewardToken", [
        TOKENS[baseSymbol].address,
        governance.Burner.PlatformFeeBurner,
        0n,
        ethers.parseUnits("0.25", 9),
        ethers.parseUnits("0.75", 9),
      ]);
    }
    if ((await platformFeeSpliter.burners(TOKENS[baseSymbol].address)) !== governance.Burner.PlatformFeeBurner) {
      await caller.ownerCall(
        platformFeeSpliter,
        "PlatformFeeSpliter set burner for " + baseSymbol,
        "updateRewardTokenBurner",
        [TOKENS[baseSymbol].address, governance.Burner.PlatformFeeBurner]
      );
    }
  }
}
