import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { Overrides } from "ethers";
import { network } from "hardhat";

import { selectDeployments } from "@/utils/deploys";

import { contractDeploy } from "./helpers";

export interface ConverterDeployment {
  ConverterRegistry: string;
  GeneralTokenConverter: string;
}

export async function deploy(deployer: HardhatEthersSigner, overrides?: Overrides): Promise<ConverterDeployment> {
  const deployment = selectDeployments(network.name, "Converter");

  if (!deployment.get("ConverterRegistry")) {
    const address = await contractDeploy(deployer, "ConverterRegistry", "ConverterRegistry", [], overrides);
    deployment.set("ConverterRegistry", address);
  }

  if (!deployment.get("GeneralTokenConverter")) {
    const address = await contractDeploy(
      deployer,
      "GeneralTokenConverter",
      "GeneralTokenConverter",
      [deployment.get("ConverterRegistry")],
      overrides
    );
    deployment.set("GeneralTokenConverter", address);
  }

  return deployment.toObject() as ConverterDeployment;
}
