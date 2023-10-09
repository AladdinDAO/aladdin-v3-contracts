import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { Overrides, ZeroAddress } from "ethers";
import { network, ethers } from "hardhat";

import { CONVERTER_ROUTRS, DEPLOYED_CONTRACTS, TOKENS, selectDeployments } from "@/utils/index";

import { contractCall, contractDeploy } from "./helpers";
import * as Converter from "./Converter";
import * as ProxyAdmin from "./ProxyAdmin";

export interface ConcentratorCVXDeployment {
  CvxCompounder: {
    proxy: string;
    implementation: string;
  };
  CvxStakingStrategy: string;
}

const CVX_REWARD_POOL = "0xCF50b810E57Ac33B91dCF525C6ddd9881B139332";
const PERIOD_LENGTH = 0; // distribute immediately

export async function deploy(deployer: HardhatEthersSigner, overrides?: Overrides): Promise<ConcentratorCVXDeployment> {
  const admin = await ProxyAdmin.deploy(deployer);
  const deployment = selectDeployments(network.name, "Concentrator.CVX");

  if (!deployment.get("CvxCompounder.implementation")) {
    const address = await contractDeploy(
      deployer,
      "CvxCompounder Implementation",
      "CvxCompounder",
      [PERIOD_LENGTH],
      overrides
    );
    deployment.set("CvxCompounder.implementation", address);
  } else {
    console.log(`Found CvxCompounder implementation at:`, deployment.get("CvxCompounder.implementation"));
  }

  if (!deployment.get("CvxCompounder.proxy")) {
    const address = await contractDeploy(
      deployer,
      "CvxCompounder Proxy",
      "TransparentUpgradeableProxy",
      [deployment.get("CvxCompounder.implementation"), admin.Concentrator, "0x"],
      overrides
    );
    deployment.set("CvxCompounder.proxy", address);
  } else {
    console.log(`Found CvxCompounder proxy at:`, deployment.get("CvxCompounder.proxy"));
  }

  if (!deployment.get("CvxStakingStrategy")) {
    const address = await contractDeploy(
      deployer,
      "CvxStakingStrategy",
      "CvxStakingStrategy",
      [deployment.get("CvxCompounder.proxy"), CVX_REWARD_POOL],
      overrides
    );
    deployment.set("CvxStakingStrategy", address);
  } else {
    console.log(`Found CvxStakingStrategy at:`, deployment.get("CvxStakingStrategy"));
  }

  return deployment.toObject() as ConcentratorCVXDeployment;
}

export async function initialize(
  deployer: HardhatEthersSigner,
  deployment: ConcentratorCVXDeployment,
  overrides?: Overrides
): Promise<void> {
  const converterDeployment = await Converter.deploy(deployer, overrides);
  const compounder = await ethers.getContractAt("CvxCompounder", deployment.CvxCompounder.proxy, deployer);
  const registry = await ethers.getContractAt("ConverterRegistry", converterDeployment.ConverterRegistry, deployer);

  if ((await compounder.rewardToken()) === ZeroAddress) {
    await contractCall(compounder, "CvxCompounder initialize", "initialize", [
      "Aladdin CVX",
      "aCVX",
      DEPLOYED_CONTRACTS.Concentrator.PlatformFeeSpliter,
      "0xfa86aa141e45da5183B42792d99Dede3D26Ec515",
      converterDeployment.GeneralTokenConverter,
      deployment.CvxStakingStrategy,
    ]);
  }

  // cvxCRV => WETH
  if ((await registry.getRoutes(TOKENS.cvxCRV.address, TOKENS.WETH.address)).length === 0) {
    await contractCall(registry, "ConverterRegistry add cvxCRV => WETH route", "updateRoute", [
      TOKENS.cvxCRV.address,
      TOKENS.WETH.address,
      CONVERTER_ROUTRS.cvxCRV.WETH,
    ]);
  }
  // WETH => CVX
  if ((await registry.getRoutes(TOKENS.WETH.address, TOKENS.CVX.address)).length === 0) {
    await contractCall(registry, "ConverterRegistry add WETH => CVX route", "updateRoute", [
      TOKENS.WETH.address,
      TOKENS.CVX.address,
      CONVERTER_ROUTRS.WETH.CVX,
    ]);
  }
}
