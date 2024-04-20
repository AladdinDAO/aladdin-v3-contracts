import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { Overrides } from "ethers";
import { network } from "hardhat";

import { DeploymentHelper } from "./helpers";
import { ADDRESS, TOKENS } from "../utils";

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

/*
const RedStonePriceFeed: { [name: string]: string } = {
  weETH: "0xdDb6F90fFb4d3257dd666b69178e5B3c5Bf41136", // weETH-USD
  ezETH: "0xF4a3e183F59D2599ee3DF213ff78b1B3b1923696", // ezETH/ETH
};
*/

export interface FxOracleDeployment {
  ChainlinkTwapOracle: {
    ETH: string;
    stETH: string;
  };
  RedStoneTwapOracle: {
    ezETH: string;
  };
  FxStETHTwapOracle: string;
  FxFrxETHTwapOracle: string;
  FxEETHTwapOracle: string;
  FxPxETHTwapOracle: string;
  FxEzETHTwapOracle: string;
  FxCVXTwapOracle: string;
  FxWBTCTwapOracle: string;

  WstETHRateProvider: string;
  ERC4626RateProvider: {
    sfrxETH: string;
    apxETH: string;
    aCVX: string;
  };
}

export async function deploy(deployer: HardhatEthersSigner, overrides?: Overrides): Promise<FxOracleDeployment> {
  const deployment = new DeploymentHelper(network.name, "Fx.Oracle", deployer, overrides);

  // deploy chainlink twap oracle
  for (const symbol of ["ETH-USD", "stETH-USD", "BTC-USD", "WBTC-BTC"]) {
    await deployment.contractDeploy(
      "FxChainlinkTwapOracle." + symbol,
      "FxChainlinkTwapOracle for " + symbol,
      "FxChainlinkTwapOracle",
      [60 * 30, ChainlinkPriceFeed[symbol].feed, 1, ChainlinkPriceFeed[symbol].heartbeat, symbol]
    );
  }

  /*
  // deploy redstone twap oracle
  for (const symbol of ["ezETH"]) {
    await deployment.contractDeploy(
      "RedStoneTwapOracle." + symbol,
      "RedStoneTwapOracle for " + symbol,
      "ChainlinkTwapOracleV3",
      [RedStonePriceFeed[symbol], 1, 10800, symbol]
    );
  }
  */

  // deploy FxStETHTwapOracle
  await deployment.contractDeploy("FxStETHTwapOracle", "FxStETHTwapOracle", "FxStETHTwapOracle", [
    deployment.get("FxChainlinkTwapOracle.stETH-USD"),
    deployment.get("FxChainlinkTwapOracle.ETH-USD"),
    "0x21e27a5e5513d6e65c4f830167390997aa84843a", // Curve ETH/stETH pool
  ]);

  // deploy FxFrxETHTwapOracle
  await deployment.contractDeploy("FxFrxETHTwapOracle", "FxFrxETHTwapOracle", "FxFrxETHTwapOracle", [
    deployment.get("FxChainlinkTwapOracle.ETH-USD"),
    "0x9c3b46c0ceb5b9e304fcd6d88fc50f7dd24b31bc", // Curve ETH/frxETH pool
  ]);

  // deploy FxEETHTwapOracle
  await deployment.contractDeploy("FxEETHTwapOracle", "FxEETHTwapOracle", "FxEETHTwapOracle", [
    TOKENS["CURVE_STABLE_NG_weETH/WETH_22"].address,
    "0x4e68ccd3e89f51c3074ca5072bbac773960dfa36", // Uniswap V3 USDT/WETH 0.3% pool
    deployment.get("FxChainlinkTwapOracle.ETH-USD"),
  ]);

  // deploy FxEzETHTwapOracle
  await deployment.contractDeploy("FxEzETHTwapOracle", "FxEzETHTwapOracle", "FxEzETHTwapOracle", [
    ADDRESS["CURVE_STABLE_NG_ezETH/WETH_79_POOL"],
    "0x4e68ccd3e89f51c3074ca5072bbac773960dfa36", // Uniswap V3 USDT/WETH 0.3% pool
    deployment.get("FxChainlinkTwapOracle.ETH-USD"),
  ]);

  // deploy FxWBTCTwapOracle
  await deployment.contractDeploy("FxWBTCTwapOracle", "FxWBTCTwapOracle", "FxWBTCTwapOracle", [
    "0x9db9e0e53058c89e5b94e29621a205198648425b", // Uniswap V3 WBTC/USDT 0.3% pool
    deployment.get("FxChainlinkTwapOracle.BTC-USD"),
    deployment.get("FxChainlinkTwapOracle.WBTC-BTC"),
  ]);

  /*
  // deploy FxPxETHTwapOracle
  await deployment.contractDeploy("FxPxETHTwapOracle", "FxPxETHTwapOracle", "FxPxETHTwapOracle", [
    TOKENS["CURVE_STABLE_NG_pxETH/stETH_30"].address,
    deployment.get("ChainlinkTwapOracle.stETH"),
    "0x4e68ccd3e89f51c3074ca5072bbac773960dfa36", // Uniswap V3 USDT/WETH 0.3% pool
    deployment.get("ChainlinkTwapOracle.ETH"),
  ]);

  // deploy FxCVXTwapOracle
  await deployment.contractDeploy("FxCVXTwapOracle", "FxCVXTwapOracle", "FxCVXTwapOracle", [
    ADDRESS.CURVE_CVXETH_POOL,
    deployment.get("ChainlinkTwapOracle.CVX"),
    deployment.get("ChainlinkTwapOracle.ETH"),
  ]);
  */

  // deploy WstETHRateProvider
  await deployment.contractDeploy("WstETHRateProvider", "WstETHRateProvider", "WstETHRateProvider", [
    TOKENS.wstETH.address,
  ]);

  // deploy ERC4626RateProvider sfrxETH
  await deployment.contractDeploy(
    "ERC4626RateProvider.sfrxETH",
    "ERC4626RateProvider for sfrxETH",
    "ERC4626RateProvider",
    [TOKENS.sfrxETH.address]
  );

  /* // deploy ERC4626RateProvider apxETH
  await deployment.contractDeploy(
    "ERC4626RateProvider.apxETH",
    "ERC4626RateProvider for apxETH",
    "ERC4626RateProvider",
    [TOKENS.apxETH.address]
  );

  // deploy ERC4626RateProvider aCVX
  await deployment.contractDeploy("ERC4626RateProvider.aCVX", "ERC4626RateProvider for aCVX", "ERC4626RateProvider", [
    TOKENS.aCVX.address,
  ]);
  */

  return deployment.toObject() as FxOracleDeployment;
}
