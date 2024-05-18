import { ZeroAddress, toBigInt } from "ethers";
import { ethers, network } from "hardhat";

import { DeploymentHelper, abiDecode, contractCall, ensureDeployer } from "@/contracts/helpers";
import { same } from "../utils";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

const maxFeePerGas = ethers.parseUnits("10", "gwei");
const maxPriorityFeePerGas = ethers.parseUnits("0.01", "gwei");

async function doUpgrade(
  admin: HardhatEthersSigner,
  desc: string,
  proxyAddr: string,
  implAddr: string,
  newAdmin: string
) {
  const proxy = await ethers.getContractAt("TransparentUpgradeableProxy", proxyAddr, admin);
  try {
    const [proxyImplementation] = abiDecode(
      ["address"],
      await ethers.provider.call({
        to: await proxy.getAddress(),
        from: admin.address,
        data: proxy.interface.encodeFunctionData("implementation"),
      })
    );
    if (!same(proxyImplementation, implAddr)) {
      await contractCall(proxy.connect(admin), desc + " set implementation", "upgradeTo", [implAddr]);
    }
  } catch (_) {
    await ethers.provider.call({
      to: await proxy.getAddress(),
      from: newAdmin,
      data: proxy.interface.encodeFunctionData("implementation"),
    });
  }
  try {
    const [proxyAdmin] = abiDecode(
      ["address"],
      await ethers.provider.call({
        to: await proxy.getAddress(),
        from: admin.address,
        data: proxy.interface.encodeFunctionData("admin"),
      })
    );
    if (!same(proxyAdmin, newAdmin)) {
      await contractCall(proxy.connect(admin), " change admin", "changeAdmin", [newAdmin]);
    }
  } catch (_) {
    await ethers.provider.call({
      to: await proxy.getAddress(),
      from: newAdmin,
      data: proxy.interface.encodeFunctionData("admin"),
    });
  }
}

async function main() {
  const overrides = {
    maxFeePerGas: toBigInt(maxFeePerGas),
    maxPriorityFeePerGas: toBigInt(maxPriorityFeePerGas),
  };

  const deployer = await ensureDeployer(network.name);
  const deployment = new DeploymentHelper(network.name, "Fx.Fake", deployer, overrides);
  await deployment.contractDeploy("EmptyContract", "EmptyContract", "EmptyContract", []);
  for (let i = 1; i <= 11; ++i) {
    await deployment.proxyDeploy(
      `Proxy.A${i}`,
      `Proxy.A${i}`,
      deployment.get("EmptyContract"),
      deployment.deployer.address,
      "0x"
    );
  }
  await deployment.contractDeploy("GovernanceToken", `GovernanceToken implementation`, "GovernanceToken", []);
  await deployment.contractDeploy("ProxyAdmin", `ProxyAdmin`, "ProxyAdmin", []);
  await doUpgrade(
    deployer,
    "Proxy.A11",
    deployment.get("Proxy.A11"),
    deployment.get("GovernanceToken"),
    deployment.get("ProxyAdmin")
  );
  const fxn = await ethers.getContractAt("GovernanceToken", deployment.get("Proxy.A11"), deployer);
  // initialize FXN
  if ((await fxn.admin({ gasLimit: 1e6 })) === ZeroAddress) {
    await contractCall(
      fxn,
      "initialize FXN",
      "initialize",
      [
        ethers.parseEther("1020000"), // initial supply
        ethers.parseEther("98000") / (86400n * 365n), // initial rate, 10%,
        1111111111111111111n, // rate reduction coefficient, 1/0.9 * 1e18,
        deployer.address,
        "FXN Token",
        "FXN",
      ],
      overrides
    );
  }
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
