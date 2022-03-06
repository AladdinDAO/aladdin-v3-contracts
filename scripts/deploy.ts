/* eslint-disable node/no-missing-import */
import { ethers } from "hardhat";
import { encodePoolHint } from "../test/utils";
import { AladdinConvexVault, AladdinConvexVaultZap, AladdinCRV, AladdinCRVZap, ProxyAdmin } from "../typechain";

const config: {
  acrv?: string;
  vault?: string;
  acrvZap?: string;
  vaultZap?: string;
  proxyAdmin?: string;
} = {
  acrv: undefined,
  vault: undefined,
  proxyAdmin: undefined,
  acrvZap: undefined,
  vaultZap: undefined,
};

// TODO: change it on mainnet deploy
const PLATFORM = "0xc40549aa1D05C30af23a1C4a5af6bA11FCAFe23F";
const ACRV_WITHDRAW_FEE_PERCENTAGE = 2.5e6; // 0.25%
const ACRV_PLATFORM_FEE_PERCENTAGE = 2.5e7; // 2.5%
const ACRV_HARVEST_BOUNTY_PERCENTAGE = 2.5e7; // 2.5%
const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
const CRV = "0xD533a949740bb3306d119CC777fa900bA034cd52";
const CVX = "0x4e3FBD56CD56c3e72c1403e103b45Db9da5B9D2B";
const LDO = "0x5A98FcBEA516Cf06857215779Fd812CA3beF1B32";
const FXS = "0x3432B6A60D23Ca0dFCa7761B7ab56459D9C964D0";
// const ALCX = "0xdBdb4d16EdA451D0503b854CF79D55697F90c8DF";
// const SPELL = "0x090185f2135308BaD17527004364eBcC2D37e5F6";

const VAULTS: {
  name: string;
  convexId: number;
  rewards: string[];
  withdrawFee: number;
  harvestBounty: number;
  platformFee: number;
}[] = [
  // steth, 0.04% withdraw fee, 0.5% harvest bounty, 0.5% platform fee
  { name: "steth", convexId: 25, rewards: [CRV, CVX, LDO], withdrawFee: 4e5, harvestBounty: 5e6, platformFee: 5e6 },
  // frax, 0.04% withdraw fee, 0.5% harvest bounty, 0.5% platform fee
  { name: "frax", convexId: 32, rewards: [CRV, CVX, FXS], withdrawFee: 4e5, harvestBounty: 5e6, platformFee: 5e6 },
  // tricrypto2, 0.08% withdraw fee, 0.5% harvest bounty, 0.5% platform fee
  { name: "tricrypto2", convexId: 38, rewards: [CRV, CVX], withdrawFee: 8e5, harvestBounty: 5e6, platformFee: 5e6 },
  // cvxcrv, 0.30% withdraw fee, 0.5% harvest bounty, 0.5% platform fee
  { name: "cvxcrv", convexId: 41, rewards: [CRV, CVX], withdrawFee: 30e5, harvestBounty: 5e6, platformFee: 5e6 },
  // crveth, 0.28% withdraw fee, 0.5% harvest bounty, 0.5% platform fee
  { name: "crveth", convexId: 61, rewards: [CRV, CVX], withdrawFee: 28e5, harvestBounty: 5e6, platformFee: 5e6 },
  // cvxeth, 0.27% withdraw fee, 0.5% harvest bounty, 0.5% platform fee
  { name: "cvxeth", convexId: 64, rewards: [CRV, CVX], withdrawFee: 27e5, harvestBounty: 5e6, platformFee: 5e6 },
  // cvxfxs, 0.31% withdraw fee, 0.5% harvest bounty, 0.5% platform fee
  { name: "cvxfxs", convexId: 72, rewards: [CVX, CRV, FXS], withdrawFee: 31e5, harvestBounty: 5e6, platformFee: 5e6 },

  /*
  [36, [CRV, CVX, ALCX]], // alusd
  [40, [CRV, CVX, SPELL]], // mim
  [41, [CRV, CVX]], // cvxcrv
  [49, [CRV, CVX]], // aleth
  [52, [CRV, CVX]], // mim-ust
  [59, [CRV, CVX]], // ust-wormhole
  [66, [CRV, CVX]], // spelleth
  [67, [CRV, CVX]], // teth
  [68, [CRV, CVX]], // yfieth
  [69, [CRV, CVX]], // fxseth */
];

let proxyAdmin: ProxyAdmin;
let acrv: AladdinCRV;
let acrvZap: AladdinCRVZap;
let vault: AladdinConvexVault;
let vaultZap: AladdinConvexVaultZap;

async function addVaults() {
  for (const { convexId, rewards, withdrawFee, harvestBounty, platformFee } of VAULTS) {
    console.log("Adding pool with pid:", convexId, "rewards:", rewards.join("/"));
    const tx = await vault.addPool(convexId, rewards, withdrawFee, platformFee, harvestBounty);
    await tx.wait();
    console.log("Added with tx:", tx.hash);
  }
}
async function setupRoutes() {
  await vaultZap.updateRoute(WETH, CRV, [encodePoolHint("0x8301AE4fc9c624d1D396cbDAa1ed877821D7C511", 4, 0, 1)]);
  await vaultZap.updateRoute(CVX, WETH, [encodePoolHint("0xB576491F1E6e5E62f1d8F26062Ee822B40B0E0d4", 4, 1, 0)]);
  await vaultZap.updateRoute(LDO, WETH, [encodePoolHint("0xC558F600B34A5f69dD2f0D06Cb8A88d829B7420a", 0, 0, 1)]);
  await vaultZap.updateRoute(FXS, WETH, [encodePoolHint("0xCD8286b48936cDAC20518247dBD310ab681A9fBf", 1, 0, 1)]);
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

  await addVaults();
  await setupRoutes();
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
