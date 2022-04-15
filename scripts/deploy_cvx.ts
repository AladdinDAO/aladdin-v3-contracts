/* eslint-disable node/no-missing-import */
import { ethers } from "hardhat";
import { Action, encodePoolHintV2, PoolType } from "../test/utils";
import { AladdinZap, CLeverCVXLocker, CLeverToken, ProxyAdmin, Furnace } from "../typechain";

const config: {
  proxyAdmin?: string;
  aladdinZap?: string;
  clevCVX?: string;
  furnace?: string;
  cvxLocker?: string;
} = {
  proxyAdmin: "0xf05e58fCeA29ab4dA01A495140B349F8410Ba904",
  aladdinZap: "0xCe4dCc5028588377E279255c0335Effe2d7aB72a",
  clevCVX: "0xdC846CcbCe1Be474E6410445ef5223CA00eCed94",
  furnace: "0xa85C8645D094FfA36CBD41554F0Dd484EBb99D19",
  cvxLocker: "0x86b7631F4c11750Da2b4494696b8953E5F1D0ddf",
};

const PLATFORM = "0xc40549aa1D05C30af23a1C4a5af6bA11FCAFe23F";
const PLATFORM_FEE_PERCENTAGE = 2.5e7; // 2.5%
const HARVEST_BOUNTY_PERCENTAGE = 2.5e7; // 2.5%
const CVX = "0x4e3FBD56CD56c3e72c1403e103b45Db9da5B9D2B";
const CVXCRV = "0x62B9c7356A2Dc64a1969e19C23e4f579F9810Aa7";

let proxyAdmin: ProxyAdmin;
let aladdinZap: AladdinZap;
let clevCVX: CLeverToken;
let furnace: Furnace;
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

  if (config.furnace) {
    furnace = await ethers.getContractAt("Furnace", config.furnace, deployer);
    console.log("Found Furnace at:", furnace.address);
  } else {
    const Furnace = await ethers.getContractFactory("Furnace", deployer);
    const impl = await Furnace.deploy();
    await impl.deployed();
    console.log("Deploy Furnace Impl at:", impl.address);

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
    furnace = await ethers.getContractAt("Furnace", proxy.address, deployer);
    console.log("Deploy Furnace at:", furnace.address);
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
      furnace.address,
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
  await furnace.updateWhitelists([cvxLocker.address], true);

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
