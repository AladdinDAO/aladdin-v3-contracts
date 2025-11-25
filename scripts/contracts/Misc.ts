import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { Overrides } from "ethers";
import { network } from "hardhat";

import { selectDeployments } from "@/utils/deploys";

import { contractDeploy } from "./helpers";

export interface MiscDeployment {
  MultiMerkleStash: string;
  MultiMerkleStashConcentrator: string;
  MultiMerkleStashCLever: string;
}

export async function deploy(deployer: HardhatEthersSigner, overrides?: Overrides): Promise<MiscDeployment> {
  const deployment = selectDeployments(network.name, "Misc");

  if (!deployment.get("MultiMerkleStash")) {
    const address = await contractDeploy(deployer, "MultiMerkleStash", "MultiMerkleStash", [], overrides);
    deployment.set("MultiMerkleStash", address);
  } else {
    console.log("Found MultiMerkleStash at:", deployment.get("MultiMerkleStash"));
  }
  if (!deployment.get("MultiMerkleStashConcentrator")) {
    const address = await contractDeploy(deployer, "MultiMerkleStashConcentrator", "MultiMerkleStash", [], overrides);
    deployment.set("MultiMerkleStashConcentrator", address);
  } else {
    console.log("Found MultiMerkleStashConcentrator at:", deployment.get("MultiMerkleStashConcentrator"));
  }
  if (!deployment.get("MultiMerkleStashCLever")) {
    const address = await contractDeploy(deployer, "MultiMerkleStashCLever", "MultiMerkleStash", [], overrides);
    deployment.set("MultiMerkleStashCLever", address);
  } else {
    console.log("Found MultiMerkleStashCLever at:", deployment.get("MultiMerkleStashCLever"));
  }
  return deployment.toObject() as MiscDeployment;
}
