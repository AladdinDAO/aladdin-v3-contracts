import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { Overrides } from "ethers";
import { network } from "hardhat";

import { DeploymentHelper } from "./helpers";
import { TOKENS } from "../utils";

const ChainlinkPriceFeed: { [name: string]: string } = {
  CVX: "0xd962fC30A72A84cE50161031391756Bf2876Af5D",
  ETH: "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419",
  stETH: "0xCfE54B5cD566aB89272946F602D76Ea879CAb4a8",
};

const RedStonePriceFeed: { [name: string]: string } = {
  ezETH: "0xF4a3e183F59D2599ee3DF213ff78b1B3b1923696",
};

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
  for (const symbol of ["ETH", "stETH", "CVX"]) {
    await deployment.contractDeploy(
      "ChainlinkTwapOracle." + symbol,
      "ChainlinkTwapOracle for " + symbol,
      "ChainlinkTwapOracleV3",
      [ChainlinkPriceFeed[symbol], 1, 10800, symbol]
    );
  }

  // deploy redstone twap oracle
  for (const symbol of ["ezETH"]) {
    await deployment.contractDeploy(
      "RedStoneTwapOracle." + symbol,
      "RedStoneTwapOracle for " + symbol,
      "ChainlinkTwapOracleV3",
      [RedStonePriceFeed[symbol], 1, 10800, symbol]
    );
  }

  // deploy FxStETHTwapOracle
  await deployment.contractDeploy("FxStETHTwapOracle", "FxStETHTwapOracle", "FxStETHTwapOracle", [
    deployment.get("ChainlinkTwapOracle.stETH"),
    deployment.get("ChainlinkTwapOracle.ETH"),
    "0x21e27a5e5513d6e65c4f830167390997aa84843a", // Curve ETH/stETH pool
  ]);

  // deploy FxFrxETHTwapOracle
  await deployment.contractDeploy("FxFrxETHTwapOracle", "FxFrxETHTwapOracle", "FxFrxETHTwapOracle", [
    deployment.get("ChainlinkTwapOracle.ETH"),
    "0x9c3b46c0ceb5b9e304fcd6d88fc50f7dd24b31bc", // Curve ETH/frxETH pool
  ]);

  // deploy FxEETHTwapOracle
  await deployment.contractDeploy("FxEETHTwapOracle", "FxEETHTwapOracle", "FxEETHTwapOracle", [
    TOKENS["CURVE_STABLE_NG_weETH/WETH_22"].address,
    "0x4e68ccd3e89f51c3074ca5072bbac773960dfa36", // Uniswap V3 USDT/WETH 0.3% pool
    deployment.get("ChainlinkTwapOracle.ETH"),
  ]);

  // deploy FxEzETHTwapOracle
  await deployment.contractDeploy("FxEzETHTwapOracle", "FxEzETHTwapOracle", "FxEzETHTwapOracle", [
    deployment.get("RedStoneTwapOracle.ezETH"),
    deployment.get("ChainlinkTwapOracle.ETH"),
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
