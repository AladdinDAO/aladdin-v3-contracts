import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { Overrides } from "ethers";
import { network } from "hardhat";

import { DeploymentHelper } from "./helpers";
import { TOKENS } from "../utils";

const ChainlinkPriceFeed: { [name: string]: string } = {
  ETH: "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419",
  stETH: "0xCfE54B5cD566aB89272946F602D76Ea879CAb4a8",
};

export interface FxOracleDeployment {
  ChainlinkTwapOracle: {
    ETH: string;
    stETH: string;
  };
  FxStETHTwapOracle: string;
  FxFrxETHTwapOracle: string;

  WstETHRateProvider: string;
  ERC4626RateProvider: {
    sfrxETH: string;
  };
}

export async function deploy(deployer: HardhatEthersSigner, overrides?: Overrides): Promise<FxOracleDeployment> {
  const deployment = new DeploymentHelper(network.name, "Fx.Oracle", deployer, overrides);

  // deploy chainlink twap oracle
  for (const symbol of ["ETH", "stETH"]) {
    await deployment.contractDeploy(
      "ChainlinkTwapOracle." + symbol,
      "ChainlinkTwapOracleV3 for " + symbol,
      "ChainlinkTwapOracleV3",
      [ChainlinkPriceFeed[symbol], 1, 10800, symbol]
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

  // deploy WstETHRateProvider
  await deployment.contractDeploy("WstETHRateProvider", "WstETHRateProvider", "WstETHRateProvider", [
    TOKENS.wstETH.address,
  ]);

  // deploy ERC4626RateProvider
  await deployment.contractDeploy(
    "ERC4626RateProvider.sfrxETH",
    "ERC4626RateProvider for sfrxETH",
    "ERC4626RateProvider",
    [TOKENS.sfrxETH.address]
  );

  return deployment.toObject() as FxOracleDeployment;
}
