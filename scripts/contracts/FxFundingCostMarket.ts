import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { MaxUint256, ZeroAddress, id } from "ethers";
import { ethers, network } from "hardhat";

import {
  FractionalTokenV2,
  FundraisingGaugeFx,
  FxUSDRebalancer,
  FxUSDShareableRebalancePool,
  GaugeController,
  LeveragedTokenV2,
  MarketWithFundingCost,
  RebalancePoolRegistry,
  RebalancePoolSplitter,
  TreasuryWithFundingCost,
} from "@/types/index";
import { TOKENS, same, selectDeployments } from "@/utils/index";

import { ProxyAdminDeployment } from "./ProxyAdmin";
import { ContractCallHelper, DeploymentHelper, abiDecode, contractCall, ownerContractCall } from "./helpers";
import { FxGovernanceDeployment, FxUSDDeployment, MarketConfig } from "./FxConfig";
import * as FxGovernance from "./FxGovernance";
import { MultisigDeployment } from "./Multisig";
import { FxOracleDeployment } from "./FxOracle";

async function doUpgrade(
  admin: HardhatEthersSigner,
  desc: string,
  proxyAddr: string,
  implAddr: string,
  newAdmin: string
) {
  const proxy = await ethers.getContractAt("TransparentUpgradeableProxy", proxyAddr, admin);
  try {
    const [proxyImplementation] = abiDecode(
      ["address"],
      await ethers.provider.call({
        to: await proxy.getAddress(),
        from: admin.address,
        data: proxy.interface.encodeFunctionData("implementation"),
      })
    );
    if (!same(proxyImplementation, implAddr)) {
      await contractCall(proxy.connect(admin), desc + " set implementation", "upgradeTo", [implAddr]);
    }
  } catch (_) {
    const proxyAdmin = await ethers.getContractAt("ProxyAdmin", newAdmin, admin);
    const proxyImplementation = await proxyAdmin.getProxyImplementation(proxy.getAddress());
    if (!same(proxyImplementation, implAddr)) {
      await ownerContractCall(proxyAdmin, desc + " upgrade implementation", "upgrade", [proxyAddr, implAddr]);
    }
  }
  try {
    const [proxyAdmin] = abiDecode(
      ["address"],
      await ethers.provider.call({
        to: await proxy.getAddress(),
        from: admin.address,
        data: proxy.interface.encodeFunctionData("admin"),
      })
    );
    if (!same(proxyAdmin, newAdmin)) {
      await contractCall(proxy.connect(admin), " change admin", "changeAdmin", [newAdmin]);
    }
  } catch (_) {
    await ethers.provider.call({
      to: await proxy.getAddress(),
      from: newAdmin,
      data: proxy.interface.encodeFunctionData("admin"),
    });
  }
}

