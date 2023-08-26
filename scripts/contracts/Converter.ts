/* eslint-disable node/no-missing-import */
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { network } from "hardhat";

import { selectDeployments } from "../utils";
import { contractDeploy } from ".";

export interface ConverterDeployment {
  ConverterRegistry: string;
  GeneralTokenConverter: string;
}

export async function deploy(deployer: SignerWithAddress): Promise<ConverterDeployment> {
  const deployment = selectDeployments(network.name, "Converter");

  if (!deployment.get("ConverterRegistry")) {
    const address = await contractDeploy(deployer, "ConverterRegistry", []);
    deployment.set("ConverterRegistry", address);
  }

  if (!deployment.get("GeneralTokenConverter")) {
    const address = await contractDeploy(deployer, "GeneralTokenConverter", [deployment.get("ConverterRegistry")]);
    deployment.set("GeneralTokenConverter", address);
  }

  return deployment.toObject() as ConverterDeployment;
}
