/* eslint-disable node/no-missing-import */
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { network } from "hardhat";

import { selectDeployments } from "../utils";
import { contractDeploy } from ".";

export interface ProxyAdminDeployment {
  Concentrator: string;
  CLever: string;
  Fx: string;
}

export async function deploy(deployer: HardhatEthersSigner): Promise<ProxyAdminDeployment> {
  console.log("");
  const deployment = selectDeployments(network.name, "ProxyAdmin");

  for (const name of ["Concentrator", "CLever", "Fx"]) {
    if (!deployment.get(name)) {
      const address = await contractDeploy(deployer, "ProxyAdmin for " + name, "ProxyAdmin", []);
      deployment.set(name, address);
    } else {
      console.log(`Found ProxyAdmin for ${name} at:`, deployment.get(name));
    }
  }

  return deployment.toObject() as ProxyAdminDeployment;
}
