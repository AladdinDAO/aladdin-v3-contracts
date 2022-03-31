/* eslint-disable node/no-missing-import */
import { ethers } from "hardhat";
import { AladdinCVXLocker, AladdinZap, AldCVX, ProxyAdmin, Transmuter } from "../typechain";

const config: {
  proxyAdmin?: string;
  aladdinZap?: string;
  aldCVX?: string;
  transmuter?: string;
  cvxLocker?: string;
} = {
  proxyAdmin: "0x12b1326459d72F2Ab081116bf27ca46cD97762A0",
  aladdinZap: "0x1104b4DF568fa7Af90B1Bed1D78A2F71e748dc8a",
  aldCVX: "0x96C68D861aDa016Ed98c30C810879F9df7c64154",
  transmuter: "0x8f714C0aDd9608D3Df71da6d9751F267Fbc883bC",
  cvxLocker: "0x38d009Db1A7357150e00942Dd6E5bEe5De7AFd78",
};

const PLATFORM = "0xc40549aa1D05C30af23a1C4a5af6bA11FCAFe23F";
const PLATFORM_FEE_PERCENTAGE = 2.5e7; // 2.5%
const HARVEST_BOUNTY_PERCENTAGE = 2.5e7; // 2.5%

let proxyAdmin: ProxyAdmin;
let aladdinZap: AladdinZap;
let aldCVX: AldCVX;
let transmuter: Transmuter;
let cvxLocker: AladdinCVXLocker;

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

  if (config.aldCVX) {
    aldCVX = (await ethers.getContractAt("aldCVX", config.aldCVX, deployer)) as AldCVX;
    console.log("Found aldCVX at:", aldCVX.address);
  } else {
    const AldCVX = await ethers.getContractFactory("aldCVX", deployer);
    aldCVX = (await AldCVX.deploy()) as AldCVX;
    await aldCVX.deployed();
    console.log("Deploy aldCVX at:", aldCVX.address);
  }

  if (config.transmuter) {
    transmuter = await ethers.getContractAt("Transmuter", config.transmuter, deployer);
    console.log("Found Transmuter at:", transmuter.address);
  } else {
    const Transmuter = await ethers.getContractFactory("Transmuter", deployer);
    const impl = await Transmuter.deploy();
    await impl.deployed();
    console.log("Deploy Transmuter Impl at:", impl.address);

    const data = impl.interface.encodeFunctionData("initialize", [
      deployer.address,
      aldCVX.address,
      aladdinZap.address,
      PLATFORM,
      PLATFORM_FEE_PERCENTAGE,
      HARVEST_BOUNTY_PERCENTAGE,
    ]);
    const TransparentUpgradeableProxy = await ethers.getContractFactory("TransparentUpgradeableProxy", deployer);
    const proxy = await TransparentUpgradeableProxy.deploy(impl.address, proxyAdmin.address, data);
    await proxy.deployed();
    transmuter = await ethers.getContractAt("Transmuter", proxy.address, deployer);
    console.log("Deploy Transmuter at:", transmuter.address);
  }

  if (config.cvxLocker) {
    cvxLocker = await ethers.getContractAt("AladdinCVXLocker", config.cvxLocker, deployer);
    console.log("Found AladdinCVXLocker at:", cvxLocker.address);
  } else {
    const AladdinCVXLocker = await ethers.getContractFactory("AladdinCVXLocker", deployer);
    const impl = await AladdinCVXLocker.deploy();
    await impl.deployed();
    console.log("Deploy AladdinCVXLocker Impl at:", impl.address);

    const data = impl.interface.encodeFunctionData("initialize", [
      deployer.address,
      aldCVX.address,
      aladdinZap.address,
      PLATFORM,
      PLATFORM_FEE_PERCENTAGE,
      HARVEST_BOUNTY_PERCENTAGE,
    ]);
    const TransparentUpgradeableProxy = await ethers.getContractFactory("TransparentUpgradeableProxy", deployer);
    const proxy = await TransparentUpgradeableProxy.deploy(impl.address, proxyAdmin.address, data);
    await proxy.deployed();
    cvxLocker = await ethers.getContractAt("AladdinCVXLocker", proxy.address, deployer);
    console.log("Deploy AladdinCVXLocker at:", cvxLocker.address);
  }

  // await transmuter.updateWhitelists([cvxLocker.address], true);

  // for test only
  // await aldCVX.updateMinters([deployer.address, transmuter.address], true);
  // await aldCVX.updateCeiling(deployer.address, ethers.utils.parseEther("100000000"));
  // await aldCVX.updateCeiling(transmuter.address, ethers.utils.parseEther("100000000"));
  await aldCVX.mint("0x07dA2d30E26802ED65a52859a50872cfA615bD0A", ethers.utils.parseEther("1000"));
  await aldCVX.mint("0x6c54956f6357Ea8B9108d4457325Fd91a34a631b", ethers.utils.parseEther("1000"));
  await aldCVX.mint("0xb9a1649b31FC2De6bbE78672A3d6EbecFa69B56b", ethers.utils.parseEther("1000"));
  await aldCVX.mint("0x450EeEb4D62C246FEB65476C3B8639ef4876D125", ethers.utils.parseEther("1000"));
  await aldCVX.mint("0x866D12EE5DEd88fc4f585723Fd47B419C357a711", ethers.utils.parseEther("1000"));
  await aldCVX.mint("0x7BCD36CEf6eb25BE0fcC107014fB9fA5C5AA8cdA", ethers.utils.parseEther("1000"));
  await aldCVX.mint("0x6B20c929b3743698C200E53a5C7cF5515eb730C2", ethers.utils.parseEther("1000"));
  await aldCVX.mint("0x5af776fc4321f55a9e518eef7db133fa7c833556", ethers.utils.parseEther("1000"));
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
