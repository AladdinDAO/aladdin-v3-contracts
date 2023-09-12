import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { Contract, ContractReceipt, PayableOverrides, constants } from "ethers";
import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";

export async function contractDeploy(
  deployer: SignerWithAddress,
  desc: string,
  name: string,
  args: Array<any>,
  overrides?: PayableOverrides
): Promise<string> {
  const contract = await ethers.getContractFactory(name, deployer);

  console.log(`\nDeploying ${desc} ...`);
  const instance = overrides ? await contract.deploy(...args, overrides) : await contract.deploy(...args);
  console.log("  transaction hash:", instance.deployTransaction.hash);
  const receipt = await instance.deployTransaction.wait();
  console.log("  ✅ Done, deployed at:", instance.address, "gas used:", receipt.gasUsed.toString());

  return instance.address;
}

export async function minimalProxyDeploy(
  deployer: SignerWithAddress,
  name: string,
  implementation: string,
  overrides?: PayableOverrides
): Promise<string> {
  console.log(`\nDeploying Minimal Proxy for ${name} ...`);
  const tx = await deployer.sendTransaction({
    data: concat(["0x3d602d80600a3d3981f3363d3d373d3d3d363d73", implementation, "0x5af43d82803e903d91602b57fd5bf3"]),
    gasPrice: overrides?.gasPrice,
    maxFeePerGas: overrides?.maxFeePerGas,
    maxPriorityFeePerGas: overrides?.maxPriorityFeePerGas,
    gasLimit: overrides?.gasLimit,
  });
  console.log("  transaction hash:", tx.hash);
  const receipt = await tx.wait();
  console.log("  ✅ Done, deployed at:", receipt.contractAddress, "gas used:", receipt.gasUsed.toString());

  return receipt.contractAddress;
}

export async function contractCall(
  contract: Contract,
  desc: string,
  method: string,
  args: Array<any>,
  overrides?: PayableOverrides
): Promise<ContractReceipt> {
  console.log(`\n${desc}`);
  const tx = overrides ? await contract[method](...args, overrides) : await contract[method](...args);
  console.log("  transaction hash:", tx.hash);
  const receipt: ContractReceipt = await tx.wait();
  console.log("  ✅ Done, gas used:", receipt.gasUsed.toString());

  return receipt;
}

export async function ownerContractCall(
  contract: Contract,
  desc: string,
  method: string,
  args: Array<any>,
  overrides?: PayableOverrides
): Promise<ContractReceipt | undefined> {
  const owner = await contract.callStatic.owner();
  if (owner === (await contract.signer.getAddress())) {
    return contractCall(contract, desc, method, args, overrides);
  } else {
    console.log(`\n${desc}:`);
    console.log("  target:", contract.address);
    console.log("  method:", method);
    console.log("  args:", args.map((x) => x.toString()).join(", "));
    return undefined;
  }
}

export async function adminContractCall(
  contract: Contract,
  desc: string,
  method: string,
  args: Array<any>,
  overrides?: PayableOverrides
): Promise<ContractReceipt | undefined> {
  const isAdmin = await contract.callStatic.hasRole(constants.HashZero, await contract.signer.getAddress());
  if (isAdmin) {
    return contractCall(contract, desc, method, args, overrides);
  } else {
    console.log(`\n${desc}:`);
    console.log("  target:", contract.address);
    console.log("  method:", method);
    console.log("  args:", args.map((x) => x.toString()).join(", "));
    return undefined;
  }
}

export function abiEncode(types: Array<string>, args: Array<any>): string {
  return ethers.utils.defaultAbiCoder.encode(types, args);
}
