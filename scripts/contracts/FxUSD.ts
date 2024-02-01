/* eslint-disable camelcase */
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { MaxUint256, Overrides, ZeroAddress, getAddress, id } from "ethers";
import { network, ethers } from "hardhat";

import { FxUSD__factory } from "@/types/index";
import { TOKENS, same } from "@/utils/index";

import { DeploymentHelper, abiDecode, contractCall, ownerContractCall } from "./helpers";
import * as FxGovernance from "./FxGovernance";
import * as Multisig from "./Multisig";
import * as ProxyAdmin from "./ProxyAdmin";
import * as FxOracle from "./FxOracle";

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
    MintCapacity: bigint;
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
    MintCapacity: ethers.parseEther("1000000"),
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
    MintCapacity: ethers.parseEther("1000000"),
    ReservePoolBonusRatio: ethers.parseEther("0.05"), // 5%
  },
};

export interface FxUSDDeployment {
  EmptyContract: string;
  RebalancePoolSplitter: string;
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
      RebalancePoolRegistry: string;
      RebalancePool: {
        [reward: string]: {
          gauge: string;
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
  const admin = await ProxyAdmin.deploy(deployment.deployer);
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

  // deploy registry
  await deployment.contractDeploy(
    `${selectorPrefix}.RebalancePoolRegistry`,
    `RebalancePoolRegistry for ${symbol}`,
    "RebalancePoolRegistry",
    []
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
  await deployment.minimalProxyDeploy(
    `${selectorPrefix}.gauge`,
    `FxUSDShareableRebalancePool/${symbol} FundraiseGauge`,
    governance.FundraiseGauge.implementation.FundraisingGaugeFx
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
  await deployment.minimalProxyDeploy(
    `${selectorPrefix}.gauge`,
    `FxUSDShareableRebalancePool/${MarketConfig[symbol].LeveragedToken.symbol} FundraiseGauge`,
    governance.FundraiseGauge.implementation.FundraisingGaugeFx
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
  const rebalancePoolA = await ethers.getContractAt(
    "FxUSDShareableRebalancePool",
    marketDeployment.RebalancePool[baseSymbol].pool,
    deployer
  );
  const rebalancePoolGaugeA = await ethers.getContractAt(
    "FundraisingGaugeFx",
    marketDeployment.RebalancePool[baseSymbol].gauge,
    deployer
  );
  const rebalancePoolB = await ethers.getContractAt(
    "FxUSDShareableRebalancePool",
    marketDeployment.RebalancePool[MarketConfig[baseSymbol].LeveragedToken.symbol].pool,
    deployer
  );
  const rebalancePoolGaugeB = await ethers.getContractAt(
    "FundraisingGaugeFx",
    marketDeployment.RebalancePool[MarketConfig[baseSymbol].LeveragedToken.symbol].gauge,
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
      deployment.RebalancePoolSplitter,
      baseSymbol === "wstETH" ? oracle.WstETHRateProvider : oracle.ERC4626RateProvider.sfrxETH,
      baseSymbol === "wstETH" ? oracle.FxStETHTwapOracle : oracle.FxFrxETHTwapOracle,
      ethers.parseEther("10000"),
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
  if ((await rebalancePoolGaugeA.last_checkpoint()) === 0n) {
    await contractCall(
      rebalancePoolGaugeA,
      `FxUSDShareableRebalancePool/${baseSymbol} FundraiseGauge initialize`,
      "initialize",
      [await rebalancePoolA.getAddress(), MaxUint256]
    );
  }
  await FxGovernance.addGauge(
    controller,
    `FxUSDShareableRebalancePool/${baseSymbol}`,
    await rebalancePoolGaugeA.getAddress(),
    1
  );
  if ((await rebalancePoolA.treasury()) === ZeroAddress) {
    await contractCall(rebalancePoolA, `FxUSDShareableRebalancePool/${baseSymbol} initialize`, "initialize", [
      await treasury.getAddress(),
      await market.getAddress(),
      marketDeployment.RebalancePool[baseSymbol].gauge,
    ]);
  }
  if ((await rebalancePoolGaugeB.last_checkpoint()) === 0n) {
    await contractCall(
      rebalancePoolGaugeB,
      `FxUSDShareableRebalancePool/${marketConfig.LeveragedToken.symbol} FundraiseGauge initialize`,
      "initialize",
      [await rebalancePoolB.getAddress(), MaxUint256]
    );
  }
  await FxGovernance.addGauge(
    controller,
    `FxUSDShareableRebalancePool/${marketConfig.LeveragedToken.symbol}`,
    await rebalancePoolGaugeB.getAddress(),
    1
  );
  if ((await rebalancePoolB.treasury()) === ZeroAddress) {
    await contractCall(
      rebalancePoolB,
      `FxUSDShareableRebalancePool/${marketConfig.LeveragedToken.symbol} initialize`,
      "initialize",
      [
        await treasury.getAddress(),
        await market.getAddress(),
        marketDeployment.RebalancePool[marketConfig.LeveragedToken.symbol].gauge,
      ]
    );
  }

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
  if ((await rebalancePoolA.distributors(TOKENS[baseSymbol].address)) === ZeroAddress) {
    await ownerContractCall(
      rebalancePoolA,
      `FxUSDShareableRebalancePool/${baseSymbol} add ${baseSymbol} as reward`,
      "registerRewardToken",
      [TOKENS[baseSymbol].address, deployment.RebalancePoolSplitter],
      overrides
    );
  }
  if ((await rebalancePoolA.distributors(TOKENS.FXN.address)) === ZeroAddress) {
    await ownerContractCall(
      rebalancePoolA,
      `FxUSDShareableRebalancePool/${baseSymbol} add FXN as reward`,
      "registerRewardToken",
      [TOKENS.FXN.address, multisig.Fx],
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
  if ((await rebalancePoolB.distributors(TOKENS[baseSymbol].address)) === ZeroAddress) {
    await ownerContractCall(
      rebalancePoolB,
      `FxUSDShareableRebalancePool/${marketConfig.LeveragedToken.symbol} add ${baseSymbol} as reward`,
      "registerRewardToken",
      [TOKENS[baseSymbol].address, deployment.RebalancePoolSplitter],
      overrides
    );
  }
  if ((await rebalancePoolB.distributors(TOKENS.FXN.address)) === ZeroAddress) {
    await ownerContractCall(
      rebalancePoolB,
      `FxUSDShareableRebalancePool/${marketConfig.LeveragedToken.symbol} add FXN as reward`,
      "registerRewardToken",
      [TOKENS.FXN.address, multisig.Fx],
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
}

export async function deploy(deployer: HardhatEthersSigner, overrides?: Overrides): Promise<FxUSDDeployment> {
  const admin = await ProxyAdmin.deploy(deployer);
  const governance = await FxGovernance.deploy(deployer, overrides);
  const deployment = new DeploymentHelper(network.name, "Fx.FxUSD", deployer, overrides);

  // deploy placeholder
  await deployment.contractDeploy("EmptyContract", "EmptyContract", "EmptyContract", []);
  // deploy RebalancePoolSplitter
  await deployment.contractDeploy("RebalancePoolSplitter", "RebalancePoolSplitter", "RebalancePoolSplitter", []);
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
      MarketConfig.wstETH.MintCapacity,
    ]);
  }
  if (!markets.includes(getAddress(TOKENS.sfrxETH.address))) {
    await ownerContractCall(fxUSD, "add sfrxETH to fxUSD", "addMarket", [
      deployment.Markets.sfrxETH.Market.proxy,
      MarketConfig.sfrxETH.MintCapacity,
    ]);
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