export async function deploy(deployment: DeploymentHelper, symbol: string, fxUSD: string) {
  const admin = selectDeployments(network.name, "ProxyAdmin").toObject() as ProxyAdminDeployment;
  const governance = selectDeployments(network.name, "Fx.Governance").toObject() as FxGovernanceDeployment;
  const baseToken = TOKENS[symbol].address;
  let selectorPrefix = `Markets.${symbol}`;

  // deploy proxies
  await deployment.proxyDeploy(
    `${selectorPrefix}.Treasury.proxy`,
    `Treasury proxy for ${symbol}`,
    deployment.get("EmptyContract"),
    deployment.deployer.address,
    "0x"
  );
  await deployment.proxyDeploy(
    `${selectorPrefix}.Market.proxy`,
    `Market for ${symbol}`,
    deployment.get("EmptyContract"),
    deployment.deployer.address,
    "0x"
  );
  await deployment.proxyDeploy(
    `${selectorPrefix}.FractionalToken.proxy`,
    `FractionalToken for ${symbol}`,
    deployment.get("EmptyContract"),
    deployment.deployer.address,
    "0x"
  );
  await deployment.proxyDeploy(
    `${selectorPrefix}.LeveragedToken.proxy`,
    `LeveragedToken for ${symbol}`,
    deployment.get("EmptyContract"),
    deployment.deployer.address,
    "0x"
  );

  // deploy implementations
  await deployment.contractDeploy(
    `${selectorPrefix}.Treasury.implementation`,
    `Treasury implementation for ${symbol}`,
    "TreasuryWithFundingCost",
    [
      baseToken,
      deployment.get(`${selectorPrefix}.FractionalToken.proxy`),
      deployment.get(`${selectorPrefix}.LeveragedToken.proxy`),
    ]
  );
  await doUpgrade(
    deployment.deployer,
    `Treasury for ${symbol}`,
    deployment.get(`${selectorPrefix}.Treasury.proxy`),
    deployment.get(`${selectorPrefix}.Treasury.implementation`),
    admin.Fx
  );
  await deployment.contractDeploy(
    `${selectorPrefix}.Market.implementation`,
    `Market implementation for ${symbol}`,
    "MarketWithFundingCost",
    [deployment.get(`${selectorPrefix}.Treasury.proxy`)]
  );
  await doUpgrade(
    deployment.deployer,
    `Market for ${symbol}`,
    deployment.get(`${selectorPrefix}.Market.proxy`),
    deployment.get(`${selectorPrefix}.Market.implementation`),
    admin.Fx
  );
  await deployment.contractDeploy(
    `${selectorPrefix}.FractionalToken.implementation`,
    `FractionalToken implementation for ${symbol}`,
    "FractionalTokenV2",
    [deployment.get(`${selectorPrefix}.Treasury.proxy`)]
  );
  await doUpgrade(
    deployment.deployer,
    `FractionalToken for ${symbol}`,
    deployment.get(`${selectorPrefix}.FractionalToken.proxy`),
    deployment.get(`${selectorPrefix}.FractionalToken.implementation`),
    admin.Fx
  );
  await deployment.contractDeploy(
    `${selectorPrefix}.LeveragedToken.implementation`,
    `LeveragedToken implementation for ${symbol}`,
    "LeveragedTokenV2",
    [deployment.get(`${selectorPrefix}.Treasury.proxy`), deployment.get(`${selectorPrefix}.FractionalToken.proxy`)]
  );
  await doUpgrade(
    deployment.deployer,
    `LeveragedToken for ${symbol}`,
    deployment.get(`${selectorPrefix}.LeveragedToken.proxy`),
    deployment.get(`${selectorPrefix}.LeveragedToken.implementation`),
    admin.Fx
  );

  // deploy FxInitialFund
  await deployment.contractDeploy(`${selectorPrefix}.FxInitialFund`, `FxInitialFund for ${symbol}`, "FxInitialFund", [
    deployment.get(`${selectorPrefix}.Market.proxy`),
    fxUSD,
  ]);

  // deploy registry
  await deployment.contractDeploy(
    `${selectorPrefix}.RebalancePoolRegistry`,
    `RebalancePoolRegistry for ${symbol}`,
    "RebalancePoolRegistry",
    []
  );

  // deploy RebalancePoolSplitter
  await deployment.contractDeploy(
    `${selectorPrefix}.RebalancePoolSplitter`,
    "RebalancePoolSplitter",
    "RebalancePoolSplitter",
    []
  );
  // deploy RebalancePoolGauge
  await deployment.minimalProxyDeploy(
    `${selectorPrefix}.RebalancePoolGauge`,
    `${MarketConfig[symbol].FractionalToken.symbol} FxUSDShareableRebalancePool FundraiseGauge`,
    governance.FundraiseGauge.implementation.FundraisingGaugeFx
  );

  // deploy RebalancePoolGaugeClaimer
  await deployment.contractDeploy(
    `${selectorPrefix}.RebalancePoolGaugeClaimer`,
    `RebalancePoolGaugeClaimer for ${symbol}`,
    "RebalancePoolGaugeClaimer",
    [
      governance.ReservePool,
      deployment.get(`${selectorPrefix}.Treasury.proxy`),
      deployment.get(`${selectorPrefix}.RebalancePoolGauge`),
      deployment.get(`${selectorPrefix}.RebalancePoolSplitter`),
    ]
  );

  // deploy rebalance pool whose liquidation reward is base token
  selectorPrefix = `Markets.${symbol}.RebalancePool.${symbol}`;
  await deployment.proxyDeploy(
    `${selectorPrefix}.pool`,
    `FxUSDShareableRebalancePool/${symbol} Proxy`,
    fxUSD !== ZeroAddress ? deployment.get("FxUSDShareableRebalancePool") : deployment.get("ShareableRebalancePoolV2"),
    admin.Fx,
    "0x"
  );
  // deploy rebalance pool whose liquidation reward is leveraged token
  selectorPrefix = `Markets.${symbol}.RebalancePool.${MarketConfig[symbol].LeveragedToken.symbol}`;
  await deployment.proxyDeploy(
    `${selectorPrefix}.pool`,
    `FxUSDShareableRebalancePool/${MarketConfig[symbol].LeveragedToken.symbol} Proxy`,
    fxUSD !== ZeroAddress ? deployment.get("FxUSDShareableRebalancePool") : deployment.get("ShareableRebalancePoolV2"),
    admin.Fx,
    "0x"
  );
  await deployment.contractDeploy(
    `${selectorPrefix}.wrapper`,
    `LeveragedTokenWrapper for ${symbol} and ${MarketConfig[symbol].LeveragedToken.symbol}`,
    "LeveragedTokenWrapper",
    [
      TOKENS[symbol].address,
      deployment.get(`Markets.${symbol}.LeveragedToken.proxy`),
      deployment.get(`Markets.${symbol}.Market.proxy`),
      governance.PlatformFeeSpliter,
    ]
  );
}

