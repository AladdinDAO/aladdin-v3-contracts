import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { Overrides } from "ethers";
import { network, ethers } from "hardhat";

import { AVAILABLE_VAULTS, DEPLOYED_VAULTS, TOKENS, selectDeployments } from "@/utils/index";
import { ContractCallHelper, DeploymentHelper, ownerContractCall } from "./helpers";
import { ProxyAdminDeployment } from "./ProxyAdmin";
import { AladdinCRVV2 } from "../@types";

export interface ConcentratorCvxCrvDeployment {
  CvxCrvCompounder: {
    proxy: string;
    implementation: string;
  };
  LegacyConcentratorVault: {
    proxy: string;
    implementation: string;
  };
  ConcentratorVault: {
    proxy: string;
    implementation: string;
  };
  CvxCrvStakingWrapperStrategy: string;
}

export async function deploy(
  deployer: HardhatEthersSigner,
  overrides?: Overrides
): Promise<ConcentratorCvxCrvDeployment> {
  const deployment = new DeploymentHelper(network.name, "Concentrator.cvxCRV", deployer, overrides);

  await deployment.contractDeploy(
    "CvxCrvCompounder.implementation",
    "CvxCrvCompounder implementation",
    "AladdinCRVV2",
    [TOKENS["CRV_P_CRV/cvxCRV_283"].address, TOKENS.stkCvxCrv.address]
  );

  return deployment.toObject() as ConcentratorCvxCrvDeployment;
}

export async function initialize(
  deployer: HardhatEthersSigner,
  deployment: ConcentratorCvxCrvDeployment,
  overrides?: Overrides
): Promise<void> {
  const admin = selectDeployments(network.name, "ProxyAdmin").toObject() as ProxyAdminDeployment;
  const caller = new ContractCallHelper(deployer, overrides);

  const aCRV = await caller.contract<AladdinCRVV2>("AladdinCRVV2", deployment.CvxCrvCompounder.proxy);

  await caller.upgrade(
    admin.Concentrator,
    "aCRV upgrade",
    await aCRV.getAddress(),
    deployment.CvxCrvCompounder.implementation
  );

  await caller.ownerCall(aCRV, "updateStrategyRewards", "updateStrategyRewards", [
    [TOKENS.CRV.address, TOKENS.CVX.address, TOKENS.TRICRV.address, TOKENS.crvUSD.address],
  ]);

  const vault = await ethers.getContractAt("ConcentratorIFOVault", deployment.ConcentratorVault.proxy, deployer);
  const pools = DEPLOYED_VAULTS.aCRV;

  const startIndex = Number(await vault.poolLength());
  for (let pid = startIndex; pid < pools.length; ++pid) {
    const pool = pools[pid];
    const config = AVAILABLE_VAULTS[pool.name];

    await ownerContractCall(
      vault,
      `Add pool[${pool.name}] with pid[${pid}]`,
      "addPool",
      [config.convexCurveID!, config.rewards, pool.fees.withdraw, pool.fees.platform, pool.fees.harvest],
      overrides
    );
  }
}
