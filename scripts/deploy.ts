/* eslint-disable node/no-missing-import */
import { ethers } from "hardhat";
import { AladdinConvexVault, AladdinConvexVaultZap, AladdinCRV, AladdinCRVZap, ProxyAdmin } from "../typechain";

const config: {
  acrv?: string;
  vault?: string;
  acrvZap?: string;
  vaultZap?: string;
  proxyAdmin?: string;
} = {
  acrv: "0x2b95A1Dcc3D405535f9ed33c219ab38E8d7e0884",
  vault: "0xc8fF37F7d057dF1BB9Ad681b53Fa4726f268E0e8",
  proxyAdmin: "0x71Fb0cc62139766383C0F09F1E31375023592841",
  acrvZap: "0x12b1326459d72F2Ab081116bf27ca46cD97762A0",
  vaultZap: "0x5EB30ce188B0abb89A942cED6Cbe114F4d852082",
};

const PLATFORM = "0x07dA2d30E26802ED65a52859a50872cfA615bD0A";
const WITHDRAW_FEE_PERCENTAGE = 1e7; // 1%
const PLATFORM_FEE_PERCENTAGE = 2e8; // 20%
const HARVEST_BOUNTY_PERCENTAGE = 5e7; // 5%
const CRV = "0xD533a949740bb3306d119CC777fa900bA034cd52";
const CVX = "0x4e3FBD56CD56c3e72c1403e103b45Db9da5B9D2B";
const LDO = "0x5A98FcBEA516Cf06857215779Fd812CA3beF1B32";
const SPELL = "0x090185f2135308BaD17527004364eBcC2D37e5F6";
const FXS = "0x3432B6A60D23Ca0dFCa7761B7ab56459D9C964D0";
const ALCX = "0xdBdb4d16EdA451D0503b854CF79D55697F90c8DF";

const VAULTS: [number, string[]][] = [
  [25, [CRV, CVX, LDO]], // steth
  [32, [CRV, CVX, FXS]], // frax
  [36, [CRV, CVX, ALCX]], // alusd
  [38, [CRV, CVX]], // tricrypto2
  [40, [CRV, CVX, SPELL]], // mim
  [41, [CRV, CVX]], // cvxcrv
  [49, [CRV, CVX]], // aleth
  [52, [CRV, CVX]], // mim-ust
  [59, [CRV, CVX]], // ust-wormhole
  [61, [CRV, CVX]], // crveth
  [64, [CRV, CVX]], // cvxeth
  [66, [CRV, CVX]], // spelleth
  [67, [CRV, CVX]], // teth
  [68, [CRV, CVX]], // yfieth
  [69, [CRV, CVX]], // fxseth
];

let proxyAdmin: ProxyAdmin;
let acrv: AladdinCRV;
let acrvZap: AladdinCRVZap;
let vault: AladdinConvexVault;
let vaultZap: AladdinConvexVaultZap;

async function addVaults() {
  for (const [pid, rewards] of VAULTS) {
    console.log("Adding pool with pid:", pid, "rewards:", rewards.join("/"));
    const tx = await vault.addPool(
      pid,
      rewards,
      WITHDRAW_FEE_PERCENTAGE,
      PLATFORM_FEE_PERCENTAGE,
      HARVEST_BOUNTY_PERCENTAGE
    );
    await tx.wait();
    console.log("Added with tx:", tx.hash);
  }
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
      WITHDRAW_FEE_PERCENTAGE,
      PLATFORM_FEE_PERCENTAGE,
      HARVEST_BOUNTY_PERCENTAGE,
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

  await addVaults();
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
