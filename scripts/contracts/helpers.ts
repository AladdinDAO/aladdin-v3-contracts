import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { BaseContract, BytesLike, Contract, Result, TransactionReceipt, ZeroAddress, ZeroHash, concat } from "ethers";
import { ethers } from "hardhat";

import { PayableOverrides } from "@/types/common";

function replacer(key: any, value: any) {
  if (typeof value === "bigint") return value.toString();
  return value;
}

export async function contractDeploy(
  deployer: HardhatEthersSigner,
  desc: string,
  name: string,
  args: Array<any>,
  overrides?: PayableOverrides
): Promise<string> {
  const contract = await ethers.getContractFactory(name, deployer);

  console.log(`\nDeploying ${desc} ...`);
  console.log("  args:", JSON.stringify(args, replacer));
  const instance = overrides ? await contract.deploy(...args, overrides) : await contract.deploy(...args);
  console.log(`  TransactionHash[${instance.deploymentTransaction()?.hash}]`);
  const receipt = await instance.deploymentTransaction()?.wait();
  const address = await instance.getAddress();
  console.log(`  ✅ Done,`, `DeployedAt[${address}]`, `GasUsed[${receipt!.gasUsed.toString()}]`);

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
  console.log(`  TransactionHash[${tx.hash}]`);
  const receipt = await tx.wait();
  console.log(`  ✅ Done,`, `DeployedAt[${receipt!.contractAddress}]`, `GasUsed[${receipt!.gasUsed.toString()}]`);

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
  console.log("  target:", await contract.getAddress());
  console.log("  method:", method);
  console.log("  args:", JSON.stringify(args, replacer));
  console.log("  raw:", contract.interface.encodeFunctionData(method, args));
  const estimated = await contract.getFunction(method).estimateGas(...args);
  if (overrides) {
    overrides.gasLimit = (estimated * 12n) / 10n;
  }
  const tx = overrides
    ? await contract.getFunction(method)(...args, overrides)
    : await contract.getFunction(method)(...args);
  console.log(`  EstimatedGas[${estimated.toString()}] TransactionHash[${tx.hash}]`);
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
    console.log("  owner/admin:", owner);
    console.log("  target:", await contract.getAddress());
    console.log("  method:", method);
    console.log("  args:", JSON.stringify(args, replacer));
    console.log("  raw:", contract.interface.encodeFunctionData(method, args));
    return undefined;
  }
}

export function abiEncode(types: Array<string>, args: Array<any>): string {
  return ethers.AbiCoder.defaultAbiCoder().encode(types, args);
}

export function abiDecode(types: Array<string>, data: BytesLike): Result {
  return ethers.AbiCoder.defaultAbiCoder().decode(types, data);
}

export const ExpectedDeployers: { [network: string]: string } = {
  mainnet: "0xa1d0027Ca4C0CB79f9403d06A29470abC7b0a468",
  hermez: "0xa1d0a635f7b447b06836d9aC773b03f1F706bBC4",
  fork_mainnet_10548: "0xa1d0027Ca4C0CB79f9403d06A29470abC7b0a468",
};

export async function ensureDeployer(network: string): Promise<HardhatEthersSigner> {
  const [deployer] = await ethers.getSigners();
  if (deployer.address.toLowerCase() !== ExpectedDeployers[network]?.toLowerCase()) {
    throw Error(`invalid deployer[${deployer.address}] expected[${ExpectedDeployers[network]}]`);
  }
  console.log(
    `deployer[${deployer.address}]`,
    `balance[${ethers.formatEther(await ethers.provider.getBalance(deployer.address))}]`
  );
  return deployer;
}
