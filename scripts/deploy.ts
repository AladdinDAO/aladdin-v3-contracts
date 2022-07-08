/* eslint-disable node/no-missing-import */
import { ethers } from "hardhat";
import {
  AladdinConvexVault,
  AladdinConvexVaultZap,
  AladdinCRV,
  AladdinCRVZap,
  AladdinZap,
  ProxyAdmin,
} from "../typechain";
import { ACRV_VAULTS, ADDRESS, encodePoolHint, VAULT_CONFIG } from "./utils";

const config: {
  acrv?: string;
  vault?: string;
  acrvZap?: string;
  vaultZap?: string;
  proxyAdmin?: string;
  aladdinZap?: string;
} = {
  acrv: "0x2b95A1Dcc3D405535f9ed33c219ab38E8d7e0884",
  vault: "0xc8fF37F7d057dF1BB9Ad681b53Fa4726f268E0e8",
  proxyAdmin: "0x12b1326459d72F2Ab081116bf27ca46cD97762A0",
  acrvZap: "0x5EB30ce188B0abb89A942cED6Cbe114F4d852082",
  vaultZap: "0x71Fb0cc62139766383C0F09F1E31375023592841",
  aladdinZap: "0x1104b4DF568fa7Af90B1Bed1D78A2F71e748dc8a",
};

const PLATFORM = "0xc40549aa1D05C30af23a1C4a5af6bA11FCAFe23F";
const ACRV_WITHDRAW_FEE_PERCENTAGE = 2.5e6; // 0.25%
const ACRV_PLATFORM_FEE_PERCENTAGE = 2.5e7; // 2.5%
const ACRV_HARVEST_BOUNTY_PERCENTAGE = 2.5e7; // 2.5%

let proxyAdmin: ProxyAdmin;
let acrv: AladdinCRV;
let acrvZap: AladdinCRVZap;
let vault: AladdinConvexVault;
let vaultZap: AladdinConvexVaultZap;
let aladdinZap: AladdinZap;

// eslint-disable-next-line no-unused-vars
async function addVaults() {
  for (const { name, fees } of ACRV_VAULTS) {
    const rewards = VAULT_CONFIG[name].rewards;
    const convexId = VAULT_CONFIG[name].convexId;
    console.log("Adding pool with pid:", convexId, "rewards:", rewards.join("/"));
    const tx = await vault.addPool(convexId, rewards, fees.withdraw, fees.platform, fees.harvest);
    console.log("wait for tx:", tx.hash);
    await tx.wait();
    console.log("Added with tx:", tx.hash);
  }
}

// deprecated in current version
// eslint-disable-next-line no-unused-vars
async function setupRoutes() {
  let tx = await vaultZap.updateRoute(ADDRESS.WETH, ADDRESS.CRV, [
    encodePoolHint("0x8301AE4fc9c624d1D396cbDAa1ed877821D7C511", 4, 0, 1),
  ]);
  console.log("wait for tx:", tx.hash);
  await tx.wait();
  tx = await vaultZap.updateRoute(ADDRESS.CVX, ADDRESS.WETH, [
    encodePoolHint("0xB576491F1E6e5E62f1d8F26062Ee822B40B0E0d4", 4, 1, 0),
  ]);
  console.log("wait for tx:", tx.hash);
  await tx.wait();
  tx = await vaultZap.updateRoute(ADDRESS.LDO, ADDRESS.WETH, [
    encodePoolHint("0xC558F600B34A5f69dD2f0D06Cb8A88d829B7420a", 0, 0, 1),
  ]);
  console.log("wait for tx:", tx.hash);
  await tx.wait();
  tx = await vaultZap.updateRoute(ADDRESS.FXS, ADDRESS.WETH, [
    encodePoolHint("0xCD8286b48936cDAC20518247dBD310ab681A9fBf", 1, 0, 1),
  ]);
  console.log("wait for tx:", tx.hash);
  await tx.wait();
}

