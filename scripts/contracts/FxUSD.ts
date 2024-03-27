/* eslint-disable camelcase */
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { MaxUint256, Overrides, ZeroAddress, getAddress, id } from "ethers";
import { network, ethers } from "hardhat";

import { FxUSD__factory } from "@/types/index";
import { TOKENS, same, selectDeployments } from "@/utils/index";

import { ContractCallHelper, DeploymentHelper, abiDecode, contractCall, ownerContractCall } from "./helpers";
import * as FxGovernance from "./FxGovernance";
import * as Multisig from "./Multisig";
import * as FxOracle from "./FxOracle";
import { ProxyAdminDeployment } from "./ProxyAdmin";

const MarketConfig: {
  [symbol: string]: {
    FractionalToken: {
      name: string;
      symbol: string;
    };
    LeveragedToken: {
      name: string;
      symbol: string;
    };
    Treasury: {
      HarvesterRatio: bigint;
      RebalancePoolRatio: bigint;
    };
    Market: {
      FractionalMintFeeRatio: { default: bigint; delta: bigint };
      LeveragedMintFeeRatio: { default: bigint; delta: bigint };
      FractionalRedeemFeeRatio: { default: bigint; delta: bigint };
      LeveragedRdeeemFeeRatio: { default: bigint; delta: bigint };
      StabilityRatio: bigint;
    };
    BaseTokenCapacity: bigint;
    FxUSDMintCapacity: bigint;
    ReservePoolBonusRatio: bigint;
  };
} = {
  wstETH: {
    FractionalToken: { name: "Fractional stETH", symbol: "fstETH" },
    LeveragedToken: { name: "Leveraged stETH", symbol: "xstETH" },
    Treasury: {
      HarvesterRatio: ethers.parseUnits("0.01", 9), // 1%,
      RebalancePoolRatio: ethers.parseUnits("0.5", 9), // 50%,
    },
    Market: {
      FractionalMintFeeRatio: { default: ethers.parseEther("0.0025"), delta: 0n }, // 0.25% and 0%
      LeveragedMintFeeRatio: { default: ethers.parseEther("0.01"), delta: -ethers.parseEther("0.01") }, // 1% and -1%
      FractionalRedeemFeeRatio: { default: ethers.parseEther("0.0025"), delta: -ethers.parseEther("0.0025") }, // 0.25% and -0.25%
      LeveragedRdeeemFeeRatio: { default: ethers.parseEther("0.01"), delta: ethers.parseEther("0.07") }, // 1% and 7%
      StabilityRatio: ethers.parseEther("1.3055"), // 130.55%
    },
    BaseTokenCapacity: ethers.parseEther("10000"),
    FxUSDMintCapacity: ethers.parseEther("10000000"),
    ReservePoolBonusRatio: ethers.parseEther("0.05"), // 5%
  },
  sfrxETH: {
    FractionalToken: { name: "Fractional frxETH", symbol: "ffrxETH" },
    LeveragedToken: { name: "Leveraged frxETH", symbol: "xfrxETH" },
    Treasury: {
      HarvesterRatio: ethers.parseUnits("0.01", 9), // 1%,
      RebalancePoolRatio: ethers.parseUnits("0.5", 9), // 50%,
    },
    Market: {
      FractionalMintFeeRatio: { default: ethers.parseEther("0.0025"), delta: 0n }, // 0.25% and 0%
      LeveragedMintFeeRatio: { default: ethers.parseEther("0.01"), delta: -ethers.parseEther("0.01") }, // 1% and -1%
      FractionalRedeemFeeRatio: { default: ethers.parseEther("0.0025"), delta: -ethers.parseEther("0.0025") }, // 0.25% and -0.25%
      LeveragedRdeeemFeeRatio: { default: ethers.parseEther("0.01"), delta: ethers.parseEther("0.07") }, // 1% and 7%
      StabilityRatio: ethers.parseEther("1.3055"), // 130.55%
    },
    BaseTokenCapacity: ethers.parseEther("5000"),
    FxUSDMintCapacity: ethers.parseEther("10000000"),
    ReservePoolBonusRatio: ethers.parseEther("0.05"), // 5%
  },
};

