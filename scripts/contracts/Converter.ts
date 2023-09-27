import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { Contract, Overrides } from "ethers";
import { ethers, network } from "hardhat";

import { selectDeployments } from "@/utils/deploys";

import { contractDeploy, ownerContractCall } from "./helpers";

export interface ConverterDeployment {
  ConverterRegistry: string;
  GeneralTokenConverter: string;
  LidoConverter: string;
}

export async function deploy(deployer: HardhatEthersSigner, overrides?: Overrides): Promise<ConverterDeployment> {
  const deployment = selectDeployments(network.name, "Converter");

  if (!deployment.get("ConverterRegistry")) {
    const address = await contractDeploy(deployer, "ConverterRegistry", "ConverterRegistry", [], overrides);
    deployment.set("ConverterRegistry", address);
  } else {
    console.log("Found ConverterRegistry at:", deployment.get("ConverterRegistry"));
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
  } else {
    console.log("Found GeneralTokenConverter at:", deployment.get("GeneralTokenConverter"));
  }

  if (!deployment.get("LidoConverter")) {
    const address = await contractDeploy(
      deployer,
      "LidoConverter",
      "LidoConverter",
      [deployment.get("ConverterRegistry")],
      overrides
    );
    deployment.set("LidoConverter", address);
  } else {
    console.log("Found LidoConverter at:", deployment.get("LidoConverter"));
  }

  /*
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
  */

  return deployment.toObject() as ConverterDeployment;
}

export async function initialize(
  deployer: HardhatEthersSigner,
  deployment: ConverterDeployment,
  overrides?: Overrides
) {
  const registry = await ethers.getContractAt("ConverterRegistry", deployment.ConverterRegistry, deployer);

  for (let i = 0; i < 10; i++) {
    if ((await registry.getConverter(i)) !== deployment.GeneralTokenConverter) {
      await ownerContractCall(
        registry as unknown as Contract,
        `ConverterRegistry register poolType[${i}]: GeneralTokenConverter`,
        "register",
        [i, deployment.GeneralTokenConverter],
        overrides
      );
    }
  }

  if ((await registry.getConverter(10)) !== deployment.LidoConverter) {
    await ownerContractCall(
      registry as unknown as Contract,
      "ConverterRegistry register poolType[10]: LidoConverter",
      "register",
      [10n, deployment.LidoConverter],
      overrides
    );
  }
}
