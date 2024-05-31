/* eslint-disable camelcase */
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { Overrides } from "ethers";
import { network } from "hardhat";

import { CLeverCVXLocker__factory, Furnace__factory } from "@/types/index";
import { selectDeployments } from "@/utils/index";

import { ContractCallHelper, DeploymentHelper } from "./helpers";
import { MultisigDeployment } from "./Multisig";
import { ProxyAdminDeployment } from "./ProxyAdmin";

export interface CLeverCVXDeployment {
  clevCVX: string;
  CVXLocker: {
    proxy: string;
    implementation: string;
  };
  Furnace: {
    proxy: string;
    implementation: string;
  };
}

export interface CLeverCVXHermezDeployment {
  ConvexHermezVoter: string;
}

const CONVEX_VOTE_PLATFORM = "0x6D024Fa49dE64A975980Cddd4C3212492D189e57";

export async function deploy(deployer: HardhatEthersSigner, overrides?: Overrides): Promise<CLeverCVXDeployment> {
  const multisig = selectDeployments(network.name, "Multisig").toObject() as MultisigDeployment;
  const admin = selectDeployments(network.name, "ProxyAdmin").toObject() as ProxyAdminDeployment;
  const deployment = new DeploymentHelper(network.name, "CLever.CVX", deployer, overrides);

  await deployment.contractDeploy("clevCVX", "clevCVX", "CLeverToken", ["CLever CVX", "clevCVX"]);
  await deployment.contractDeploy("Furnace.implementation", "Furnace implementation", "Furnace", []);
  await deployment.contractDeploy("CVXLocker.implementation", "CVXLocker implementation", "CLeverCVXLocker", []);

  await deployment.proxyDeploy(
    "Furnace.proxy",
    "Furnace proxy",
    deployment.get("Furnace.implementation"),
    admin.CLever,
    Furnace__factory.createInterface().encodeFunctionData("initialize", [
      multisig.AladdinDAO,
      deployment.get("clevCVX"),
      "0x1104b4DF568fa7Af90B1Bed1D78A2F71e748dc8a",
      multisig.CLever,
      20000000n,
      10000000n,
    ])
  );
  await deployment.proxyDeploy(
    "CVXLocker.proxy",
    "CVXLocker proxy",
    deployment.get("CVXLocker.implementation"),
    admin.CLever,
    CLeverCVXLocker__factory.createInterface().encodeFunctionData("initialize", [
      multisig.AladdinDAO,
      deployment.get("clevCVX"),
      "0x1104b4DF568fa7Af90B1Bed1D78A2F71e748dc8a",
      deployment.get("Furnace.proxy"),
      multisig.CLever,
      200000000n,
      10000000n,
    ])
  );

  return deployment.toObject() as CLeverCVXDeployment;
}

export async function initialize(
  deployer: HardhatEthersSigner,
  deployment: CLeverCVXDeployment,
  overrides?: Overrides
) {
  const caller = new ContractCallHelper(deployer, overrides);
  const admin = selectDeployments(network.name, "ProxyAdmin").toObject() as ProxyAdminDeployment;

  caller.upgrade(admin.CLever, "CLeverCVXLocker", deployment.CVXLocker.proxy, deployment.CVXLocker.implementation);
  caller.upgrade(admin.CLever, "Furnace", deployment.Furnace.proxy, deployment.Furnace.implementation);
}

export async function deployVoter(
  deployer: HardhatEthersSigner,
  overrides?: Overrides
): Promise<CLeverCVXHermezDeployment> {
  const clevcvx = selectDeployments("mainnet", "CLever.CVX").toObject() as CLeverCVXDeployment;
  const deployment = new DeploymentHelper(network.name, "vlCVX.Voter", deployer, overrides);

  await deployment.contractDeploy("ConvexHermezVoter", "ConvexHermezVoter", "ConvexHermezVoter", [
    clevcvx.CVXLocker.proxy,
    CONVEX_VOTE_PLATFORM,
  ]);

  return deployment.toObject() as CLeverCVXHermezDeployment;
}
