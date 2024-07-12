import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { Overrides } from "ethers";
import { network } from "hardhat";

import {
  FxCVXOracle,
  FxEETHOracleV2,
  FxEzETHOracleV2,
  FxFrxETHOracleV2,
  FxStETHOracleV2,
  FxWBTCOracleV2,
} from "@/types/index";
import { ADDRESS, SpotPriceEncodings, TOKENS, encodeChainlinkPriceFeed } from "@/utils/index";
import { ContractCallHelper, DeploymentHelper } from "./helpers";

const ChainlinkPriceFeed: {
  [name: string]: {
    feed: string;
    heartbeat: number;
  };
} = {
  "CVX-USD": {
    feed: "0xd962fC30A72A84cE50161031391756Bf2876Af5D",
    heartbeat: (86400 * 3) / 2, // 1.5 multiple
  },
  "ETH-USD": {
    feed: "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419",
    heartbeat: 3600 * 3, // 3 multiple
  },
  "stETH-USD": {
    feed: "0xCfE54B5cD566aB89272946F602D76Ea879CAb4a8",
    heartbeat: 3600 * 3, // 3 multiple
  },
  "BTC-USD": {
    feed: "0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c",
    heartbeat: 3600 * 3, // 3 multiple
  },
  "WBTC-BTC": {
    feed: "0xfdFD9C85aD200c506Cf9e21F1FD8dd01932FBB23",
    heartbeat: (86400 * 3) / 2, // 1.5 multiple
  },
};

const RedStonePriceFeed: {
  [name: string]: {
    feed: string;
    heartbeat: number;
  };
} = {
  "weETH-ETH": {
    feed: "0x8751F736E94F6CD167e8C5B97E245680FbD9CC36",
    heartbeat: (86400 * 3) / 2, // 1.5 multiple
  },
  "ezETH-ETH": {
    feed: "0xF4a3e183F59D2599ee3DF213ff78b1B3b1923696",
    heartbeat: 43200 * 3, // 3 multiple
  },
};

export interface FxOracleDeployment {
  ChainlinkTwapOracle: { [name: string]: string };
  RedStoneTwapOracle: { [name: string]: string };
  FxStETHTwapOracle: string;
  FxFrxETHTwapOracle: string;
  FxEETHTwapOracle: string;
  FxEzETHTwapOracle: string;
  FxWBTCTwapOracle: string;

  SpotPriceOracle: string;
  FxStETHOracleV2: string;
  FxFrxETHOracleV2: string;
  FxEETHOracleV2: string;
  FxEzETHOracleV2: string;
  FxWBTCOracleV2: string;
  FxCVXOracle: string;

  WstETHRateProvider: string;
  BalancerV2CachedRateProvider: {
    ezETH: string;
  };
  ERC4626RateProvider: {
    sfrxETH: string;
    apxETH: string;
    aCVX: string;
  };
}

