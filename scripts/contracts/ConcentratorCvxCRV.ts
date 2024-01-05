import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { Overrides } from "ethers";
import { network, ethers } from "hardhat";

import { AVAILABLE_VAULTS, DEPLOYED_VAULTS, selectDeployments } from "@/utils/index";
import { ownerContractCall } from "./helpers";

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
  _deployer: HardhatEthersSigner,
  _overrides?: Overrides
): Promise<ConcentratorCvxCrvDeployment> {
  const deployment = selectDeployments(network.name, "Concentrator.cvxCRV");

  return deployment.toObject() as ConcentratorCvxCrvDeployment;
}

export async function initialize(
  deployer: HardhatEthersSigner,
  deployment: ConcentratorCvxCrvDeployment,
  overrides?: Overrides
): Promise<void> {
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
