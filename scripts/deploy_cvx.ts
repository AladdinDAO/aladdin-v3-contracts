/* eslint-disable node/no-missing-import */
import { ethers } from "hardhat";
import { Action, encodePoolHintV2, PoolType } from "../test/utils";
import { AladdinZap, CLeverCVXLocker, CLeverToken, ProxyAdmin, Transmuter } from "../typechain";

const config: {
  proxyAdmin?: string;
  aladdinZap?: string;
  clevCVX?: string;
  transmuter?: string;
  cvxLocker?: string;
} = {
  proxyAdmin: "0xA5C45440dc6CE020a21B374A753260FeA1A908DD",
  aladdinZap: "0x3Cf54F3A1969be9916DAD548f3C084331C4450b5",
  clevCVX: "0xf9Ee4aBCBA5823148850BA49d93238177accbB64",
  transmuter: "0xc0d436ba02Ac6b793ada0a5Cedb658a6f7E0532d",
  cvxLocker: "0xD7CfcdDeACB9c829aa240eb71dC6ae7e6C883d4B",
};

const PLATFORM = "0xc40549aa1D05C30af23a1C4a5af6bA11FCAFe23F";
const PLATFORM_FEE_PERCENTAGE = 2.5e7; // 2.5%
const HARVEST_BOUNTY_PERCENTAGE = 2.5e7; // 2.5%
const CVX = "0x4e3FBD56CD56c3e72c1403e103b45Db9da5B9D2B";
const CVXCRV = "0x62B9c7356A2Dc64a1969e19C23e4f579F9810Aa7";

let proxyAdmin: ProxyAdmin;
let aladdinZap: AladdinZap;
let clevCVX: CLeverToken;
let transmuter: Transmuter;
let cvxLocker: CLeverCVXLocker;

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

  if (config.clevCVX) {
    clevCVX = (await ethers.getContractAt("CLeverToken", config.clevCVX, deployer)) as CLeverToken;
    console.log("Found clevCVX at:", clevCVX.address);
  } else {
    const CLeverToken = await ethers.getContractFactory("CLeverToken", deployer);
    clevCVX = (await CLeverToken.deploy("CLever CVX", "clevCVX")) as CLeverToken;
    await clevCVX.deployed();
    console.log("Deploy clevCVX at:", clevCVX.address);
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
      clevCVX.address,
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
    cvxLocker = await ethers.getContractAt("CLeverCVXLocker", config.cvxLocker, deployer);
    console.log("Found CLeverCVXLocker at:", cvxLocker.address);
  } else {
    const CLeverCVXLocker = await ethers.getContractFactory("CLeverCVXLocker", deployer);
    const impl = await CLeverCVXLocker.deploy();
    await impl.deployed();
    console.log("Deploy CLeverCVXLocker Impl at:", impl.address);

    const data = impl.interface.encodeFunctionData("initialize", [
      deployer.address,
      clevCVX.address,
      aladdinZap.address,
      transmuter.address,
      PLATFORM,
      PLATFORM_FEE_PERCENTAGE,
      HARVEST_BOUNTY_PERCENTAGE,
    ]);
    const TransparentUpgradeableProxy = await ethers.getContractFactory("TransparentUpgradeableProxy", deployer);
    const proxy = await TransparentUpgradeableProxy.deploy(impl.address, proxyAdmin.address, data);
    await proxy.deployed();
    cvxLocker = await ethers.getContractAt("CLeverCVXLocker", proxy.address, deployer);
    console.log("Deploy CLeverCVXLocker at:", cvxLocker.address);
  }

  // 1. cvxcrv ==> crv with CurveFactoryPlainPool
  // 2. crv ==> eth with CurveCryptoPool
  // 3. eth ==> cvx with UniswapV2
  await aladdinZap.updateRoute(CVXCRV, CVX, [
    encodePoolHintV2(
      "0x9D0464996170c6B9e75eED71c68B99dDEDf279e8",
      PoolType.CurveFactoryPlainPool,
      2,
      1,
      0,
      Action.Swap
    ),
    encodePoolHintV2("0x8301AE4fc9c624d1D396cbDAa1ed877821D7C511", PoolType.CurveCryptoPool, 2, 1, 0, Action.Swap),
    encodePoolHintV2("0x05767d9EF41dC40689678fFca0608878fb3dE906", PoolType.UniswapV2, 2, 1, 0, Action.Swap),
  ]);

  await cvxLocker.updateReserveRate(500000000);
  await transmuter.updateWhitelists([cvxLocker.address], true);

  // for test only
  await clevCVX.updateMinters([deployer.address, cvxLocker.address], true);
  await clevCVX.updateCeiling(deployer.address, ethers.utils.parseEther("100000000"));
  await clevCVX.updateCeiling(cvxLocker.address, ethers.utils.parseEther("100000000"));
  await cvxLocker.updateStakePercentage(500000000);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
