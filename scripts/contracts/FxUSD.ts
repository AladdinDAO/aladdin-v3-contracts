/* eslint-disable camelcase */
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { Overrides, ZeroAddress, getAddress } from "ethers";
import { network, ethers } from "hardhat";

import { FxUSD__factory } from "@/types/index";
import { TOKENS, same } from "@/utils/index";

import { DeploymentHelper, abiDecode, contractCall, ownerContractCall } from "./helpers";
import * as FxGovernance from "./FxGovernance";
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
  },
};

export interface FxUSDDeployment {
  EmptyContract: string;
  RebalancePoolSplitter: string;
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
      RebalancePool: {
        implementation: string;
        splitter: string;
        claimer: string;
        gauge: string;
        APool: string;
        BPool: string;
        APoolRebalancer: string;
        BPoolRebalancer: string;
      };
      ReservePool: string;
      RebalancePoolRegistry: string;
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
  const baseToken = TOKENS[symbol].address;

  // deploy proxies
  await deployment.proxyDeploy(
    `Markets.${symbol}.Treasury.proxy`,
    `Treasury proxy for ${symbol}`,
    deployment.get("EmptyContract"),
    deployment.deployer.address,
    "0x"
  );
  await deployment.proxyDeploy(
    `Markets.${symbol}.Market.proxy`,
    `Market for ${symbol}`,
    deployment.get("EmptyContract"),
    deployment.deployer.address,
    "0x"
  );
  await deployment.proxyDeploy(
    `Markets.${symbol}.FractionalToken.proxy`,
    `FractionalToken for ${symbol}`,
    deployment.get("EmptyContract"),
    deployment.deployer.address,
    "0x"
  );
  await deployment.proxyDeploy(
    `Markets.${symbol}.LeveragedToken.proxy`,
    `LeveragedToken for ${symbol}`,
    deployment.get("EmptyContract"),
    deployment.deployer.address,
    "0x"
  );

  // deploy implementations
  await deployment.contractDeploy(
    `Markets.${symbol}.Treasury.implementation`,
    `Treasury implementation for ${symbol}`,
    "WrappedTokenTreasuryV2",
    [
      baseToken,
      deployment.get(`Markets.${symbol}.FractionalToken.proxy`),
      deployment.get(`Markets.${symbol}.LeveragedToken.proxy`),
    ]
  );
  await doUpgrade(
    deployment.deployer,
    `Treasury for ${symbol}`,
    deployment.get(`Markets.${symbol}.Treasury.proxy`),
    deployment.get(`Markets.${symbol}.Treasury.implementation`),
    admin.Fx
  );
  await deployment.contractDeploy(
    `Markets.${symbol}.Market.implementation`,
    `Market implementation for ${symbol}`,
    "MarketV2",
    [deployment.get(`Markets.${symbol}.Treasury.proxy`)]
  );
  await doUpgrade(
    deployment.deployer,
    `Market for ${symbol}`,
    deployment.get(`Markets.${symbol}.Market.proxy`),
    deployment.get(`Markets.${symbol}.Market.implementation`),
    admin.Fx
  );
  await deployment.contractDeploy(
    `Markets.${symbol}.FractionalToken.implementation`,
    `FractionalToken implementation for ${symbol}`,
    "FractionalTokenV2",
    [deployment.get(`Markets.${symbol}.Treasury.proxy`)]
  );
  await doUpgrade(
    deployment.deployer,
    `FractionalToken for ${symbol}`,
    deployment.get(`Markets.${symbol}.FractionalToken.proxy`),
    deployment.get(`Markets.${symbol}.FractionalToken.implementation`),
    admin.Fx
  );
  await deployment.contractDeploy(
    `Markets.${symbol}.LeveragedToken.implementation`,
    `LeveragedToken implementation for ${symbol}`,
    "LeveragedTokenV2",
    [deployment.get(`Markets.${symbol}.Treasury.proxy`), deployment.get(`Markets.${symbol}.FractionalToken.proxy`)]
  );
  await doUpgrade(
    deployment.deployer,
    `LeveragedToken for ${symbol}`,
    deployment.get(`Markets.${symbol}.LeveragedToken.proxy`),
    deployment.get(`Markets.${symbol}.LeveragedToken.implementation`),
    admin.Fx
  );

  // deploy reserve pool
  await deployment.contractDeploy(`Markets.${symbol}.ReservePool`, `ReservePool for ${symbol}`, "ReservePool", [
    deployment.get(`Markets.${symbol}.Market.proxy`),
    deployment.get(`Markets.${symbol}.FractionalToken.proxy`),
  ]);

  // deploy registry
  await deployment.contractDeploy(
    `Markets.${symbol}.RebalancePoolRegistry`,
    `RebalancePoolRegistry for ${symbol}`,
    "RebalancePoolRegistry",
    []
  );
}

async function initializeMarket(
  deployer: HardhatEthersSigner,
  deployment: FxUSDDeployment,
  baseSymbol: string,
  overrides?: Overrides
) {
  const marketConfig = MarketConfig[baseSymbol];
  const governance = await FxGovernance.deploy(deployer, overrides);
  const oracle = await FxOracle.deploy(deployer, overrides);

  const fToken = await ethers.getContractAt(
    "FractionalTokenV2",
    deployment.Markets[baseSymbol].FractionalToken.proxy,
    deployer
  );
  const xToken = await ethers.getContractAt(
    "LeveragedTokenV2",
    deployment.Markets[baseSymbol].LeveragedToken.proxy,
    deployer
  );
  const market = await ethers.getContractAt("MarketV2", deployment.Markets[baseSymbol].Market.proxy, deployer);
  const treasury = await ethers.getContractAt(
    "WrappedTokenTreasuryV2",
    deployment.Markets[baseSymbol].Treasury.proxy,
    deployer
  );

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
      deployment.Markets[baseSymbol].ReservePool,
      deployment.Markets[baseSymbol].RebalancePoolRegistry,
    ]);
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
}

export async function deploy(deployer: HardhatEthersSigner, overrides?: Overrides): Promise<FxUSDDeployment> {
  const admin = await ProxyAdmin.deploy(deployer);
  const deployment = new DeploymentHelper(network.name, "Fx.FxUSD", deployer, overrides);

  // deploy placeholder
  await deployment.contractDeploy("EmptyContract", "EmptyContract", "EmptyContract", []);

  // deploy RebalancePoolSplitter
  await deployment.contractDeploy("RebalancePoolSplitter", "RebalancePoolSplitter", "RebalancePoolSplitter", []);

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
  await initializeMarket(deployer, deployment, "wstETH", overrides);
  await initializeMarket(deployer, deployment, "sfrxETH", overrides);

  const fxUSD = await ethers.getContractAt("FxUSD", deployment.FxUSD.proxy, deployer);
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
}