export interface FxUSDDeployment {
  EmptyContract: string;
  FxUSDRebalancer: string;
  FxUSDShareableRebalancePool: string;
  Markets: {
    [baseToken: string]: {
      FractionalToken: {
        implementation: string;
        proxy: string;
      };
      LeveragedToken: {
        implementation: string;
        proxy: string;
      };
      Treasury: {
        implementation: string;
        proxy: string;
      };
      Market: {
        implementation: string;
        proxy: string;
      };
      FxInitialFund: string;
      RebalancePoolRegistry: string;
      RebalancePoolSplitter: string;
      RebalancePoolGauge: string;
      RebalancePoolGaugeClaimer: string;
      RebalancePool: {
        [reward: string]: {
          pool: string;
          wrapper?: string;
        };
      };
    };
  };
  FxUSD: {
    implementation: string;
    proxy: string;
  };
}

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
    await ethers.provider.call({
      to: await proxy.getAddress(),
      from: newAdmin,
      data: proxy.interface.encodeFunctionData("implementation"),
    });
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

async function deployMarket(deployment: DeploymentHelper, symbol: string) {
  const admin = selectDeployments(network.name, "ProxyAdmin").toObject() as ProxyAdminDeployment;
  const governance = await FxGovernance.deploy(deployment.deployer, deployment.overrides);
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
    "WrappedTokenTreasuryV2",
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
    "MarketV2",
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
    deployment.get("FxUSD.proxy"),
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
    deployment.get("FxUSDShareableRebalancePool"),
    admin.Fx,
    "0x"
  );
  // deploy rebalance pool whose liquidation reward is leveraged token
  selectorPrefix = `Markets.${symbol}.RebalancePool.${MarketConfig[symbol].LeveragedToken.symbol}`;
  await deployment.proxyDeploy(
    `${selectorPrefix}.pool`,
    `FxUSDShareableRebalancePool/${MarketConfig[symbol].LeveragedToken.symbol} Proxy`,
    deployment.get("FxUSDShareableRebalancePool"),
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

async function initializeMarket(
  deployer: HardhatEthersSigner,
  deployment: FxUSDDeployment,
  baseSymbol: string,
  overrides?: Overrides
) {
  const caller = new ContractCallHelper(deployer, overrides);
  const marketConfig = MarketConfig[baseSymbol];
  const marketDeployment = deployment.Markets[baseSymbol];
  const multisig = Multisig.deploy(network.name);
  const governance = await FxGovernance.deploy(deployer, overrides);
  const oracle = await FxOracle.deploy(deployer, overrides);

  const fToken = await ethers.getContractAt("FractionalTokenV2", marketDeployment.FractionalToken.proxy, deployer);
  const xToken = await ethers.getContractAt("LeveragedTokenV2", marketDeployment.LeveragedToken.proxy, deployer);
  const market = await ethers.getContractAt("MarketV2", marketDeployment.Market.proxy, deployer);
  const treasury = await ethers.getContractAt("WrappedTokenTreasuryV2", marketDeployment.Treasury.proxy, deployer);
  const fxUSDRebalancer = await ethers.getContractAt("FxUSDRebalancer", deployment.FxUSDRebalancer, deployer);
  const rebalancePoolRegistry = await ethers.getContractAt(
    "RebalancePoolRegistry",
    marketDeployment.RebalancePoolRegistry,
    deployer
  );
  const rebalancePoolSplitter = await ethers.getContractAt(
    "RebalancePoolSplitter",
    marketDeployment.RebalancePoolSplitter,
    deployer
  );
  const rebalancePoolGauge = await ethers.getContractAt(
    "FundraisingGaugeFx",
    marketDeployment.RebalancePoolGauge,
    deployer
  );
  const rebalancePoolA = await ethers.getContractAt(
    "FxUSDShareableRebalancePool",
    marketDeployment.RebalancePool[baseSymbol].pool,
    deployer
  );
  const rebalancePoolB = await ethers.getContractAt(
    "FxUSDShareableRebalancePool",
    marketDeployment.RebalancePool[MarketConfig[baseSymbol].LeveragedToken.symbol].pool,
    deployer
  );
  const controller = await ethers.getContractAt("GaugeController", governance.GaugeController, deployer);

  // initialize contract
  if ((await fToken.name()) !== marketConfig.FractionalToken.name) {
    await contractCall(fToken, `FractionalToken for ${baseSymbol} initialize`, "initialize", [
      marketConfig.FractionalToken.name,
      marketConfig.FractionalToken.symbol,
    ]);
  }
  if ((await xToken.name()) !== marketConfig.LeveragedToken.name) {
    await contractCall(xToken, `LeveragedToken for ${baseSymbol} initialize`, "initialize", [
      marketConfig.LeveragedToken.name,
      marketConfig.LeveragedToken.symbol,
    ]);
  }
  if ((await treasury.platform()) === ZeroAddress) {
    await contractCall(treasury, `Treasury for ${baseSymbol} initialize`, "initialize", [
      governance.PlatformFeeSpliter,
      marketDeployment.RebalancePoolSplitter,
      baseSymbol === "wstETH" ? oracle.WstETHRateProvider : oracle.ERC4626RateProvider.sfrxETH,
      baseSymbol === "wstETH" ? oracle.FxStETHTwapOracle : oracle.FxFrxETHTwapOracle,
      marketConfig.BaseTokenCapacity,
      60,
    ]);
  }
  if ((await market.platform()) === ZeroAddress) {
    await contractCall(market, `Market for ${baseSymbol} initialize`, "initialize", [
      governance.PlatformFeeSpliter,
      governance.ReservePool,
      marketDeployment.RebalancePoolRegistry,
    ]);
  }
  if ((await rebalancePoolGauge.last_checkpoint()) === 0n) {
    await contractCall(
      rebalancePoolGauge,
      `${marketConfig.FractionalToken.symbol} FxUSDShareableRebalancePool FundraiseGauge initialize`,
      "initialize",
      [marketDeployment.RebalancePoolGaugeClaimer, MaxUint256]
    );
  }
  await FxGovernance.addGauge(
    controller,
    `${marketConfig.FractionalToken.symbol} FxUSDShareableRebalancePool`,
    await rebalancePoolGauge.getAddress(),
    1
  );
  if ((await rebalancePoolA.treasury()) === ZeroAddress) {
    await contractCall(rebalancePoolA, `FxUSDShareableRebalancePool/${baseSymbol} initialize`, "initialize", [
      await treasury.getAddress(),
      await market.getAddress(),
      ZeroAddress,
    ]);
  }
  if ((await rebalancePoolB.treasury()) === ZeroAddress) {
    await contractCall(
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
    await ownerContractCall(treasury, `Treasury for ${baseSymbol} updateHarvesterRatio`, "updateHarvesterRatio", [
      marketConfig.Treasury.HarvesterRatio,
    ]);
  }
  if ((await treasury.getRebalancePoolRatio()) !== marketConfig.Treasury.RebalancePoolRatio) {
    await ownerContractCall(
      treasury,
      `Treasury for ${baseSymbol} updateRebalancePoolRatio`,
      "updateRebalancePoolRatio",
      [marketConfig.Treasury.RebalancePoolRatio]
    );
  }
  if (!(await treasury.hasRole(id("PROTOCOL_INITIALIZER_ROLE"), marketDeployment.FxInitialFund))) {
    await ownerContractCall(
      treasury,
      `Treasury for ${baseSymbol} grant PROTOCOL_INITIALIZER_ROLE`,
      "grantRole",
      [id("PROTOCOL_INITIALIZER_ROLE"), marketDeployment.FxInitialFund],
      overrides
    );
  }
  if (!(await treasury.hasRole(id("FX_MARKET_ROLE"), marketDeployment.Market.proxy))) {
    await ownerContractCall(
      treasury,
      `Treasury for ${baseSymbol} grant FX_MARKET_ROLE`,
      "grantRole",
      [id("FX_MARKET_ROLE"), marketDeployment.Market.proxy],
      overrides
    );
  }
  if ((await treasury.baseTokenCap()) !== marketConfig.BaseTokenCapacity) {
    await ownerContractCall(treasury, `Treasury for ${baseSymbol} updateBaseTokenCap`, "updateBaseTokenCap", [
      marketConfig.BaseTokenCapacity,
    ]);
  }

  // setup Market
  if ((await market.reservePool()) !== governance.ReservePool) {
    await ownerContractCall(
      treasury,
      "Market update reserve pool",
      "updateReservePool",
      [governance.ReservePool],
      overrides
    );
  }
  if ((await market.stabilityRatio()) !== marketConfig.Market.StabilityRatio) {
    await ownerContractCall(market, `Market for ${baseSymbol} updateStabilityRatio`, "updateStabilityRatio", [
      marketConfig.Market.StabilityRatio,
    ]);
  }
  const fTokenMintFeeRatio = await market.fTokenMintFeeRatio();
  if (
    fTokenMintFeeRatio.defaultFee !== marketConfig.Market.FractionalMintFeeRatio.default ||
    fTokenMintFeeRatio.deltaFee !== marketConfig.Market.FractionalMintFeeRatio.delta
  ) {
    await ownerContractCall(market, `Market for ${baseSymbol} updateMintFeeRatio fToken`, "updateMintFeeRatio", [
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
    await ownerContractCall(market, `Market for ${baseSymbol} updateMintFeeRatio xToken`, "updateMintFeeRatio", [
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
    await ownerContractCall(market, `Market for ${baseSymbol} updateRedeemFeeRatio fToken`, "updateRedeemFeeRatio", [
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
    await ownerContractCall(market, `Market for ${baseSymbol} updateRedeemFeeRatio xToken`, "updateRedeemFeeRatio", [
      marketConfig.Market.LeveragedRdeeemFeeRatio.default,
      marketConfig.Market.LeveragedRdeeemFeeRatio.delta,
      false,
    ]);
  }

  // enable fxUSD for market
  if ((await market.fxUSD()) === ZeroAddress) {
    await ownerContractCall(market, `Market for ${baseSymbol} enableFxUSD`, "enableFxUSD", [deployment.FxUSD.proxy]);
  }

  // Setup RebalancePoolRegistry
  const pools = await rebalancePoolRegistry.getPools();
  if (!pools.includes(await rebalancePoolA.getAddress())) {
    await ownerContractCall(
      rebalancePoolRegistry,
      `RebalancePoolRegistry register FxUSDShareableRebalancePool/${baseSymbol}`,
      "registerRebalancePool",
      [await rebalancePoolA.getAddress()],
      overrides
    );
  }
  if (!pools.includes(await rebalancePoolB.getAddress())) {
    await ownerContractCall(
      rebalancePoolRegistry,
      `RebalancePoolRegistry register FxUSDShareableRebalancePool/${marketConfig.LeveragedToken.symbol}`,
      "registerRebalancePool",
      [await rebalancePoolB.getAddress()],
      overrides
    );
  }

  // Setup FxUSDRebalancer
  const REBALANCE_POOL_ROLE = await fxUSDRebalancer.REBALANCE_POOL_ROLE();
  if ((await fxUSDRebalancer.bonus()) !== ethers.parseEther("1")) {
    await ownerContractCall(
      fxUSDRebalancer,
      "FxUSDRebalancer set bonus to 1 FXN",
      "updateBonus",
      [ethers.parseEther("1")],
      overrides
    );
  }
  if (!(await fxUSDRebalancer.hasRole(REBALANCE_POOL_ROLE, rebalancePoolA.getAddress()))) {
    await ownerContractCall(
      fxUSDRebalancer,
      `FxUSDRebalancer register FxUSDShareableRebalancePool/${marketConfig.LeveragedToken.symbol}`,
      "grantRole",
      [id("REBALANCE_POOL_ROLE"), await rebalancePoolA.getAddress()],
      overrides
    );
  }
  if (!(await fxUSDRebalancer.hasRole(REBALANCE_POOL_ROLE, rebalancePoolB.getAddress()))) {
    await ownerContractCall(
      fxUSDRebalancer,
      `FxUSDRebalancer register FxUSDShareableRebalancePool/${marketConfig.LeveragedToken.symbol}`,
      "grantRole",
      [id("REBALANCE_POOL_ROLE"), await rebalancePoolB.getAddress()],
      overrides
    );
  }

  const LIQUIDATOR_ROLE = await rebalancePoolA.LIQUIDATOR_ROLE();
  const WITHDRAW_FROM_ROLE = await rebalancePoolA.WITHDRAW_FROM_ROLE();
  // Setup Rebalance Pool A
  if (!(await rebalancePoolA.hasRole(LIQUIDATOR_ROLE, fxUSDRebalancer.getAddress()))) {
    await ownerContractCall(
      rebalancePoolA,
      `FxUSDShareableRebalancePool/${baseSymbol} add liquidator`,
      "grantRole",
      [LIQUIDATOR_ROLE, await fxUSDRebalancer.getAddress()],
      overrides
    );
  }
  if (!(await rebalancePoolA.hasRole(WITHDRAW_FROM_ROLE, deployment.FxUSD.proxy))) {
    await ownerContractCall(
      rebalancePoolA,
      `FxUSDShareableRebalancePool/${baseSymbol} grant WITHDRAW_FROM_ROLE to fxUSD`,
      "grantRole",
      [WITHDRAW_FROM_ROLE, deployment.FxUSD.proxy],
      overrides
    );
  }
  if ((await rebalancePoolA.distributors(TOKENS[baseSymbol].address)) === ZeroAddress) {
    await ownerContractCall(
      rebalancePoolA,
      `FxUSDShareableRebalancePool/${baseSymbol} add ${baseSymbol} as reward`,
      "registerRewardToken",
      [TOKENS[baseSymbol].address, marketDeployment.RebalancePoolSplitter],
      overrides
    );
  }
  if ((await rebalancePoolA.distributors(TOKENS.FXN.address)) === ZeroAddress) {
    await ownerContractCall(
      rebalancePoolA,
      `FxUSDShareableRebalancePool/${baseSymbol} add FXN as reward`,
      "registerRewardToken",
      [TOKENS.FXN.address, marketDeployment.RebalancePoolSplitter],
      overrides
    );
  }
  if ((await rebalancePoolA.liquidatableCollateralRatio()) !== marketConfig.Market.StabilityRatio) {
    await ownerContractCall(
      rebalancePoolA,
      `FxUSDShareableRebalancePool/${baseSymbol} update LiquidatableCollateralRatio`,
      "updateLiquidatableCollateralRatio",
      [marketConfig.Market.StabilityRatio],
      overrides
    );
  }

  // Setup Rebalance Pool B
  if (!(await rebalancePoolB.hasRole(LIQUIDATOR_ROLE, fxUSDRebalancer.getAddress()))) {
    await ownerContractCall(
      rebalancePoolB,
      `FxUSDShareableRebalancePool/${marketConfig.LeveragedToken.symbol} add liquidator`,
      "grantRole",
      [LIQUIDATOR_ROLE, await fxUSDRebalancer.getAddress()],
      overrides
    );
  }
  if (!(await rebalancePoolB.hasRole(WITHDRAW_FROM_ROLE, deployment.FxUSD.proxy))) {
    await ownerContractCall(
      rebalancePoolB,
      `FxUSDShareableRebalancePool/${marketConfig.LeveragedToken.symbol} grant WITHDRAW_FROM_ROLE to fxUSD`,
      "grantRole",
      [WITHDRAW_FROM_ROLE, deployment.FxUSD.proxy],
      overrides
    );
  }
  if ((await rebalancePoolB.distributors(TOKENS[baseSymbol].address)) === ZeroAddress) {
    await ownerContractCall(
      rebalancePoolB,
      `FxUSDShareableRebalancePool/${marketConfig.LeveragedToken.symbol} add ${baseSymbol} as reward`,
      "registerRewardToken",
      [TOKENS[baseSymbol].address, marketDeployment.RebalancePoolSplitter],
      overrides
    );
  }
  if ((await rebalancePoolB.distributors(TOKENS.FXN.address)) === ZeroAddress) {
    await ownerContractCall(
      rebalancePoolB,
      `FxUSDShareableRebalancePool/${marketConfig.LeveragedToken.symbol} add FXN as reward`,
      "registerRewardToken",
      [TOKENS.FXN.address, marketDeployment.RebalancePoolSplitter],
      overrides
    );
  }
  if ((await rebalancePoolB.distributors(marketDeployment.LeveragedToken.proxy)) === ZeroAddress) {
    await ownerContractCall(
      rebalancePoolB,
      `FxUSDShareableRebalancePool/${marketConfig.LeveragedToken.symbol} add ${marketDeployment.LeveragedToken.proxy} as reward`,
      "registerRewardToken",
      [marketDeployment.LeveragedToken.proxy, multisig.Fx],
      overrides
    );
  }
  if ((await rebalancePoolB.liquidatableCollateralRatio()) !== marketConfig.Market.StabilityRatio) {
    await ownerContractCall(
      rebalancePoolB,
      `FxUSDShareableRebalancePool/${marketConfig.LeveragedToken.symbol} update LiquidatableCollateralRatio`,
      "updateLiquidatableCollateralRatio",
      [marketConfig.Market.StabilityRatio],
      overrides
    );
  }
  if ((await rebalancePoolB.wrapper()) !== marketDeployment.RebalancePool[marketConfig.LeveragedToken.symbol].wrapper) {
    await ownerContractCall(
      rebalancePoolB,
      `FxUSDShareableRebalancePool/${marketConfig.LeveragedToken.symbol} update updateWrapper`,
      "updateWrapper",
      [marketDeployment.RebalancePool[marketConfig.LeveragedToken.symbol].wrapper],
      overrides
    );
  }

  const setupRebalancePoolSplitter = async (symbol: string, splitter: string) => {
    if ((await rebalancePoolSplitter.splitter(TOKENS[symbol].address)) !== splitter) {
      await ownerContractCall(
        rebalancePoolSplitter,
        "RebalancePoolSplitter set splitter for " + TOKENS[symbol].address,
        "setSplitter",
        [TOKENS[symbol].address, splitter],
        overrides
      );
    }
    const [receivers] = await rebalancePoolSplitter.getReceivers(TOKENS[symbol].address);
    if (receivers.length < 1) {
      await ownerContractCall(
        rebalancePoolSplitter,
        `RebalancePoolSplitter.${symbol} add FxUSDShareableRebalancePool/${baseSymbol}`,
        "registerReceiver",
        [TOKENS[symbol].address, await rebalancePoolA.getAddress(), [1e9]],
        overrides
      );
    }
    if (receivers.length < 2) {
      await ownerContractCall(
        rebalancePoolSplitter,
        `RebalancePoolSplitter.${symbol} add FxUSDShareableRebalancePool/${marketConfig.LeveragedToken.symbol}`,
        "registerReceiver",
        [TOKENS[symbol].address, await rebalancePoolB.getAddress(), [5e8, 5e8]],
        overrides
      );
    }
  };

  await setupRebalancePoolSplitter(baseSymbol, marketDeployment.Treasury.proxy);
  await setupRebalancePoolSplitter("FXN", marketDeployment.RebalancePoolGaugeClaimer);
}

export async function deploy(deployer: HardhatEthersSigner, overrides?: Overrides): Promise<FxUSDDeployment> {
  const admin = selectDeployments(network.name, "ProxyAdmin").toObject() as ProxyAdminDeployment;
  const governance = await FxGovernance.deploy(deployer, overrides);
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

  // deploy fxUSD
  await deployment.contractDeploy("FxUSD.implementation", "FxUSD implementation", "FxUSD", []);
  await deployment.proxyDeploy(
    "FxUSD.proxy",
    "FxUSD proxy",
    deployment.get("FxUSD.implementation"),
    admin.Fx,
    FxUSD__factory.createInterface().encodeFunctionData("initialize", ["f(x) USD", "fxUSD"])
  );

  // deploy markets
  await deployMarket(deployment, "wstETH");
  await deployMarket(deployment, "sfrxETH");

  return deployment.toObject() as FxUSDDeployment;
}

export async function initialize(deployer: HardhatEthersSigner, deployment: FxUSDDeployment, overrides?: Overrides) {
  const governance = await FxGovernance.deploy(deployer, overrides);

  await initializeMarket(deployer, deployment, "wstETH", overrides);
  await initializeMarket(deployer, deployment, "sfrxETH", overrides);

  const fxUSD = await ethers.getContractAt("FxUSD", deployment.FxUSD.proxy, deployer);
  const reservePool = await ethers.getContractAt("ReservePoolV2", governance.ReservePool, deployer);
  const platformFeeSpliter = await ethers.getContractAt("PlatformFeeSpliter", governance.PlatformFeeSpliter, deployer);

  // setup fxUSD
  const markets = await fxUSD.getMarkets();
  if (!markets.includes(getAddress(TOKENS.wstETH.address))) {
    await ownerContractCall(fxUSD, "add wstETH to fxUSD", "addMarket", [
      deployment.Markets.wstETH.Market.proxy,
      MarketConfig.wstETH.FxUSDMintCapacity,
    ]);
  }
  if (!markets.includes(getAddress(TOKENS.sfrxETH.address))) {
    await ownerContractCall(fxUSD, "add sfrxETH to fxUSD", "addMarket", [
      deployment.Markets.sfrxETH.Market.proxy,
      MarketConfig.sfrxETH.FxUSDMintCapacity,
    ]);
  }
  if ((await fxUSD.markets(TOKENS.wstETH.address)).mintCap !== MarketConfig.wstETH.FxUSDMintCapacity) {
    await ownerContractCall(fxUSD, "fxUSD updateMintCap for wstETH", "updateMintCap", [
      TOKENS.wstETH.address,
      MarketConfig.wstETH.FxUSDMintCapacity,
    ]);
  }
  if ((await fxUSD.markets(TOKENS.sfrxETH.address)).mintCap !== MarketConfig.sfrxETH.FxUSDMintCapacity) {
    await ownerContractCall(fxUSD, "fxUSD updateMintCap for sfrxETH", "updateMintCap", [
      TOKENS.sfrxETH.address,
      MarketConfig.sfrxETH.FxUSDMintCapacity,
    ]);
  }
  const pools = await fxUSD.getRebalancePools();
  const poolsToAdd = [];
  for (const pool of [
    deployment.Markets.wstETH.RebalancePool.wstETH.pool,
    deployment.Markets.wstETH.RebalancePool.xstETH.pool,
    deployment.Markets.sfrxETH.RebalancePool.sfrxETH.pool,
    deployment.Markets.sfrxETH.RebalancePool.xfrxETH.pool,
  ]) {
    if (!pools.includes(getAddress(pool))) poolsToAdd.push(pool);
  }
  if (poolsToAdd.length > 0) {
    await ownerContractCall(fxUSD, "addRebalancePools", "addRebalancePools", [poolsToAdd]);
  }

  // Setup ReservePool
  if ((await reservePool.bonusRatio(TOKENS.wstETH.address)) !== MarketConfig.wstETH.ReservePoolBonusRatio) {
    await ownerContractCall(
      reservePool,
      "ReservePool updateBonusRatio for wstETH",
      "updateBonusRatio",
      [TOKENS.wstETH.address, MarketConfig.wstETH.ReservePoolBonusRatio],
      overrides
    );
    if ((await reservePool.bonusRatio(TOKENS.sfrxETH.address)) !== MarketConfig.sfrxETH.ReservePoolBonusRatio) {
      await ownerContractCall(
        reservePool,
        "ReservePool updateBonusRatio for sfrxETH",
        "updateBonusRatio",
        [TOKENS.sfrxETH.address, MarketConfig.sfrxETH.ReservePoolBonusRatio],
        overrides
      );
    }
  }
  if (!(await reservePool.hasRole(id("MARKET_ROLE"), deployment.Markets.wstETH.Market.proxy))) {
    await ownerContractCall(
      reservePool,
      "reservePool add wstETH Market",
      "grantRole",
      [id("MARKET_ROLE"), deployment.Markets.wstETH.Market.proxy],
      overrides
    );
  }
  if (!(await reservePool.hasRole(id("MARKET_ROLE"), deployment.Markets.sfrxETH.Market.proxy))) {
    await ownerContractCall(
      reservePool,
      "reservePool add sfrxETH Market",
      "grantRole",
      [id("MARKET_ROLE"), deployment.Markets.sfrxETH.Market.proxy],
      overrides
    );
  }

  // Setup PlatformFeeSpliter
  const length = await platformFeeSpliter.getRewardCount();
  const rewardToken: Array<string> = [];
  for (let i = 0; i < length; i++) {
    rewardToken.push((await platformFeeSpliter.rewards(i)).token);
  }
  if (!rewardToken.includes(getAddress(TOKENS.wstETH.address))) {
    await ownerContractCall(
      platformFeeSpliter,
      "PlatformFeeSpliter add wstETH",
      "addRewardToken",
      [
        TOKENS.wstETH.address,
        governance.FeeDistributor.wstETH,
        0n,
        ethers.parseUnits("0.25", 9),
        ethers.parseUnits("0.75", 9),
      ],
      overrides
    );
  }
  if (!rewardToken.includes(getAddress(TOKENS.sfrxETH.address))) {
    await ownerContractCall(
      platformFeeSpliter,
      "PlatformFeeSpliter add sfrxETH",
      "addRewardToken",
      [
        TOKENS.sfrxETH.address,
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
