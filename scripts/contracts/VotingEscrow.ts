import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { Overrides } from "ethers";
import { network } from "hardhat";

import { DeploymentHelper } from "./helpers";

export interface VotingEscrowDeployment {
  GovernanceToken: string;
  TokenMinter: string;
  VotingEscrow: string;
  GaugeController: string;
  FeeDistributor: string;
}

export async function deploy(deployer: HardhatEthersSigner, overrides?: Overrides): Promise<VotingEscrowDeployment> {
  const deployment = new DeploymentHelper(network.name, "VotingEscrow", deployer, overrides);

  for (const name of ["GovernanceToken", "TokenMinter", "VotingEscrow", "GaugeController", "FeeDistributor"]) {
    await deployment.contractDeploy(name, `${name} implementation`, name, []);
  }

  return deployment.toObject() as VotingEscrowDeployment;
}
