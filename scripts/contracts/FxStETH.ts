import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { network, ethers } from "hardhat";
import { Contract, Overrides } from "ethers";

import { TOKENS, selectDeployments } from "../utils";
import { contractDeploy, ownerContractCall } from ".";

import * as FxGovernance from "./FxGovernance";
import * as ProxyAdmin from "./ProxyAdmin";

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
    proxy: string;
  };
  stETHGateway: string;
  wstETHWrapper: string;
  ChainlinkTwapOracle: {
    ETH: string;
    stETH: string;
  };
  FxETHTwapOracle: string;
  FxGateway: string;
  ReservePool: string;
}

const ChainlinkPriceFeed: { [name: string]: string } = {
  ETH: "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419",
  stETH: "0xCfE54B5cD566aB89272946F602D76Ea879CAb4a8",
};

export async function deploy(deployer: HardhatEthersSigner, overrides?: Overrides): Promise<FxStETHDeployment> {
  const admin = await ProxyAdmin.deploy(deployer);

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

  // deploy proxy
  for (const name of ["FractionalToken", "LeveragedToken", "stETHTreasury", "Market", "RebalancePool"]) {
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
  if (!deployment.get("wstETHWrapper")) {
    const address = await contractDeploy(deployer, "wstETHWrapper", "wstETHWrapper", [], overrides);
    deployment.set("wstETHWrapper", address);
  } else {
    console.log(`Found wstETHWrapper at:`, deployment.get("wstETHWrapper"));
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

  return deployment.toObject() as FxStETHDeployment;
}

export async function initialize(deployer: HardhatEthersSigner, deployment: FxStETHDeployment, overrides?: Overrides) {
  const admin = await ProxyAdmin.deploy(deployer);
  const governance = await FxGovernance.deploy(deployer, overrides);
  const proxyAdmin = await ethers.getContractAt("ProxyAdmin", admin.Fx, deployer);

  const treasury = await ethers.getContractAt("stETHTreasury", deployment.stETHTreasury.proxy, deployer);
  const market = await ethers.getContractAt("Market", deployment.Market.proxy, deployer);
  const reservePool = await ethers.getContractAt("ReservePool", deployment.ReservePool, deployer);
  const spliter = await ethers.getContractAt("PlatformFeeSpliter", governance.PlatformFeeSpliter, deployer);

  // upgrade proxy
  for (const name of ["FractionalToken", "LeveragedToken", "stETHTreasury", "Market", "RebalancePool"]) {
    const impl = (deployment as any)[name].implementation;
    const proxy = (deployment as any)[name].proxy;
    if ((await proxyAdmin.getProxyImplementation(proxy)) !== impl) {
      await ownerContractCall(
        proxyAdmin as unknown as Contract,
        "ProxyAdmin upgrade " + name,
        "upgrade",
        [proxy, impl],
        overrides
      );
    }
  }

  // initialize reserve pool
  if ((await reservePool.bonusRatio(TOKENS.stETH.address)) !== ReservePoolBonusRatio) {
    await ownerContractCall(
      reservePool as unknown as Contract,
      "ReservePool updateBonusRatio for stETH",
      "updateBonusRatio",
      [TOKENS.stETH.address, ReservePoolBonusRatio],
      overrides
    );
  }

  // initialize stETHTreasury
  if ((await treasury.priceOracle()) !== deployment.FxETHTwapOracle) {
    await ownerContractCall(
      treasury as unknown as Contract,
      "stETHTreasury update price oracle",
      "updatePriceOracle",
      [deployment.FxETHTwapOracle],
      overrides
    );
  }

  if ((await treasury.platform()) !== governance.PlatformFeeSpliter) {
    await ownerContractCall(
      treasury as unknown as Contract,
      "stETHTreasury update platform",
      "updatePlatform",
      [governance.PlatformFeeSpliter],
      overrides
    );
  }

  // initialize Market
  if (
    (await proxyAdmin.getProxyImplementation(deployment.Market.proxy)) === deployment.Market.implementation &&
    (await market.reservePool()) !== deployment.ReservePool
  ) {
    await ownerContractCall(
      treasury as unknown as Contract,
      "Market update reserve pool",
      "updateReservePool",
      [deployment.ReservePool],
      overrides
    );
  }

  // initialize PlatformFeeSpliter
  if ((await spliter.treasury()) !== deployment.ReservePool) {
    await ownerContractCall(
      spliter as unknown as Contract,
      "PlatformFeeSpliter set ReservePool as Treasury",
      "updateTreasury",
      [deployment.ReservePool],
      overrides
    );
  }

  const length = await spliter.getRewardCount();
  let foundIndex = -1;
  for (let i = 0; i < length; i++) {
    if ((await spliter.rewards(i)).token === TOKENS.stETH.address) {
      foundIndex = i;
    }
  }
  if (foundIndex === -1) {
    await ownerContractCall(
      spliter as unknown as Contract,
      "PlatformFeeSpliter add stETH",
      "addRewardToken",
      [TOKENS.stETH.address, governance.FeeDistributor, 0n, ethers.parseUnits("0.25", 9), ethers.parseUnits("0.75", 9)],
      overrides
    );
  }
}
