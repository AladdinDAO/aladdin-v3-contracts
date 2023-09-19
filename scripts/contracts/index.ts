import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { PayableOverrides } from "@typechain/common";
import { BaseContract, Contract, TransactionReceipt, ZeroAddress, ZeroHash, concat } from "ethers";
import { ethers } from "hardhat";

export async function contractDeploy(
  deployer: HardhatEthersSigner,
  desc: string,
  name: string,
  args: Array<any>,
  overrides?: PayableOverrides
): Promise<string> {
  const contract = await ethers.getContractFactory(name, deployer);

  console.log(`\nDeploying ${desc} ...`);
  const instance = overrides ? await contract.deploy(...args, overrides) : await contract.deploy(...args);
  console.log("  transaction hash:", instance.deploymentTransaction()?.hash);
  const receipt = await instance.deploymentTransaction()?.wait();
  const address = await instance.getAddress();
  console.log("  ✅ Done, deployed at:", address, "gas used:", receipt!.gasUsed.toString());

  return address;
}

export async function minimalProxyDeploy(
  deployer: HardhatEthersSigner,
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
  console.log("  ✅ Done, deployed at:", receipt!.contractAddress, "gas used:", receipt!.gasUsed.toString());

  return receipt!.contractAddress!;
}

export async function contractCall(
  contract: BaseContract,
  desc: string,
  method: string,
  args: Array<any>,
  overrides?: PayableOverrides
): Promise<TransactionReceipt> {
  console.log(`\n${desc}`);
  const estimated = await contract.getFunction(method).estimateGas(...args);
  if (overrides) {
    overrides.gasLimit = (estimated * 12n) / 10n;
  }
  const tx = overrides
    ? await contract.getFunction(method)(...args, overrides)
    : await contract.getFunction(method)(...args);
  console.log(`  EstimatedGas[${estimated.toString()}] transaction hash[${tx.hash}]`);
  const receipt: TransactionReceipt = await tx.wait();
  console.log("  ✅ Done, gas used:", receipt.gasUsed.toString());

  return receipt;
}

export async function ownerContractCall(
  contract: Contract,
  desc: string,
  method: string,
  args: Array<any>,
  overrides?: PayableOverrides
): Promise<TransactionReceipt | undefined> {
  const signer = contract.runner! as HardhatEthersSigner;
  let owner: string = ZeroAddress;
  if (contract.owner) {
    owner = await contract.owner.staticCall({ gasLimit: 1e6 });
  } else if (contract.admin) {
    owner = await contract.admin.staticCall({ gasLimit: 1e6 });
  } else if (contract.hasRole) {
    const isAdmin = await contract.hasRole.staticCall(ZeroHash, await signer.getAddress());
    if (isAdmin) owner = await signer.getAddress();
  }
  if (owner.toLowerCase() === (await signer.getAddress()).toLowerCase()) {
    return contractCall(contract, desc, method, args, overrides);
  } else {
    console.log(`\n${desc}:`);
    console.log("  target:", await contract.getAddress());
    console.log("  method:", method);
    console.log("  args:", args.map((x) => x.toString()).join(", "));
    return undefined;
  }
}

export function abiEncode(types: Array<string>, args: Array<any>): string {
  return ethers.AbiCoder.defaultAbiCoder().encode(types, args);
}
