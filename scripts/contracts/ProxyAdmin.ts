/* eslint-disable node/no-missing-import */
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { network } from "hardhat";

import { selectDeployments } from "../utils";
import { contractDeploy } from ".";

export interface ProxyAdminDeployment {
  Concentrator: string;
  CLever: string;
  Fx: string;
}

export async function deploy(deployer: SignerWithAddress): Promise<ProxyAdminDeployment> {
  const deployment = selectDeployments(network.name, "ProxyAdmin");

  for (const name of ["Concentrator", "CLever", "Fx"]) {
    if (!deployment.get(name)) {
      const address = await contractDeploy(deployer, "ProxyAdmin", []);
      deployment.set(name, address);
    }
  }

  return deployment.toObject() as ProxyAdminDeployment;
}
