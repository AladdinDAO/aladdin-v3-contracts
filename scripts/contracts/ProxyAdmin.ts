import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { network } from "hardhat";

import { DeploymentHelper } from "./helpers";

export interface ProxyAdminDeployment {
  Concentrator: string;
  CLever: string;
  Fx: string;
}

export async function deploy(deployer: HardhatEthersSigner): Promise<ProxyAdminDeployment> {
  const deployment = new DeploymentHelper(network.name, "ProxyAdmin", deployer);

  for (const name of ["Concentrator", "CLever", "Fx"]) {
    await deployment.contractDeploy(name, "ProxyAdmin for " + name, "ProxyAdmin", []);
  }

  return deployment.toObject() as ProxyAdminDeployment;
}
