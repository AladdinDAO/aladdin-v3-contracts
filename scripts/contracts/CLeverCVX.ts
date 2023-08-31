/* eslint-disable node/no-missing-import */
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { selectDeployments } from "../utils";
import { network } from "hardhat";
import { contractDeploy } from ".";

export interface CLeverCVXDeployment {
  clevCVX: string;
  CVXLocker: string;
  Furnace: string;
}

export interface CLeverCVXHermezDeployment {
  ConvexHermezVoter: string;
}

const CONVEX_VOTE_PLATFORM = "0x6D024Fa49dE64A975980Cddd4C3212492D189e57";

export async function deploy(deployer: SignerWithAddress): Promise<CLeverCVXDeployment> {
  const deployment = selectDeployments(network.name, "CLever.CVX");

  return deployment.toObject() as CLeverCVXDeployment;
}

export async function deployVoter(deployer: SignerWithAddress): Promise<CLeverCVXHermezDeployment> {
  const clevcvx = selectDeployments("mainnet", "CLever.CVX");
  const deployment = selectDeployments(network.name, "vlCVX.Voter");

  if (!deployment.get("ConvexHermezVoter")) {
    const address = await contractDeploy(deployer, "ConverterRegistry", [
      clevcvx.get("CVXLocker"),
      CONVEX_VOTE_PLATFORM,
    ]);
    deployment.set("ConvexHermezVoter", address);
  }

  return deployment.toObject() as CLeverCVXHermezDeployment;
}
