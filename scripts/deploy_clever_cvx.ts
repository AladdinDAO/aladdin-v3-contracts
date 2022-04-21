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
  proxyAdmin: "0x12b1326459d72F2Ab081116bf27ca46cD97762A0",
  aladdinZap: "0x1104b4DF568fa7Af90B1Bed1D78A2F71e748dc8a",
  clevCVX: "0xf05e58fCeA29ab4dA01A495140B349F8410Ba904",
  furnace: "0xCe4dCc5028588377E279255c0335Effe2d7aB72a",
  cvxLocker: "0x96C68D861aDa016Ed98c30C810879F9df7c64154",
};

const KEEPER = "0x11E91BB6d1334585AA37D8F4fde3932C7960B938";
const PLATFORM = "0xFC08757c505eA28709dF66E54870fB6dE09f0C5E";
const PLATFORM_FEE_PERCENTAGE = 2e7; // 2%
const HARVEST_BOUNTY_PERCENTAGE = 1e7; // 1%
const RESERVE_RATE = 5e8; // 50%
const STAKE_PERCENTAGE = 8e8; // 80%
const STAKE_THRESHOLD = ethers.utils.parseEther("10");
const CVX = "0x4e3FBD56CD56c3e72c1403e103b45Db9da5B9D2B";
const CVXCRV = "0x62B9c7356A2Dc64a1969e19C23e4f579F9810Aa7";

let proxyAdmin: ProxyAdmin;
let aladdinZap: AladdinZap;
let clevCVX: CLeverToken;
let furnace: Furnace;
let cvxLocker: CLeverCVXLocker;

async function initialSetup() {
  // 1. cvxcrv ==> crv with CurveFactoryPlainPool
  // 2. crv ==> eth with CurveCryptoPool
  // 3. eth ==> cvx with CurveCryptoPool
  console.log(
    "setup cvxCRV => CVX route:",
    `from[${CVXCRV}]`,
    `to[${CVX}]`,
    `routes[${encodePoolHintV2(
      "0x9D0464996170c6B9e75eED71c68B99dDEDf279e8",
      PoolType.CurveFactoryPlainPool,
      2,
      1,
      0,
      Action.Swap
    ).toString()},${encodePoolHintV2(
      "0x8301AE4fc9c624d1D396cbDAa1ed877821D7C511",
      PoolType.CurveCryptoPool,
      2,
      1,
      0,
      Action.Swap
    ).toString()},${encodePoolHintV2(
      "0xB576491F1E6e5E62f1d8F26062Ee822B40B0E0d4",
      PoolType.CurveCryptoPool,
      2,
      0,
      1,
      Action.Swap
    ).toString()}]`
  );

  let tx = await cvxLocker.updateReserveRate(RESERVE_RATE);
  console.log("setup reserve rate in tx:", tx.hash);
  let receipt = await tx.wait();
  console.log("done, gas used:", receipt.gasUsed.toString());

  tx = await cvxLocker.updateStakePercentage(STAKE_PERCENTAGE);
  console.log("setup stake percentage in Locker in tx:", tx.hash);
  receipt = await tx.wait();
  console.log("done, gas used:", receipt.gasUsed.toString());

  tx = await cvxLocker.updateStakeThreshold(STAKE_THRESHOLD);
  console.log("setup stake threshold in Locker in tx:", tx.hash);
  receipt = await tx.wait();
  console.log("done, gas used:", receipt.gasUsed.toString());

  tx = await furnace.updateWhitelists([cvxLocker.address], true);
  console.log("setup furnace whitelists in tx:", tx.hash);
  receipt = await tx.wait();
  console.log("done, gas used:", receipt.gasUsed.toString());

  tx = await furnace.updateStakePercentage(STAKE_PERCENTAGE);
  console.log("setup stake percentage in Furnace in tx:", tx.hash);
  receipt = await tx.wait();
  console.log("done, gas used:", receipt.gasUsed.toString());

  tx = await furnace.updateStakeThreshold(STAKE_THRESHOLD);
  console.log("setup stake threshold in Furnace in tx:", tx.hash);
  receipt = await tx.wait();
  console.log("done, gas used:", receipt.gasUsed.toString());

  tx = await clevCVX.updateMinters([cvxLocker.address], true);
  console.log("setup minter in tx:", tx.hash);
  receipt = await tx.wait();
  console.log("done, gas used:", receipt.gasUsed.toString());

  tx = await clevCVX.updateCeiling(cvxLocker.address, ethers.utils.parseEther("1000000"));
  console.log("setup minter ceiling in tx:", tx.hash);
  receipt = await tx.wait();
  console.log("done, gas used:", receipt.gasUsed.toString());

  tx = await cvxLocker.updateKeepers([KEEPER], true);
  console.log("setup keeper in tx:", tx.hash);
  receipt = await tx.wait();
  console.log("done, gas used:", receipt.gasUsed.toString());
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

  await initialSetup();
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
