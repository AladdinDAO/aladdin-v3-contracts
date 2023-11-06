import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { Overrides } from "ethers";
import { network } from "hardhat";

import { selectDeployments } from "@/utils/deploys";

import { contractDeploy } from "./helpers";

export interface MiscDeployment {
  MultiMerkleStash: string;
}

export async function deploy(deployer: HardhatEthersSigner, overrides?: Overrides): Promise<MiscDeployment> {
  const deployment = selectDeployments(network.name, "Misc");

  if (!deployment.get("MultiMerkleStash")) {
    const address = await contractDeploy(deployer, "MultiMerkleStash", "MultiMerkleStash", [], overrides);
    deployment.set("MultiMerkleStash", address);
  } else {
    console.log("Found MultiMerkleStash at:", deployment.get("MultiMerkleStash"));
  }
  return deployment.toObject() as MiscDeployment;
}
