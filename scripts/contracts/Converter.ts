import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { Contract, Overrides } from "ethers";
import { ethers, network } from "hardhat";

import { DeploymentHelper, ownerContractCall } from "./helpers";

export interface ConverterDeployment {
  ConverterRegistry: string;
  GeneralTokenConverter: string;
  UniswapV3Converter: string;
  LidoConverter: string;
  CurveNGConverter: string;
  WETHConverter: string;
  ETHLSDConverter: string;
  MultiPathConverter: string;
}

export async function deploy(deployer: HardhatEthersSigner, overrides?: Overrides): Promise<ConverterDeployment> {
  const deployment = new DeploymentHelper(network.name, "Converter", deployer, overrides);

  await deployment.contractDeploy("ConverterRegistry", "ConverterRegistry", "ConverterRegistry", []);

  await deployment.contractDeploy("GeneralTokenConverter", "GeneralTokenConverter", "GeneralTokenConverter", [
    deployment.get("ConverterRegistry"),
  ]);

  await deployment.contractDeploy("UniswapV3Converter", "UniswapV3Converter", "UniswapV3Converter", [
    deployment.get("ConverterRegistry"),
  ]);

  await deployment.contractDeploy("LidoConverter", "LidoConverter", "LidoConverter", [
    deployment.get("ConverterRegistry"),
  ]);

  await deployment.contractDeploy("ETHLSDConverter", "ETHLSDConverter", "ETHLSDConverter", [
    deployment.get("ConverterRegistry"),
  ]);

  await deployment.contractDeploy("CurveNGConverter", "CurveNGConverter", "CurveNGConverter", [
    deployment.get("ConverterRegistry"),
  ]);

  await deployment.contractDeploy("WETHConverter", "WETHConverter", "WETHConverter", [
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
  const converter = await ethers.getContractAt("GeneralTokenConverter", deployment.GeneralTokenConverter, deployer);

  for (let i = 0; i < 10; i++) {
    if ([1].includes(i)) continue;
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
  // setup UniswapV3Converter
  if ((await registry.getConverter(1)) !== deployment.UniswapV3Converter) {
    await ownerContractCall(
      registry,
      "ConverterRegistry register poolType[1]: UniswapV3Converter",
      "register",
      [1n, deployment.UniswapV3Converter],
      overrides
    );
  }
  let supportedPoolTypes = await converter.supportedPoolTypes();
  if ((supportedPoolTypes & 2n) > 0n) {
    supportedPoolTypes ^= 2n;
  }
  if (supportedPoolTypes !== (await converter.supportedPoolTypes())) {
    await ownerContractCall(
      converter,
      `GeneralTokenConverter updateSupportedPoolTypes[${supportedPoolTypes.toString(2)}]`,
      "updateSupportedPoolTypes",
      [supportedPoolTypes],
      overrides
    );
  }
  // setup LidoConverter
  if ((await registry.getConverter(10)) !== deployment.LidoConverter) {
    await ownerContractCall(
      registry,
      "ConverterRegistry register poolType[10]: LidoConverter",
      "register",
      [10n, deployment.LidoConverter],
      overrides
    );
  }
  // setup ETHLSDConverter
  if ((await registry.getConverter(11)) !== deployment.ETHLSDConverter) {
    await ownerContractCall(
      registry,
      "ConverterRegistry register poolType[11]: ETHLSDConverter",
      "register",
      [11n, deployment.ETHLSDConverter],
      overrides
    );
  }
  // setup CurveNGConverter
  for (const poolType of [12, 13]) {
    if ((await registry.getConverter(poolType)) !== deployment.CurveNGConverter) {
      await ownerContractCall(
        registry,
        `ConverterRegistry register poolType[${poolType}]: CurveNGConverter`,
        "register",
        [poolType, deployment.CurveNGConverter],
        overrides
      );
    }
  }
  // setup WETHConverter
  if ((await registry.getConverter(14)) !== deployment.WETHConverter) {
    await ownerContractCall(
      registry,
      "ConverterRegistry register poolType[14]: WETHConverter",
      "register",
      [14n, deployment.WETHConverter],
      overrides
    );
  }
}
