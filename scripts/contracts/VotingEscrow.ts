import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { Overrides } from "ethers";
import { network } from "hardhat";

import { selectDeployments } from "../utils";
import { contractDeploy } from ".";

export interface VotingEscrowDeployment {
  GovernanceToken: string;
  TokenMinter: string;
  VotingEscrow: string;
  GaugeController: string;
  FeeDistributor: string;
}

export async function deploy(deployer: SignerWithAddress, overrides?: Overrides): Promise<VotingEscrowDeployment> {
  const deployment = selectDeployments(network.name, "VotingEscrow");

  for (const name of ["GovernanceToken", "TokenMinter", "VotingEscrow", "GaugeController", "FeeDistributor"]) {
    if (!deployment.get(name)) {
      const address = await contractDeploy(deployer, `${name} implementation`, name, [], overrides);
      deployment.set(name, address);
    } else {
      console.log(`Found ${name} implementation at:`, deployment.get(name));
    }
  }

  return deployment.toObject() as VotingEscrowDeployment;
}
