import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { BigNumberish, Contract, ContractReceipt, PayableOverrides } from "ethers";
import { ethers } from "hardhat";

export async function contractDeploy(
  deployer: SignerWithAddress,
  name: string,
  args: Array<any>,
  overrides?: PayableOverrides
): Promise<string> {
  const contract = await ethers.getContractFactory(name, deployer);

  console.log(`\nDeploying ${name}...`);
  const instance = overrides ? await contract.deploy(...args, overrides) : await contract.deploy(...args);
  console.log("  transaction hash:", instance.deployTransaction.hash);
  const receipt = await instance.deployTransaction.wait();
  console.log("  ✅ Done, deployed at:", instance.address, "gas used:", receipt.gasUsed.toString());

  return instance.address;
}

export async function contractCall(
  contract: Contract,
  desc: string,
  method: string,
  args: Array<any>,
  value?: BigNumberish
): Promise<ContractReceipt> {
  console.log(`\n${desc}`);
  const tx = await contract[method](...args, { value: value });
  console.log("  transaction hash:", tx.hash);
  const receipt: ContractReceipt = await tx.wait();
  console.log("  ✅ Done, gas used:", receipt.gasUsed.toString());

  return receipt;
}

export function abiEncode(types: Array<string>, args: Array<any>): string {
  return ethers.utils.defaultAbiCoder.encode(types, args);
}