export async function initialize(caller: ContractCallHelper, baseSymbol: string, fxUSD: string) {
  const deployment = selectDeployments(network.name, "Fx.FXUSD").toObject() as FxUSDDeployment;
  const marketDeployment = deployment.Markets[baseSymbol];
  const marketConfig = MarketConfig[baseSymbol];

  const multisig = selectDeployments(network.name, "Multisig").toObject() as MultisigDeployment;
  const governance = selectDeployments(network.name, "Fx.Governance").toObject() as FxGovernanceDeployment;
  const oracle = selectDeployments(network.name, "Fx.Oracle").toObject() as FxOracleDeployment;

  const OracleMapping: { [symbol: string]: string } = {
    wstETH: oracle.FxStETHOracleV2,
    sfrxETH: oracle.FxFrxETHOracleV2,
    weETH: oracle.FxEETHOracleV2,
    ezETH: oracle.FxEzETHOracleV2,
    WBTC: oracle.FxWBTCOracleV2,
  };

  const AMMMapping: { [symbol: string]: string } = {
    WBTC: "0xE0438Eb3703bF871E31Ce639bd351109c88666ea",
  };

  const fToken = await caller.contract<FractionalTokenV2>("FractionalTokenV2", marketDeployment.FractionalToken.proxy);
  const xToken = await caller.contract<LeveragedTokenV2>("LeveragedTokenV2", marketDeployment.LeveragedToken.proxy);
  const market = await caller.contract<MarketWithFundingCost>("MarketWithFundingCost", marketDeployment.Market.proxy);
  const treasury = await caller.contract<TreasuryWithFundingCost>(
    "TreasuryWithFundingCost",
    marketDeployment.Treasury.proxy
  );
  const fxUSDRebalancer = await caller.contract<FxUSDRebalancer>("FxUSDRebalancer", deployment.FxUSDRebalancer);
  const rebalancePoolRegistry = await caller.contract<RebalancePoolRegistry>(
    "RebalancePoolRegistry",
    marketDeployment.RebalancePoolRegistry
  );
  const rebalancePoolSplitter = await caller.contract<RebalancePoolSplitter>(
    "RebalancePoolSplitter",
    marketDeployment.RebalancePoolSplitter
  );
  const rebalancePoolGauge = await caller.contract<FundraisingGaugeFx>(
    "FundraisingGaugeFx",
    marketDeployment.RebalancePoolGauge
  );
  const rebalancePoolA = await caller.contract<FxUSDShareableRebalancePool>(
    "FxUSDShareableRebalancePool",
    marketDeployment.RebalancePool[baseSymbol].pool
  );
  const rebalancePoolB = await caller.contract<FxUSDShareableRebalancePool>(
    "FxUSDShareableRebalancePool",
    marketDeployment.RebalancePool[MarketConfig[baseSymbol].LeveragedToken.symbol].pool
  );
  const controller = await caller.contract<GaugeController>("GaugeController", governance.GaugeController);

  // initialize contract
  if ((await fToken.name()) !== marketConfig.FractionalToken.name) {
    await caller.call(fToken, `FractionalToken for ${baseSymbol} initialize`, "initialize", [
      marketConfig.FractionalToken.name,
      marketConfig.FractionalToken.symbol,
    ]);
  }
  if ((await xToken.name()) !== marketConfig.LeveragedToken.name) {
    await caller.call(xToken, `LeveragedToken for ${baseSymbol} initialize`, "initialize", [
      marketConfig.LeveragedToken.name,
      marketConfig.LeveragedToken.symbol,
    ]);
  }
  if ((await treasury.platform()) === ZeroAddress) {
    await caller.call(treasury, `Treasury for ${baseSymbol} initialize`, "initialize", [
      governance.PlatformFeeSpliter,
      marketDeployment.RebalancePoolSplitter,
      OracleMapping[baseSymbol],
      marketConfig.BaseTokenCapacity,
      60,
      AMMMapping[baseSymbol],
    ]);
  }
  if ((await market.platform()) === ZeroAddress) {
    await caller.call(market, `Market for ${baseSymbol} initialize`, "initialize", [
      governance.PlatformFeeSpliter,
      governance.ReservePool,
      marketDeployment.RebalancePoolRegistry,
    ]);
  }
  if ((await rebalancePoolGauge.last_checkpoint()) === 0n) {
    await caller.call(
      rebalancePoolGauge,
      `${marketConfig.FractionalToken.symbol} FxUSDShareableRebalancePool FundraiseGauge initialize`,
      "initialize",
      [marketDeployment.RebalancePoolGaugeClaimer, MaxUint256]
    );
  }
  await FxGovernance.addGauge(
    controller as GaugeController,
    `${marketConfig.FractionalToken.symbol} FxUSDShareableRebalancePool`,
    await rebalancePoolGauge.getAddress(),
    1
  );
  if ((await rebalancePoolA.treasury()) === ZeroAddress) {
    await caller.call(rebalancePoolA, `FxUSDShareableRebalancePool/${baseSymbol} initialize`, "initialize", [
      await treasury.getAddress(),
      await market.getAddress(),
      ZeroAddress,
    ]);
  }
  if ((await rebalancePoolB.treasury()) === ZeroAddress) {
    await caller.call(
      rebalancePoolB,
      `FxUSDShareableRebalancePool/${marketConfig.LeveragedToken.symbol} initialize`,
      "initialize",
      [await treasury.getAddress(), await market.getAddress(), ZeroAddress]
    );
  }

  // upgrade
  const admin = selectDeployments(network.name, "ProxyAdmin").toObject() as ProxyAdminDeployment;
  await caller.upgrade(
    admin.Fx,
    `FxUSDShareableRebalancePool/${baseSymbol}`,
    await rebalancePoolA.getAddress(),
    deployment.FxUSDShareableRebalancePool
  );
  await caller.upgrade(
    admin.Fx,
    `FxUSDShareableRebalancePool/${marketConfig.LeveragedToken.symbol}`,
    await rebalancePoolB.getAddress(),
    deployment.FxUSDShareableRebalancePool
  );

  // setup Treasury
  if ((await treasury.getHarvesterRatio()) !== marketConfig.Treasury.HarvesterRatio) {
    await caller.ownerCall(treasury, `Treasury for ${baseSymbol} updateHarvesterRatio`, "updateHarvesterRatio", [
      marketConfig.Treasury.HarvesterRatio,
    ]);
  }
  if ((await treasury.getRebalancePoolRatio()) !== marketConfig.Treasury.RebalancePoolRatio) {
    await caller.ownerCall(
      treasury,
      `Treasury for ${baseSymbol} updateRebalancePoolRatio`,
      "updateRebalancePoolRatio",
      [marketConfig.Treasury.RebalancePoolRatio]
    );
  }
  if (!(await treasury.hasRole(id("PROTOCOL_INITIALIZER_ROLE"), marketDeployment.FxInitialFund))) {
    await caller.ownerCall(treasury, `Treasury for ${baseSymbol} grant PROTOCOL_INITIALIZER_ROLE`, "grantRole", [
      id("PROTOCOL_INITIALIZER_ROLE"),
      marketDeployment.FxInitialFund,
    ]);
  }
  if (!(await treasury.hasRole(id("FX_MARKET_ROLE"), marketDeployment.Market.proxy))) {
    await caller.ownerCall(treasury, `Treasury for ${baseSymbol} grant FX_MARKET_ROLE`, "grantRole", [
      id("FX_MARKET_ROLE"),
      marketDeployment.Market.proxy,
    ]);
  }
  if ((await treasury.baseTokenCap()) !== marketConfig.BaseTokenCapacity) {
    await caller.ownerCall(treasury, `Treasury for ${baseSymbol} updateBaseTokenCap`, "updateBaseTokenCap", [
      marketConfig.BaseTokenCapacity,
    ]);
  }
  if ((await treasury.priceOracle()) !== OracleMapping[baseSymbol]) {
    await caller.ownerCall(treasury, `Treasury for ${baseSymbol} updatePriceOracle`, "updatePriceOracle", [
      OracleMapping[baseSymbol],
    ]);
  }
  if ((await treasury.fundingCostScale()) !== marketConfig.FundingCostScale) {
    await caller.ownerCall(treasury, `Treasury for ${baseSymbol} updateFundingCostScale`, "updateFundingCostScale", [
      marketConfig.FundingCostScale,
    ]);
  }

  // setup Market
  if ((await market.reservePool()) !== governance.ReservePool) {
    await caller.ownerCall(treasury, "Market update reserve pool", "updateReservePool", [governance.ReservePool]);
  }
  if ((await market.stabilityRatio()) !== marketConfig.Market.StabilityRatio) {
    await caller.ownerCall(market, `Market for ${baseSymbol} updateStabilityRatio`, "updateStabilityRatio", [
      marketConfig.Market.StabilityRatio,
    ]);
  }
  const fTokenMintFeeRatio = await market.fTokenMintFeeRatio();
  if (
    fTokenMintFeeRatio.defaultFee !== marketConfig.Market.FractionalMintFeeRatio.default ||
    fTokenMintFeeRatio.deltaFee !== marketConfig.Market.FractionalMintFeeRatio.delta
  ) {
    await caller.ownerCall(market, `Market for ${baseSymbol} updateMintFeeRatio fToken`, "updateMintFeeRatio", [
      marketConfig.Market.FractionalMintFeeRatio.default,
      marketConfig.Market.FractionalMintFeeRatio.delta,
      true,
    ]);
  }
  const xTokenMintFeeRatio = await market.xTokenMintFeeRatio();
  if (
    xTokenMintFeeRatio.defaultFee !== marketConfig.Market.LeveragedMintFeeRatio.default ||
    xTokenMintFeeRatio.deltaFee !== marketConfig.Market.LeveragedMintFeeRatio.delta
  ) {
    await caller.ownerCall(market, `Market for ${baseSymbol} updateMintFeeRatio xToken`, "updateMintFeeRatio", [
      marketConfig.Market.LeveragedMintFeeRatio.default,
      marketConfig.Market.LeveragedMintFeeRatio.delta,
      false,
    ]);
  }
  const fTokenRedeemFeeRatio = await market.fTokenRedeemFeeRatio();
  if (
    fTokenRedeemFeeRatio.defaultFee !== marketConfig.Market.FractionalRedeemFeeRatio.default ||
    fTokenRedeemFeeRatio.deltaFee !== marketConfig.Market.FractionalRedeemFeeRatio.delta
  ) {
    await caller.ownerCall(market, `Market for ${baseSymbol} updateRedeemFeeRatio fToken`, "updateRedeemFeeRatio", [
      marketConfig.Market.FractionalRedeemFeeRatio.default,
      marketConfig.Market.FractionalRedeemFeeRatio.delta,
      true,
    ]);
  }
  const xTokenRedeemFeeRatio = await market.xTokenRedeemFeeRatio();
  if (
    xTokenRedeemFeeRatio.defaultFee !== marketConfig.Market.LeveragedRdeeemFeeRatio.default ||
    xTokenRedeemFeeRatio.deltaFee !== marketConfig.Market.LeveragedRdeeemFeeRatio.delta
  ) {
    await caller.ownerCall(market, `Market for ${baseSymbol} updateRedeemFeeRatio xToken`, "updateRedeemFeeRatio", [
      marketConfig.Market.LeveragedRdeeemFeeRatio.default,
      marketConfig.Market.LeveragedRdeeemFeeRatio.delta,
      false,
    ]);
  }

  // enable fxUSD for market
  if ((await market.fxUSD()) !== fxUSD) {
    await caller.ownerCall(market, `Market for ${baseSymbol} enableFxUSD`, "enableFxUSD", [fxUSD]);
  }

  // Setup RebalancePoolRegistry
  const pools = await rebalancePoolRegistry.getPools();
  if (!pools.includes(await rebalancePoolA.getAddress())) {
    await caller.ownerCall(
      rebalancePoolRegistry,
      `RebalancePoolRegistry register FxUSDShareableRebalancePool/${baseSymbol}`,
      "registerRebalancePool",
      [await rebalancePoolA.getAddress()]
    );
  }
  if (!pools.includes(await rebalancePoolB.getAddress())) {
    await caller.ownerCall(
      rebalancePoolRegistry,
      `RebalancePoolRegistry register FxUSDShareableRebalancePool/${marketConfig.LeveragedToken.symbol}`,
      "registerRebalancePool",
      [await rebalancePoolB.getAddress()]
    );
  }

  // Setup FxUSDRebalancer
  const REBALANCE_POOL_ROLE = await fxUSDRebalancer.REBALANCE_POOL_ROLE();
  if ((await fxUSDRebalancer.bonus()) !== ethers.parseEther("1")) {
    await caller.ownerCall(fxUSDRebalancer, "FxUSDRebalancer set bonus to 1 FXN", "updateBonus", [
      ethers.parseEther("1"),
    ]);
  }
  if (!(await fxUSDRebalancer.hasRole(REBALANCE_POOL_ROLE, rebalancePoolA.getAddress()))) {
    await caller.ownerCall(
      fxUSDRebalancer,
      `FxUSDRebalancer register FxUSDShareableRebalancePool/${baseSymbol}`,
      "grantRole",
      [id("REBALANCE_POOL_ROLE"), await rebalancePoolA.getAddress()]
    );
  }
  if (!(await fxUSDRebalancer.hasRole(REBALANCE_POOL_ROLE, rebalancePoolB.getAddress()))) {
    await caller.ownerCall(
      fxUSDRebalancer,
      `FxUSDRebalancer register FxUSDShareableRebalancePool/${marketConfig.LeveragedToken.symbol}`,
      "grantRole",
      [id("REBALANCE_POOL_ROLE"), await rebalancePoolB.getAddress()]
    );
  }

  const LIQUIDATOR_ROLE = await rebalancePoolA.LIQUIDATOR_ROLE();
  const WITHDRAW_FROM_ROLE = await rebalancePoolA.WITHDRAW_FROM_ROLE();
  // Setup Rebalance Pool A
  if (!(await rebalancePoolA.hasRole(LIQUIDATOR_ROLE, fxUSDRebalancer.getAddress()))) {
    await caller.ownerCall(rebalancePoolA, `FxUSDShareableRebalancePool/${baseSymbol} add liquidator`, "grantRole", [
      LIQUIDATOR_ROLE,
      await fxUSDRebalancer.getAddress(),
    ]);
  }
  if (fxUSD !== ZeroAddress && !(await rebalancePoolA.hasRole(WITHDRAW_FROM_ROLE, fxUSD))) {
    await caller.ownerCall(
      rebalancePoolA,
      `FxUSDShareableRebalancePool/${baseSymbol} grant WITHDRAW_FROM_ROLE to fxUSD`,
      "grantRole",
      [WITHDRAW_FROM_ROLE, fxUSD]
    );
  }
  if ((await rebalancePoolA.distributors(TOKENS[baseSymbol].address)) === ZeroAddress) {
    await caller.ownerCall(
      rebalancePoolA,
      `FxUSDShareableRebalancePool/${baseSymbol} add ${baseSymbol} as reward`,
      "registerRewardToken",
      [TOKENS[baseSymbol].address, marketDeployment.RebalancePoolSplitter]
    );
  }
  if ((await rebalancePoolA.distributors(TOKENS.FXN.address)) === ZeroAddress) {
    await caller.ownerCall(
      rebalancePoolA,
      `FxUSDShareableRebalancePool/${baseSymbol} add FXN as reward`,
      "registerRewardToken",
      [TOKENS.FXN.address, marketDeployment.RebalancePoolSplitter]
    );
  }
  if ((await rebalancePoolA.liquidatableCollateralRatio()) !== marketConfig.Market.StabilityRatio) {
    await caller.ownerCall(
      rebalancePoolA,
      `FxUSDShareableRebalancePool/${baseSymbol} update LiquidatableCollateralRatio`,
      "updateLiquidatableCollateralRatio",
      [marketConfig.Market.StabilityRatio]
    );
  }

  // Setup Rebalance Pool B
  if (!(await rebalancePoolB.hasRole(LIQUIDATOR_ROLE, fxUSDRebalancer.getAddress()))) {
    await caller.ownerCall(
      rebalancePoolB,
      `FxUSDShareableRebalancePool/${marketConfig.LeveragedToken.symbol} add liquidator`,
      "grantRole",
      [LIQUIDATOR_ROLE, await fxUSDRebalancer.getAddress()]
    );
  }
  if (fxUSD !== ZeroAddress && !(await rebalancePoolB.hasRole(WITHDRAW_FROM_ROLE, fxUSD))) {
    await caller.ownerCall(
      rebalancePoolB,
      `FxUSDShareableRebalancePool/${marketConfig.LeveragedToken.symbol} grant WITHDRAW_FROM_ROLE to fxUSD`,
      "grantRole",
      [WITHDRAW_FROM_ROLE, fxUSD]
    );
  }
  if ((await rebalancePoolB.distributors(TOKENS[baseSymbol].address)) === ZeroAddress) {
    await caller.ownerCall(
      rebalancePoolB,
      `FxUSDShareableRebalancePool/${marketConfig.LeveragedToken.symbol} add ${baseSymbol} as reward`,
      "registerRewardToken",
      [TOKENS[baseSymbol].address, marketDeployment.RebalancePoolSplitter]
    );
  }
  if ((await rebalancePoolB.distributors(TOKENS.FXN.address)) === ZeroAddress) {
    await caller.ownerCall(
      rebalancePoolB,
      `FxUSDShareableRebalancePool/${marketConfig.LeveragedToken.symbol} add FXN as reward`,
      "registerRewardToken",
      [TOKENS.FXN.address, marketDeployment.RebalancePoolSplitter]
    );
  }
  if ((await rebalancePoolB.distributors(marketDeployment.LeveragedToken.proxy)) === ZeroAddress) {
    await caller.ownerCall(
      rebalancePoolB,
      `FxUSDShareableRebalancePool/${marketConfig.LeveragedToken.symbol} add ${marketDeployment.LeveragedToken.proxy} as reward`,
      "registerRewardToken",
      [marketDeployment.LeveragedToken.proxy, multisig.Fx]
    );
  }
  if ((await rebalancePoolB.liquidatableCollateralRatio()) !== marketConfig.Market.StabilityRatio) {
    await caller.ownerCall(
      rebalancePoolB,
      `FxUSDShareableRebalancePool/${marketConfig.LeveragedToken.symbol} update LiquidatableCollateralRatio`,
      "updateLiquidatableCollateralRatio",
      [marketConfig.Market.StabilityRatio]
    );
  }
  if ((await rebalancePoolB.wrapper()) !== marketDeployment.RebalancePool[marketConfig.LeveragedToken.symbol].wrapper) {
    await caller.ownerCall(
      rebalancePoolB,
      `FxUSDShareableRebalancePool/${marketConfig.LeveragedToken.symbol} update updateWrapper`,
      "updateWrapper",
      [marketDeployment.RebalancePool[marketConfig.LeveragedToken.symbol].wrapper]
    );
  }

  const setupRebalancePoolSplitter = async (symbol: string, splitter: string) => {
    if ((await rebalancePoolSplitter.splitter(TOKENS[symbol].address)) !== splitter) {
      await caller.ownerCall(
        rebalancePoolSplitter,
        "RebalancePoolSplitter set splitter for " + TOKENS[symbol].address,
        "setSplitter",
        [TOKENS[symbol].address, splitter]
      );
    }
    const [receivers] = await rebalancePoolSplitter.getReceivers(TOKENS[symbol].address);
    if (receivers.length < 1) {
      await caller.ownerCall(
        rebalancePoolSplitter,
        `RebalancePoolSplitter.${symbol} add FxUSDShareableRebalancePool/${baseSymbol}`,
        "registerReceiver",
        [TOKENS[symbol].address, await rebalancePoolA.getAddress(), [1e9]]
      );
    }
    if (receivers.length < 2) {
      await caller.ownerCall(
        rebalancePoolSplitter,
        `RebalancePoolSplitter.${symbol} add FxUSDShareableRebalancePool/${marketConfig.LeveragedToken.symbol}`,
        "registerReceiver",
        [TOKENS[symbol].address, await rebalancePoolB.getAddress(), [5e8, 5e8]]
      );
    }
  };

  await setupRebalancePoolSplitter(baseSymbol, marketDeployment.Treasury.proxy);
  await setupRebalancePoolSplitter("FXN", marketDeployment.RebalancePoolGaugeClaimer);
}
