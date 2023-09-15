import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { network } from "hardhat";

import { selectDeployments } from "../utils";
import { contractDeploy } from ".";
import { Overrides } from "ethers";

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

  if (!deployment.get("MultiPathConverter")) {
    const address = await contractDeploy(
      deployer,
      "MultiPathConverter",
      "MultiPathConverter",
      [deployment.get("GeneralTokenConverter")],
      overrides
    );
    deployment.set("MultiPathConverter", address);
  }

  return deployment.toObject() as ConverterDeployment;
}