export async function deploy(deployer: HardhatEthersSigner, overrides?: Overrides): Promise<FxOracleDeployment> {
  const deployment = new DeploymentHelper(network.name, "Fx.Oracle", deployer, overrides);

  // deploy Chainlink twap oracle
  for (const symbol of ["ETH-USD", "BTC-USD", "WBTC-BTC", "CVX-USD"]) {
    await deployment.contractDeploy(
      "FxChainlinkTwapOracle." + symbol,
      "FxChainlinkTwapOracle for " + symbol,
      "FxChainlinkTwapOracle",
      [60 * 30, ChainlinkPriceFeed[symbol].feed, 1, ChainlinkPriceFeed[symbol].heartbeat, symbol]
    );
  }
  // deploy RedStone twap oracle
  for (const symbol of ["weETH-ETH", "ezETH-ETH"]) {
    await deployment.contractDeploy(
      "FxChainlinkTwapOracle." + symbol,
      "FxChainlinkTwapOracle for " + symbol,
      "FxChainlinkTwapOracle",
      [60 * 30, RedStonePriceFeed[symbol].feed, 1, RedStonePriceFeed[symbol].heartbeat, symbol]
    );
  }

  // deploy SpotPriceOracle
  await deployment.contractDeploy("SpotPriceOracle", "SpotPriceOracle", "SpotPriceOracle", []);

  // deploy FxStETHOracleV2
  await deployment.contractDeploy("FxStETHOracleV2", "FxStETHOracleV2", "FxStETHOracleV2", [
    deployment.get("SpotPriceOracle"),
    "0x" +
      encodeChainlinkPriceFeed(ChainlinkPriceFeed["ETH-USD"].feed, 10n ** 10n, ChainlinkPriceFeed["ETH-USD"].heartbeat)
        .toString(16)
        .padStart(64, "0"),
    deployment.get("FxChainlinkTwapOracle.ETH-USD"),
    ADDRESS["CRV_PLAIN_ETH/stETH_303_POOL"],
  ]);

  // deploy FxFrxETHOracleV2
  await deployment.contractDeploy("FxFrxETHOracleV2", "FxFrxETHOracleV2", "FxFrxETHOracleV2", [
    deployment.get("SpotPriceOracle"),
    "0x" +
      encodeChainlinkPriceFeed(ChainlinkPriceFeed["ETH-USD"].feed, 10n ** 10n, ChainlinkPriceFeed["ETH-USD"].heartbeat)
        .toString(16)
        .padStart(64, "0"),
    deployment.get("FxChainlinkTwapOracle.ETH-USD"),
    ADDRESS["CURVE_CRVUSD_WETH/frxETH_15_POOL"],
  ]);

  // deploy FxEETHOracleV2
  await deployment.contractDeploy("FxEETHOracleV2", "FxEETHOracleV2", "FxEETHOracleV2", [
    deployment.get("SpotPriceOracle"),
    "0x" +
      encodeChainlinkPriceFeed(ChainlinkPriceFeed["ETH-USD"].feed, 10n ** 10n, ChainlinkPriceFeed["ETH-USD"].heartbeat)
        .toString(16)
        .padStart(64, "0"),
    deployment.get("FxChainlinkTwapOracle.ETH-USD"),
    deployment.get("FxChainlinkTwapOracle.weETH-ETH"),
  ]);

  // deploy FxEzETHOracleV2
  await deployment.contractDeploy("FxEzETHOracleV2", "FxEzETHOracleV2", "FxEzETHOracleV2", [
    deployment.get("SpotPriceOracle"),
    "0x" +
      encodeChainlinkPriceFeed(ChainlinkPriceFeed["ETH-USD"].feed, 10n ** 10n, ChainlinkPriceFeed["ETH-USD"].heartbeat)
        .toString(16)
        .padStart(64, "0"),
    deployment.get("FxChainlinkTwapOracle.ETH-USD"),
    ADDRESS["BalancerV2_ezETH/WETH_Stable"],
    deployment.get("FxChainlinkTwapOracle.ezETH-ETH"),
  ]);

  // deploy FxWBTCOracleV2
  await deployment.contractDeploy("FxWBTCOracleV2", "FxWBTCOracleV2", "FxWBTCOracleV2", [
    deployment.get("SpotPriceOracle"),
    deployment.get("FxChainlinkTwapOracle.BTC-USD"),
    deployment.get("FxChainlinkTwapOracle.WBTC-BTC"),
  ]);

  // deploy FxCVXOracle
  await deployment.contractDeploy("FxCVXOracle", "FxCVXOracle", "FxCVXOracle", [
    deployment.get("SpotPriceOracle"),
    "0x" +
      encodeChainlinkPriceFeed(ChainlinkPriceFeed["ETH-USD"].feed, 10n ** 10n, ChainlinkPriceFeed["ETH-USD"].heartbeat)
        .toString(16)
        .padStart(64, "0"),
    deployment.get("FxChainlinkTwapOracle.ETH-USD"),
    deployment.get("FxChainlinkTwapOracle.CVX-USD"),
  ]);

  // deploy WstETHRateProvider
  await deployment.contractDeploy("WstETHRateProvider", "WstETHRateProvider", "WstETHRateProvider", [
    TOKENS.wstETH.address,
  ]);

  // deploy BalancerV2CachedRateProvider ezETH
  await deployment.contractDeploy(
    "BalancerV2CachedRateProvider.ezETH",
    "BalancerV2CachedRateProvider for ezETH",
    "BalancerV2CachedRateProvider",
    [ADDRESS["BalancerV2_ezETH/WETH_Stable"], TOKENS.ezETH.address]
  );

  // deploy ERC4626RateProvider sfrxETH
  await deployment.contractDeploy(
    "ERC4626RateProvider.sfrxETH",
    "ERC4626RateProvider for sfrxETH",
    "ERC4626RateProvider",
    [TOKENS.sfrxETH.address]
  );

  // deploy ERC4626RateProvider aCVX
  await deployment.contractDeploy("ERC4626RateProvider.aCVX", "ERC4626RateProvider for aCVX", "ERC4626RateProvider", [
    TOKENS.aCVX.address,
  ]);

  return deployment.toObject() as FxOracleDeployment;
}

