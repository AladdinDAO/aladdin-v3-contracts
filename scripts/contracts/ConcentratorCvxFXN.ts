import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { Overrides, ZeroAddress } from "ethers";
import { network } from "hardhat";

import { ConverterRegistry, CvxFxnCompounder, PlatformFeeSpliter } from "@/types/index";
import { CONVERTER_ROUTRS, TOKENS, selectDeployments } from "@/utils/index";
import { ContractCallHelper, DeploymentHelper } from "./helpers";
import { ProxyAdminDeployment } from "./ProxyAdmin";
import { ConcentratorGovernanceDeployment } from "./ConcentratorGovernance";
import { GatewayDeployment } from "./Gateway";
import { ConverterDeployment } from "./Converter";

export interface ConcentratorCvxFxnDeployment {
  CvxFxnCompounder: {
    proxy: string;
    implementation: string;
  };
  CvxFxnStakingStrategy: string;
}

const PERIOD_LENGTH = 0; // distribute immediately

export async function deploy(
  deployer: HardhatEthersSigner,
  overrides?: Overrides
): Promise<ConcentratorCvxFxnDeployment> {
  const admin = selectDeployments(network.name, "ProxyAdmin").toObject() as ProxyAdminDeployment;
  const deployment = new DeploymentHelper(network.name, "Concentrator.cvxFXN", deployer, overrides);

  await deployment.contractDeploy(
    "CvxFxnCompounder.implementation",
    "CvxFxnCompounder implementation",
    "CvxFxnCompounder",
    [PERIOD_LENGTH]
  );

  await deployment.proxyDeploy(
    "CvxFxnCompounder.proxy",
    "CvxFxnCompounder proxy",
    deployment.get("CvxFxnCompounder.implementation"),
    admin.Concentrator,
    "0x"
  );

  await deployment.contractDeploy("CvxFxnStakingStrategy", "CvxFxnStakingStrategy", "CvxFxnStakingStrategy", [
    deployment.get("CvxFxnCompounder.proxy"),
  ]);

  return deployment.toObject() as ConcentratorCvxFxnDeployment;
}

export async function initialize(
  deployer: HardhatEthersSigner,
  deployment: ConcentratorCvxFxnDeployment,
  overrides?: Overrides
): Promise<void> {
  const governance = selectDeployments(
    network.name,
    "Concentrator.Governance"
  ).toObject() as ConcentratorGovernanceDeployment;
  const gateway = selectDeployments(network.name, "Gateway").toObject() as GatewayDeployment;
  const converter = selectDeployments(network.name, "Converter").toObject() as ConverterDeployment;
  const caller = new ContractCallHelper(deployer, overrides);

  const aFXN = await caller.contract<CvxFxnCompounder>("CvxFxnCompounder", deployment.CvxFxnCompounder.proxy);
  const registry = await caller.contract<ConverterRegistry>("ConverterRegistry", converter.ConverterRegistry);
  const splitter = await caller.contract<PlatformFeeSpliter>("PlatformFeeSpliter", governance.PlatformFeeSplitter);

  if ((await aFXN.name()) === "") {
    await caller.call(aFXN, "CvxFxnCompounder initialize", "initialize", [
      "Aladdin cvxFXN",
      "aFXN",
      governance.PlatformFeeSplitter,
      gateway.ConcentratorHarvester,
      converter.GeneralTokenConverter,
      deployment.CvxFxnStakingStrategy,
    ]);
  }

  for (const [src, dst] of [
    ["CVX", "WETH"],
    ["wstETH", "WETH"],
    ["WETH", "FXN"],
  ]) {
    if ((await registry.getRoutes(TOKENS[src].address, TOKENS[dst].address)).length === 0) {
      await caller.ownerCall(registry, `ConverterRegistry add ${src} => ${dst} route`, "updateRoute", [
        TOKENS[src].address,
        TOKENS[dst].address,
        CONVERTER_ROUTRS[src][dst],
      ]);
    }
  }

  if ((await splitter.burners(aFXN.getAddress())) === ZeroAddress) {
    await caller.ownerCall(splitter, "PlatformFeeSplitter add aFXN", "addRewardToken", [
      await aFXN.getAddress(),
      governance.Burners.PlatformFeeBurner,
      0,
      500000000,
      500000000,
    ]);
  }
}
