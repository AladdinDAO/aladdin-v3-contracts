/* eslint-disable node/no-missing-import */
import { ethers } from "hardhat";
import { AladdinCVX } from "../typechain";
import { DEPLOYED_CONTRACTS, TOKENS } from "./utils";

const config: {
  initialRatio: string;
  AMORatio: {
    min: string;
    max: string;
  };
  LPRatio: {
    min: string;
    max: string;
  };
  abcCVX: string;
} = {
  initialRatio: "1.0",
  AMORatio: {
    max: "0",
    min: "0",
  },
  LPRatio: {
    min: "0",
    max: "0",
  },
  abcCVX: "0xe7DB2A11EF266f209Fb61849Ac362eBfbd7b2774",
};

let acvx: AladdinCVX;

async function main() {
  const [deployer] = await ethers.getSigners();

  const proxyAdmin = await ethers.getContractAt("ProxyAdmin", DEPLOYED_CONTRACTS.CLever.ProxyAdmin, deployer);

  if (config.abcCVX !== "") {
    acvx = await ethers.getContractAt("AladdinCVX", config.abcCVX, deployer);
    console.log("Found AladdinCVX at:", acvx.address);
  } else {
    const AladdinCVX = await ethers.getContractFactory("AladdinCVX", deployer);
    const impl = await AladdinCVX.deploy(
      TOKENS.CVX.address,
      DEPLOYED_CONTRACTS.CLever.CLeverCVX.clevCVX,
      DEPLOYED_CONTRACTS.CLever.Gauge.Curve_clevCVX_CVX.pool,
      DEPLOYED_CONTRACTS.CLever.Gauge.Curve_clevCVX_CVX.token,
      DEPLOYED_CONTRACTS.CLever.CLeverCVX.FurnaceForCVX,
      DEPLOYED_CONTRACTS.CLever.Gauge.Curve_clevCVX_CVX.gauge,
      DEPLOYED_CONTRACTS.CLever.CLEVMinter
    );
    console.log("Deploying AladdinCVX Impl, hash:", impl.deployTransaction.hash);
    await impl.deployed();
    console.log("✅ Deploy AladdinCVX Impl at:", impl.address);

    const data = impl.interface.encodeFunctionData("initialize", [
      ethers.utils.parseEther(config.initialRatio),
      [DEPLOYED_CONTRACTS.CLever.CLEV],
    ]);
    const TransparentUpgradeableProxy = await ethers.getContractFactory("TransparentUpgradeableProxy", deployer);
    const proxy = await TransparentUpgradeableProxy.deploy(impl.address, proxyAdmin.address, data);
    console.log("Deploying AladdinCVX Proxy, hash:", proxy.deployTransaction.hash);
    await proxy.deployed();
    acvx = await ethers.getContractAt("AladdinCVX", proxy.address, deployer);
    console.log("✅ Deploy AladdinCVX Proxy at:", acvx.address);
  }
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