export async function initialize(deployer: HardhatEthersSigner, deployment: FxOracleDeployment, overrides?: Overrides) {
  const caller = new ContractCallHelper(deployer, overrides);

  const stETHOracle = await caller.contract<FxStETHOracleV2>("FxStETHOracleV2", deployment.FxStETHOracleV2);
  if ((await stETHOracle.getETHUSDSpotPrices()).length === 0) {
    await caller.call(stETHOracle, "FxStETHOracleV2 Update ETH/USD encodings", "updateOnchainSpotEncodings", [
      SpotPriceEncodings["WETH/USDC"],
      0,
    ]);
  }
  if ((await stETHOracle.getLSDETHSpotPrices()).length === 0) {
    await caller.call(stETHOracle, "FxStETHOracleV2 Update stETH/ETH encodings", "updateOnchainSpotEncodings", [
      SpotPriceEncodings["stETH/WETH"],
      1,
    ]);
  }

  const frxETHOracle = await caller.contract<FxFrxETHOracleV2>("FxFrxETHOracleV2", deployment.FxFrxETHOracleV2);
  if ((await frxETHOracle.getETHUSDSpotPrices()).length === 0) {
    caller.overrides!.nonce = 821;
    await caller.call(frxETHOracle, "FxFrxETHOracleV2 Update ETH/USD encodings", "updateOnchainSpotEncodings", [
      SpotPriceEncodings["WETH/USDC"],
      0,
    ]);
    caller.overrides!.nonce = undefined;
  }
  if ((await frxETHOracle.getLSDETHSpotPrices()).length === 0) {
    await caller.call(frxETHOracle, "FxFrxETHOracleV2 Update frxETH/ETH encodings", "updateOnchainSpotEncodings", [
      SpotPriceEncodings["frxETH/WETH"],
      1,
    ]);
  }

  const eETHOracle = await caller.contract<FxEETHOracleV2>("FxEETHOracleV2", deployment.FxEETHOracleV2);
  if ((await eETHOracle.getETHUSDSpotPrices()).length === 0) {
    await caller.call(eETHOracle, "FxEETHOracleV2 Update ETH/USD encodings", "updateOnchainSpotEncodings", [
      SpotPriceEncodings["WETH/USDC"],
      0,
    ]);
  }
  if ((await eETHOracle.getLSDETHSpotPrices()).length === 0) {
    await caller.call(eETHOracle, "FxEETHOracleV2 Update eETH/ETH encodings", "updateOnchainSpotEncodings", [
      SpotPriceEncodings["eETH/WETH"],
      1,
    ]);
  }

  const ezETHOracle = await caller.contract<FxEzETHOracleV2>("FxEzETHOracleV2", deployment.FxEzETHOracleV2);
  if ((await ezETHOracle.getETHUSDSpotPrices()).length === 0) {
    await caller.call(ezETHOracle, "FxEzETHOracleV2 Update ETH/USD encodings", "updateOnchainSpotEncodings", [
      SpotPriceEncodings["WETH/USDC"],
      0,
    ]);
  }
  if ((await ezETHOracle.getLSDETHSpotPrices()).length === 0) {
    await caller.call(ezETHOracle, "FxEzETHOracleV2 Update ezETH/ETH encodings", "updateOnchainSpotEncodings", [
      SpotPriceEncodings["ezETH/WETH"],
      1,
    ]);
  }

  const WBTCOracle = await caller.contract<FxWBTCOracleV2>("FxWBTCOracleV2", deployment.FxWBTCOracleV2);
  if ((await WBTCOracle.getBTCDerivativeUSDSpotPrices()).length === 0) {
    await caller.call(WBTCOracle, "FxWBTCOracleV2 Update WBTC/USD encodings", "updateOnchainSpotEncodings", [
      SpotPriceEncodings["WBTC/USDC"],
    ]);
  }

  const CVXOracle = await caller.contract<FxCVXOracle>("FxCVXOracle", deployment.FxCVXOracle);
  if ((await CVXOracle.getETHUSDSpotPrices()).length === 0) {
    await caller.call(CVXOracle, "FxCVXOracle Update ETH/USD encodings", "updateOnchainSpotEncodings", [
      SpotPriceEncodings["WETH/USDC"],
      0,
    ]);
  }
  if ((await CVXOracle.getERC20ETHSpotPrices()).length === 0) {
    await caller.call(CVXOracle, "FxCVXOracle Update CVX/ETH encodings", "updateOnchainSpotEncodings", [
      SpotPriceEncodings["CVX/WETH"],
      1,
    ]);
  }
}
