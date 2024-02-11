import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import editJsonFile from "edit-json-file";
import {
  BaseContract,
  BytesLike,
  Result,
  TransactionReceipt,
  ZeroAddress,
  ZeroHash,
  concat,
  getAddress,
  id,
} from "ethers";
import { ethers } from "hardhat";

import { PayableOverrides } from "@/types/common";
import { AccessControl } from "@/types/index";
import { selectDeployments } from "@/utils/deploys";
import { ProxyAdmin } from "../@types";

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

  console.log(`>> Deploying ${desc} ...`);
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
  console.log(`>> Deploying Minimal Proxy for ${name} ...`);
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
  console.log(`>> ${desc}`);
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
  contract: BaseContract,
  desc: string,
  method: string,
  args: Array<any>,
  overrides?: PayableOverrides
): Promise<TransactionReceipt | undefined> {
  const signer = contract.runner! as HardhatEthersSigner;
  let owner: string = ZeroAddress;
  if (contract.interface.hasFunction("owner")) {
    owner = await contract.getFunction("owner").staticCall({ gasLimit: 1e6 });
  } else if (contract.interface.hasFunction("admin")) {
    owner = await contract.getFunction("admin").staticCall({ gasLimit: 1e6 });
  } else if (contract.interface.hasFunction("hasRole")) {
    const isAdmin = await contract.getFunction("hasRole").staticCall(ZeroHash, await signer.getAddress());
    if (isAdmin) owner = await signer.getAddress();
  }
  if (owner.toLowerCase() === (await signer.getAddress()).toLowerCase()) {
    return contractCall(contract, desc, method, args, overrides);
  } else {
    console.log(`>> ${desc}:`);
    console.log("  owner/admin:", owner);
    console.log("  target:", await contract.getAddress());
    console.log("  method:", method);
    console.log("  args:", JSON.stringify(args, replacer));
    console.log("  raw:", contract.interface.encodeFunctionData(method, args));
    return undefined;
  }
}

export async function upgradeCall(
  admin: ProxyAdmin,
  desc: string,
  proxy: string,
  implementation: string,
  overrides?: PayableOverrides
) {
  if ((await admin.getProxyImplementation(proxy)) !== getAddress(implementation)) {
    await ownerContractCall(admin, "ProxyAdmin upgrade " + desc, "upgrade", [proxy, implementation], overrides);
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
  fork_mainnet_10547: "0xa1d0027Ca4C0CB79f9403d06A29470abC7b0a468",
  fork_phalcon: "0xa1d0027Ca4C0CB79f9403d06A29470abC7b0a468",
};

export async function ensureDeployer(network: string): Promise<HardhatEthersSigner> {
  const [deployer] = await ethers.getSigners();
  if (deployer.address.toLowerCase() !== ExpectedDeployers[network]?.toLowerCase()) {
    throw Error(`invalid deployer[${deployer.address}] expected[${ExpectedDeployers[network]}]`);
  }
  console.log(
    `deployer[${deployer.address}]`,
    `balance[${ethers.formatEther(await ethers.provider.getBalance(deployer.address, "latest"))}]`
  );
  return deployer;
}

export class DeploymentHelper {
  public static marker: Record<string, boolean> = {};
  public readonly network: string;
  public readonly namespace: string;
  public readonly storage: editJsonFile.JsonEditor;
  public readonly deployer: HardhatEthersSigner;
  public readonly overrides?: PayableOverrides;

  constructor(network: string, namespace: string, deployer: HardhatEthersSigner, overrides?: PayableOverrides) {
    this.network = network;
    this.namespace = namespace;
    this.storage = selectDeployments(network, namespace);
    this.deployer = deployer;
    this.overrides = overrides;

    const key = id(this.network + this.namespace);
    if (!DeploymentHelper.marker[key]) {
      DeploymentHelper.marker[key] = true;
      console.log(`\nNetwork[${network}] Namespace[${namespace}]`);
    }
  }

  public async contractDeploy(selector: string, desc: string, name: string, args: Array<any>): Promise<string> {
    const key = id(this.network + this.namespace + selector);
    if (!this.storage.get(selector)) {
      const address = await contractDeploy(this.deployer, desc, name, args, this.overrides);
      this.storage.set(selector, address);
    } else if (!DeploymentHelper.marker[key]) {
      console.log(`  Found ${desc} at:`, this.storage.get(selector));
    }
    DeploymentHelper.marker[key] = true;
    return this.storage.get(selector);
  }

  public async proxyDeploy(
    selector: string,
    desc: string,
    implementation: string,
    admin: string,
    initializer: string
  ): Promise<string> {
    return this.contractDeploy(selector, desc, "TransparentUpgradeableProxy", [implementation, admin, initializer]);
  }

  public async minimalProxyDeploy(selector: string, desc: string, implementation: string): Promise<string> {
    const key = id(this.network + this.namespace + selector);
    if (!this.storage.get(selector)) {
      const address = await minimalProxyDeploy(this.deployer, desc, implementation, this.overrides);
      this.storage.set(selector, address);
    } else if (!DeploymentHelper.marker[key]) {
      console.log(`  Found ${desc} at:`, this.storage.get(selector));
    }
    DeploymentHelper.marker[key] = true;
    return this.storage.get(selector);
  }

  public get(selector: string): any {
    return this.storage.get(selector);
  }

  public toObject(): object {
    return this.storage.toObject();
  }
}

export class ContractCallHelper {
  public readonly deployer: HardhatEthersSigner;
  public readonly overrides?: PayableOverrides;

  constructor(deployer: HardhatEthersSigner, overrides?: PayableOverrides) {
    this.deployer = deployer;
    this.overrides = overrides;
  }

  public async getContract(name: string, address: string): Promise<BaseContract> {
    return ethers.getContractAt(name, address, this.deployer);
  }

  public async call(
    contract: BaseContract,
    desc: string,
    method: string,
    args: Array<any>
  ): Promise<TransactionReceipt> {
    return contractCall(contract, desc, method, args, this.overrides);
  }

  public async ownerCall(
    contract: BaseContract,
    desc: string,
    method: string,
    args: Array<any>
  ): Promise<TransactionReceipt | undefined> {
    return ownerContractCall(contract, desc, method, args, this.overrides);
  }

  public async grantRole(contract: string, desc: string, role: string, account: string) {
    const control = (await this.getContract(
      "@openzeppelin/contracts/access/AccessControl.sol:AccessControl",
      contract
    )) as AccessControl;
    if (!(await control.hasRole(role, account))) {
      await this.ownerCall(control, `${desc} grant to ${account}`, "grantRole", [role, account]);
    }
  }
}
