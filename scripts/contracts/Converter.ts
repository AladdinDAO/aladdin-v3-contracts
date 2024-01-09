import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { Contract, Overrides } from "ethers";
import { ethers, network } from "hardhat";

import { DeploymentHelper, ownerContractCall } from "./helpers";

export interface ConverterDeployment {
  ConverterRegistry: string;
  GeneralTokenConverter: string;
  LidoConverter: string;
  MultiPathConverter: string;
}

export async function deploy(deployer: HardhatEthersSigner, overrides?: Overrides): Promise<ConverterDeployment> {
  const deployment = new DeploymentHelper(network.name, "Converter", deployer, overrides);

  await deployment.contractDeploy("ConverterRegistry", "ConverterRegistry", "ConverterRegistry", []);

  await deployment.contractDeploy("GeneralTokenConverter", "GeneralTokenConverter", "GeneralTokenConverter", [
    deployment.get("ConverterRegistry"),
  ]);

  await deployment.contractDeploy("LidoConverter", "LidoConverter", "LidoConverter", [
    deployment.get("ConverterRegistry"),
  ]);

  await deployment.contractDeploy("MultiPathConverter", "MultiPathConverter", "MultiPathConverter", [
    deployment.get("GeneralTokenConverter"),
  ]);

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
