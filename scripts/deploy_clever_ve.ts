/* eslint-disable node/no-missing-import */
import { ethers } from "hardhat";
import { CLEV, FeeDistributor, GaugeController, LiquidityGaugeV3, Minter, VeCLEV } from "../typechain";
import { ADDRESS } from "./utils";

const config: {
  CLEV: string;
  veCLEV: string;
  Minter: string;
  GaugeController: string;
  FeeDistributor: string;
  CVXGauge: string;
  USDCGauge: string;
} = {
  CLEV: "0x84C82d43f1Cc64730849f3E389fE3f6d776F7A4E",
  veCLEV: "0xB9CD9979718e7E4C341D8D99dA3F1290c908FBdd",
  Minter: "0xDA486F390025641b529C50327b2e092837D96670",
  GaugeController: "0x3abf0BE21E5020007B6e2e201E292a7119bC2b0d",
  FeeDistributor: "0xBb7Be026A31a5c442021D33D550EF921F7758D14",
  CVXGauge: "0x858D62CE483B8ab538d1f9254C3Fd3Efe1c5346F",
  USDCGauge: "0xb926f1567943992a1CF6868930d0A0BDC896fdcB",
};

let clev: CLEV;
let ve: VeCLEV;
let minter: Minter;
let controller: GaugeController;
let distributor: FeeDistributor;
let guageUSDC: LiquidityGaugeV3;
let guageCVX: LiquidityGaugeV3;

async function main() {
  const [deployer] = await ethers.getSigners();

  if (config.CLEV !== "") {
    clev = await ethers.getContractAt("CLEV", config.CLEV, deployer);
    console.log("Found CLEV at:", clev.address);
  } else {
    const CLEV = await ethers.getContractFactory("CLEV", deployer);
    clev = await CLEV.deploy("CLever Token", "CLEV", 18);
    console.log("Deploying CLEV, hash:", clev.deployTransaction.hash);
    await clev.deployed();
    config.CLEV = clev.address;
    console.log("✅ Deploy CLEV at:", clev.address);
  }

  if (config.veCLEV !== "") {
    ve = (await ethers.getContractAt("veCLEV", config.veCLEV, deployer)) as VeCLEV;
    console.log("Found veCLEV at:", ve.address);
  } else {
    const veCLEV = await ethers.getContractFactory("veCLEV", deployer);
    ve = (await veCLEV.deploy(clev.address, "Voting Escrow CLEV", "veCLEV", "1.0.0")) as VeCLEV;
    console.log("Deploying veCLEV, hash:", ve.deployTransaction.hash);
    await ve.deployed();
    config.veCLEV = ve.address;
    console.log("✅ Deploy veCLEV at:", ve.address);
  }

  if (config.GaugeController !== "") {
    controller = await ethers.getContractAt("GaugeController", config.GaugeController, deployer);
    console.log("Found GaugeController at:", controller.address);
  } else {
    const GaugeController = await ethers.getContractFactory("GaugeController", deployer);
    controller = await GaugeController.deploy(clev.address, ve.address);
    console.log("Deploying GaugeController, hash:", controller.deployTransaction.hash);
    await controller.deployed();
    config.GaugeController = controller.address;
    console.log("✅ Deploy GaugeController at:", controller.address);
  }

  if (config.Minter !== "") {
    minter = await ethers.getContractAt("Minter", config.Minter, deployer);
    console.log("Found Minter at:", minter.address);
  } else {
    const Minter = await ethers.getContractFactory("Minter", deployer);
    minter = await Minter.deploy(clev.address, controller.address);
    console.log("Deploying Minter, hash:", minter.deployTransaction.hash);
    await minter.deployed();
    config.Minter = minter.address;
    console.log("✅ Deploy Minter at:", minter.address);
  }

  if (config.FeeDistributor !== "") {
    distributor = await ethers.getContractAt("FeeDistributor", config.FeeDistributor, deployer);
    console.log("Found FeeDistributor at:", distributor.address);
  } else {
    const FeeDistributor = await ethers.getContractFactory("FeeDistributor", deployer);
    distributor = await FeeDistributor.deploy(ve.address, 0, clev.address, deployer.address, deployer.address);
    console.log("Deploying FeeDistributor, hash:", distributor.deployTransaction.hash);
    await distributor.deployed();
    config.FeeDistributor = distributor.address;
    console.log("✅ Deploy FeeDistributor at:", distributor.address);
  }

  if (config.USDCGauge !== "") {
    guageUSDC = await ethers.getContractAt("LiquidityGaugeV3", config.USDCGauge, deployer);
    console.log("Found USDC Gauge at:", guageUSDC.address);
  } else {
    const LiquidityGaugeV3 = await ethers.getContractFactory("LiquidityGaugeV3", deployer);
    guageUSDC = await LiquidityGaugeV3.deploy(ADDRESS.USDC, minter.address, deployer.address);
    console.log("Deploying USDC Gauge, hash:", guageUSDC.deployTransaction.hash);
    await guageUSDC.deployed();
    config.USDCGauge = guageUSDC.address;
    console.log("✅ Deploy USDC Gauge at:", guageUSDC.address);
  }

  if (config.CVXGauge !== "") {
    guageCVX = await ethers.getContractAt("LiquidityGaugeV3", config.CVXGauge, deployer);
    console.log("Found CVX Gauge at:", guageCVX.address);
  } else {
    const LiquidityGaugeV3 = await ethers.getContractFactory("LiquidityGaugeV3", deployer);
    guageCVX = await LiquidityGaugeV3.deploy(ADDRESS.CVX, minter.address, deployer.address);
    console.log("Deploying CVX Gauge, hash:", guageCVX.deployTransaction.hash);
    await guageCVX.deployed();
    config.CVXGauge = guageCVX.address;
    console.log("✅ Deploy CVX Gauge at:", guageCVX.address);
  }

  console.log(await clev.minter());

  if ((await clev.minter()) !== minter.address) {
    const tx = await clev.set_minter(minter.address);
    console.log("set minter, hash:", tx.hash);
    const receipt = await tx.wait();
    console.log("✅ Done, gas used", receipt.gasUsed.toString());
  }
  if ((await controller.gauge_type_names(0)) !== "Liquidity") {
    const tx = await controller["add_type(string,uint256)"]("Liquidity", "1000000000000000000");
    console.log("add type, hash:", tx.hash);
    const receipt = await tx.wait();
    console.log("✅ Done, gas used", receipt.gasUsed.toString());
  }
  if ((await controller.get_gauge_weight(guageUSDC.address)).isZero()) {
    const tx = await controller["add_gauge(address,int128,uint256)"](guageUSDC.address, 0, "1");
    console.log("add USDC Gauge, hash:", tx.hash);
    const receipt = await tx.wait();
    console.log("✅ Done, gas used", receipt.gasUsed.toString());
  }
  if ((await controller.get_gauge_weight(guageCVX.address)).isZero()) {
    const tx = await controller["add_gauge(address,int128,uint256)"](guageCVX.address, 0, "1");
    console.log("add CVX Gauge, hash:", tx.hash);
    const receipt = await tx.wait();
    console.log("✅ Done, gas used", receipt.gasUsed.toString());
  }

  await clev.transfer("0x866D12EE5DEd88fc4f585723Fd47B419C357a711", ethers.utils.parseUnits("10000"));
  await clev.transfer("0xb9a1649b31FC2De6bbE78672A3d6EbecFa69B56b", ethers.utils.parseUnits("10000"));
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
