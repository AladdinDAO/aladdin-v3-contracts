/* eslint-disable node/no-missing-import */
import { ethers } from "hardhat";
import { AladdinFXS, AladdinFXSConvexVault, CompounderGateway, ProxyAdmin } from "../typechain";
import { ADDRESS, AFXS_VAULTS, DEPLOYED_CONTRACTS, VAULT_CONFIG } from "./utils";

const config: {
  PlatformFee: number;
  HarvestFee: number;
  WithdrawFee: number;
  ProxyAdmin: string;
  aFXS: string;
  CompounderGateway: string;
  AladdinFXSConvexVault: string;
} = {
  PlatformFee: 25000000, // 2.5%
  HarvestFee: 25000000, // 2.5%
  WithdrawFee: 2500000, // 0.25%
  ProxyAdmin: "0x1Ea204f50526429C7BcEd629EB402954Cf5eb760",
  aFXS: "0xDAF03D70Fe637b91bA6E521A32E1Fb39256d3EC9",
  CompounderGateway: "0x883Fd355deBF417F82Aa9a3E2936971487F7Df1F",
  AladdinFXSConvexVault: "0xD6E3BB7b1D6Fa75A71d48CFB10096d59ABbf99E1",
};

let proxyAdmin: ProxyAdmin;
let aFXS: AladdinFXS;
let gateway: CompounderGateway;
let aladdinFXSConvexVault: AladdinFXSConvexVault;

// eslint-disable-next-line no-unused-vars
async function addVaults(from?: number, to?: number) {
  for (const { name, fees } of AFXS_VAULTS.slice(from, to)) {
    const rewards = VAULT_CONFIG[name].rewards;
    const convexId = VAULT_CONFIG[name].convexId;
    console.log(`Adding pool[${name}] with convexId[${convexId}], rewards[${rewards.join("/")}]`);
    const tx = await aladdinFXSConvexVault.addPool(convexId, rewards, fees.withdraw, fees.platform, fees.harvest);
    console.log("wait for tx:", tx.hash);
    await tx.wait();
    console.log("Added with tx:", tx.hash);
  }
}

async function main() {
  const [deployer] = await ethers.getSigners();

  if (config.ProxyAdmin !== "") {
    proxyAdmin = await ethers.getContractAt("ProxyAdmin", config.ProxyAdmin, deployer);
    console.log("Found ProxyAdmin at:", proxyAdmin.address);
  } else {
    const ProxyAdmin = await ethers.getContractFactory("ProxyAdmin", deployer);
    proxyAdmin = await ProxyAdmin.deploy();
    console.log("Deploying ProxyAdmin, hash:", proxyAdmin.deployTransaction.hash);
    await proxyAdmin.deployed();
    config.ProxyAdmin = proxyAdmin.address;
    console.log("✅ Deploy ProxyAdmin at:", proxyAdmin.address);
  }

  if (config.aFXS !== "") {
    aFXS = await ethers.getContractAt("AladdinFXS", config.aFXS, deployer);
    console.log("Found AladdinFXS at:", aFXS.address);
  } else {
    const AladdinFXS = await ethers.getContractFactory("AladdinFXS", deployer);
    const impl = await AladdinFXS.deploy();
    console.log("Deploying AladdinFXS Impl, hash:", impl.deployTransaction.hash);
    await impl.deployed();
    console.log("✅ Deploy AladdinFXS Impl at:", impl.address);

    const data = impl.interface.encodeFunctionData("initialize", [
      DEPLOYED_CONTRACTS.AladdinZap,
      [ADDRESS.FXS, ADDRESS.CRV, ADDRESS.CVX],
    ]);
    const TransparentUpgradeableProxy = await ethers.getContractFactory("TransparentUpgradeableProxy", deployer);
    const proxy = await TransparentUpgradeableProxy.deploy(impl.address, config.ProxyAdmin, data);
    console.log("Deploying AladdinFXS Proxy, hash:", proxy.deployTransaction.hash);
    await proxy.deployed();
    aFXS = await ethers.getContractAt("AladdinFXS", proxy.address, deployer);
    console.log("✅ Deploy AladdinFXS Proxy at:", aFXS.address);
  }

  if (config.CompounderGateway !== "") {
    gateway = await ethers.getContractAt("CompounderGateway", config.CompounderGateway, deployer);
    console.log("Found CompounderGateway at:", gateway.address);
  } else {
    const CompounderGateway = await ethers.getContractFactory("CompounderGateway", deployer);
    gateway = await CompounderGateway.deploy(DEPLOYED_CONTRACTS.TokenZapLogic);
    console.log("Deploying CompounderGateway, hash:", gateway.deployTransaction.hash);
    await gateway.deployed();
    config.CompounderGateway = gateway.address;
    console.log("Deploy CompounderGateway at:", gateway.address);
  }

  if ((await aFXS.feeInfo()).platform !== DEPLOYED_CONTRACTS.Concentrator.Treasury) {
    const tx = await aFXS.updateFeeInfo(
      DEPLOYED_CONTRACTS.Concentrator.Treasury,
      config.PlatformFee,
      config.HarvestFee,
      config.WithdrawFee
    );
    console.log("updateFeeInfo for aFXS, hash:", tx.hash);
    const receipt = await tx.wait();
    console.log("✅ Done, gas used:", receipt.gasUsed);
  }

  if (config.AladdinFXSConvexVault !== "") {
    aladdinFXSConvexVault = await ethers.getContractAt("AladdinFXSConvexVault", config.AladdinFXSConvexVault, deployer);
    console.log("Found AladdinFXSConvexVault at:", aladdinFXSConvexVault.address);
  } else {
    const AladdinFXSConvexVault = await ethers.getContractFactory("AladdinFXSConvexVault", deployer);
    const impl = await AladdinFXSConvexVault.deploy();
    console.log("Deploying AladdinFXSConvexVault Impl, hash:", impl.deployTransaction.hash);
    await impl.deployed();
    console.log("✅ Deploy AladdinFXSConvexVault Impl at:", impl.address);

    const data = impl.interface.encodeFunctionData("initialize", [
      aFXS.address,
      DEPLOYED_CONTRACTS.AladdinZap,
      DEPLOYED_CONTRACTS.Concentrator.Treasury,
    ]);
    const TransparentUpgradeableProxy = await ethers.getContractFactory("TransparentUpgradeableProxy", deployer);
    const proxy = await TransparentUpgradeableProxy.deploy(impl.address, config.ProxyAdmin, data);
    console.log("Deploying AladdinFXSConvexVault Proxy, hash:", proxy.deployTransaction.hash);
    await proxy.deployed();
    aladdinFXSConvexVault = await ethers.getContractAt("AladdinFXSConvexVault", proxy.address, deployer);
    console.log("✅ Deploy AladdinFXSConvexVault Proxy at:", aladdinFXSConvexVault.address);
  }

  await addVaults();
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