async function main() {
  const [deployer] = await ethers.getSigners();

  if (config.proxyAdmin) {
    proxyAdmin = await ethers.getContractAt("ProxyAdmin", config.proxyAdmin, deployer);
    console.log("Found ProxyAdmin at:", proxyAdmin.address);
  } else {
    const ProxyAdmin = await ethers.getContractFactory("ProxyAdmin", deployer);
    proxyAdmin = await ProxyAdmin.deploy();
    await proxyAdmin.deployed();
    console.log("Deploy ProxyAdmin at:", proxyAdmin.address);
  }

  if (config.acrvZap) {
    acrvZap = await ethers.getContractAt("AladdinCRVZap", config.acrvZap, deployer);
    console.log("Found AladdinCRVZap at:", acrvZap.address);
  } else {
    const AladdinCRVZap = await ethers.getContractFactory("AladdinCRVZap", deployer);
    acrvZap = await AladdinCRVZap.deploy();
    await acrvZap.deployed();
    console.log("Deploy AladdinCRVZap at:", acrvZap.address);
  }

  if (config.vaultZap) {
    vaultZap = await ethers.getContractAt("AladdinConvexVaultZap", config.vaultZap, deployer);
    console.log("Found AladdinConvexVaultZap at:", vaultZap.address);
  } else {
    const AladdinConvexVaultZap = await ethers.getContractFactory("AladdinConvexVaultZap", deployer);
    vaultZap = await AladdinConvexVaultZap.deploy();
    await vaultZap.deployed();
    console.log("Deploy AladdinConvexVaultZap at:", vaultZap.address);
  }

  if (config.acrv) {
    acrv = await ethers.getContractAt("AladdinCRV", config.acrv, deployer);
    console.log("Found AladdinCRV at:", acrv.address);
  } else {
    const AladdinCRV = await ethers.getContractFactory("AladdinCRV", deployer);
    const acrvImpl = await AladdinCRV.deploy();
    await acrvImpl.deployed();
    console.log("Deploy AladdinCRV Impl at:", acrvImpl.address);

    const data = acrvImpl.interface.encodeFunctionData("initialize", [
      acrvZap.address,
      PLATFORM,
      ACRV_WITHDRAW_FEE_PERCENTAGE,
      ACRV_PLATFORM_FEE_PERCENTAGE,
      ACRV_HARVEST_BOUNTY_PERCENTAGE,
    ]);
    const TransparentUpgradeableProxy = await ethers.getContractFactory("TransparentUpgradeableProxy", deployer);
    const proxy = await TransparentUpgradeableProxy.deploy(acrvImpl.address, proxyAdmin.address, data);
    await proxy.deployed();
    acrv = await ethers.getContractAt("AladdinCRV", proxy.address, deployer);
    console.log("Deploy AladdinCRV at:", acrv.address);
  }

  if (config.vault) {
    vault = await ethers.getContractAt("AladdinConvexVault", config.vault, deployer);
    console.log("Found AladdinConvexVault at:", vault.address);
  } else {
    const AladdinConvexVault = await ethers.getContractFactory("AladdinConvexVault", deployer);
    const vaultImpl = await AladdinConvexVault.deploy();
    console.log("Deploy AladdinConvexVault Impl at:", vaultImpl.address);

    const data = vaultImpl.interface.encodeFunctionData("initialize", [acrv.address, vaultZap.address, PLATFORM]);
    const TransparentUpgradeableProxy = await ethers.getContractFactory("TransparentUpgradeableProxy", deployer);
    const proxy = await TransparentUpgradeableProxy.deploy(vaultImpl.address, proxyAdmin.address, data);
    await proxy.deployed();
    vault = await ethers.getContractAt("AladdinConvexVault", proxy.address, deployer);
    console.log("Deploy AladdinConvexVault at:", vault.address);
  }

  if (config.aladdinZap) {
    aladdinZap = await ethers.getContractAt("AladdinZap", config.aladdinZap, deployer);
    console.log("Found AladdinZap at:", aladdinZap.address);
  } else {
    const AladdinZap = await ethers.getContractFactory("AladdinZap", deployer);
    const impl = await AladdinZap.deploy();
    await impl.deployed();
    console.log("Deploy AladdinZap Impl at:", impl.address);

    const data = impl.interface.encodeFunctionData("initialize");
    const TransparentUpgradeableProxy = await ethers.getContractFactory("TransparentUpgradeableProxy", deployer);
    const proxy = await TransparentUpgradeableProxy.deploy(impl.address, proxyAdmin.address, data);
    await proxy.deployed();
    aladdinZap = await ethers.getContractAt("AladdinZap", proxy.address, deployer);
    console.log("Deploy AladdinZap at:", proxy.address);
  }

  await addVaults();
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
