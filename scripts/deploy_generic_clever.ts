/* eslint-disable no-lone-blocks */
/* eslint-disable camelcase */
/* eslint-disable node/no-missing-import */
import { BigNumber } from "ethers";
import { ethers } from "hardhat";
import {
  AladdinCRVStrategy,
  AllInOneGateway,
  CLEV,
  CLeverToken,
  ConcentratorStrategy,
  FeeDistributor,
  GaugeController,
  MetaCLever,
  MetaCLever__factory,
  MetaFurnace,
  MetaFurnace__factory,
  Minter,
  TokenZapLogic,
  UpgradeableBeacon,
  VeCLEV,
} from "../typechain";
import { ADDRESS, DEPLOYED_CONTRACTS } from "./utils";

const config: {
  CLeverBeacon: string;
  FurnaceBeacon: string;
  TokenZapLogic: string;
  CRV: {
    underlying: string;
    clevCRV: string;
    Furnace: string;
    CLever: {
      acrv: {
        clever: string;
        reserveRate: number;
        mintCeiling: BigNumber;
        strategies: {
          aCRV: string;
        };
      };
    };
  };
  FRAX: {
    underlying: string;
    clevFRAX: string;
    Furnace: string;
    CLever: {
      FRAXUSDC: {
        clever: string;
        reserveRate: number;
        mintCeiling: BigNumber;
        strategies: {
          FRAXUSDC_All: string; // 100% aCRV are zapped to FRAX
          FRAXUSDC_Half: string; // only 50% aCRV are zapped to FRAX
        };
      };
    };
  };
  AllInOneGateway: string;
  Guage: {
    Curve_CLEV_ETH: string;
    Balancer_clevCVX_CVX: string;
    Curve_clevCVX_CVX: string;
  };
  CLEV: string;
  veCLEV: string;
  Minter: string;
  GaugeController: string;
  FeeDistributor: string;
} = {
  CLeverBeacon: "0xc00DCc8BAf41cBb7cB8a9e2D9a63f3aBD4626053",
  FurnaceBeacon: "0x71DCD832884Ff2c53785a74a50F92b270CF3f81f",
  TokenZapLogic: "0x5e21ADB35C431F2B954918a985A6B9B0F99ba35f",
  AllInOneGateway: "0xFd6404b7709BcC8903429F0d93a87798b20a6580",
  CRV: {
    underlying: ADDRESS.CRV,
    clevCRV: "0x45B0d6dA1fc14Ec78755Cd33Bdfa21c3B2b0D7c3",
    Furnace: "0x3d32aa18B9800bf1264EaEC9Bf605Ab669b0285B",
    CLever: {
      acrv: {
        clever: "0x9C7e0b181474124641b37d2269C1652397532B61",
        reserveRate: 5e8, // 50%
        mintCeiling: ethers.utils.parseEther("10000000"),
        strategies: {
          aCRV: "0xd9635E412ea7eAd5e3ABAd608E8077DA0A54996f",
        },
      },
    },
  },
  FRAX: {
    underlying: ADDRESS.FRAX,
    clevFRAX: "0x3CC69909Da81861A006106d10026e4869dAdA67e",
    Furnace: "0x8fa020ee7446a86ced2FC0ed45d73797Da839f5f",
    CLever: {
      FRAXUSDC: {
        clever: "0x9eDa2a19410ba61567ac252fB801bBC5d6e21122",
        reserveRate: 5e8, // 50%
        mintCeiling: ethers.utils.parseEther("10000000"),
        strategies: {
          FRAXUSDC_All: "0xa1F74fE8F1E3b7E77D29e9A09A986683929416e6",
          FRAXUSDC_Half: "0xd6446d12583566Af4816260269bcd6a22BeD7A1b",
        },
      },
    },
  },
  Guage: {
    Curve_CLEV_ETH: "",
    Balancer_clevCVX_CVX: "",
    Curve_clevCVX_CVX: "",
  },
  CLEV: "0xfAf31FD8e0CE11C754966416bFd8D60FbE39f612",
  veCLEV: "0xB99d40D1F799d11751c11b501b1A06EF28362EF4",
  GaugeController: "0xa909ED65eA10F59c61aF6ed4D457AAb70a889E04",
  Minter: "0xF3be7c9097275e525925aCb2BaC386C8D383a2f5",
  FeeDistributor: "0x6Cf43837F9ACB346A2EA5E55d1439559B112A34f",
};

const PLATFORM = "0xFC08757c505eA28709dF66E54870fB6dE09f0C5E";
const PLATFORM_FEE_PERCENTAGE = 2e7; // 2%
const HARVEST_BOUNTY_PERCENTAGE = 1e7; // 1%
const REPAY_FEE_PERCENTAGE = 5e7; // 5%

let cleverBeacon: UpgradeableBeacon;
let furnaceBeacon: UpgradeableBeacon;
let logic: TokenZapLogic;
let gateway: AllInOneGateway;

let clevCRV: CLeverToken;
let crvFurnace: MetaFurnace;
let clever_aCRV: MetaCLever;
let strategy_aCRV: AladdinCRVStrategy;

let clevFRAX: CLeverToken;
let fraxFurnace: MetaFurnace;
let clever_FRAXUSDC: MetaCLever;
let strategy_FRAXUSDC_All: ConcentratorStrategy;
let strategy_FRAXUSDC_Half: ConcentratorStrategy;

let clev: CLEV;
let ve: VeCLEV;
let minter: Minter;
let controller: GaugeController;
let distributor: FeeDistributor;

async function deployCRV() {
  const [deployer] = await ethers.getSigners();
  if (config.CRV.clevCRV !== "") {
    clevCRV = (await ethers.getContractAt("CLeverToken", config.CRV.clevCRV, deployer)) as CLeverToken;
    console.log("Found clevCRV at:", clevCRV.address);
  } else {
    const CLeverToken = await ethers.getContractFactory("CLeverToken", deployer);
    clevCRV = (await CLeverToken.deploy("CLever CRV", "clevCRV")) as CLeverToken;
    console.log("Deploying clevCRV, hash:", clevCRV.deployTransaction.hash);
    await clevCRV.deployed();
    console.log("✅ Deploy clevCRV at:", clevCRV.address);
    config.CRV.clevCRV = clevCRV.address;
  }

  if (config.CRV.Furnace !== "") {
    crvFurnace = await ethers.getContractAt("MetaFurnace", config.CRV.Furnace, deployer);
    console.log("Found MetaFurnace For CRV at:", crvFurnace.address);
  } else {
    const data = MetaFurnace__factory.createInterface().encodeFunctionData("initialize", [
      ADDRESS.CRV,
      clevCRV.address,
    ]);
    const BeaconProxy = await ethers.getContractFactory("BeaconProxy", deployer);
    const proxy = await BeaconProxy.deploy(furnaceBeacon.address, data);
    console.log("Deploying MetaFurnace For CRV, hash:", proxy.deployTransaction.hash);
    await proxy.deployed();
    crvFurnace = await ethers.getContractAt("MetaFurnace", proxy.address, deployer);
    console.log("✅ Deploy MetaFurnace For CRV at:", crvFurnace.address);
    config.CRV.Furnace = crvFurnace.address;
  }

  if (config.CRV.CLever.acrv.clever !== "") {
    clever_aCRV = await ethers.getContractAt("MetaCLever", config.CRV.CLever.acrv.clever, deployer);
    console.log("Found MetaCLever for aCRV at:", clever_aCRV.address);
  } else {
    const data = MetaCLever__factory.createInterface().encodeFunctionData("initialize", [
      clevCRV.address,
      crvFurnace.address,
    ]);
    const BeaconProxy = await ethers.getContractFactory("BeaconProxy", deployer);
    const proxy = await BeaconProxy.deploy(cleverBeacon.address, data);
    console.log("Deploying MetaCLever For aCRV, hash:", proxy.deployTransaction.hash);
    await proxy.deployed();
    clever_aCRV = await ethers.getContractAt("MetaCLever", proxy.address, deployer);
    console.log("✅ Deploy MetaCLever for aCRV, at:", clever_aCRV.address);
    config.CRV.CLever.acrv.clever = clever_aCRV.address;
  }

  if (config.CRV.CLever.acrv.strategies.aCRV !== "") {
    strategy_aCRV = await ethers.getContractAt("AladdinCRVStrategy", config.CRV.CLever.acrv.strategies.aCRV, deployer);
    console.log("Found AladdinCRVStrategy at:", strategy_aCRV.address);
  } else {
    const AladdinCRVStrategy = await ethers.getContractFactory("AladdinCRVStrategy", deployer);
    strategy_aCRV = await AladdinCRVStrategy.deploy(clever_aCRV.address);
    console.log("Deploying AladdinCRVStrategy, hash:", strategy_aCRV.deployTransaction.hash);
    await strategy_aCRV.deployed();
    console.log("✅ Deploy AladdinCRVStrategy at:", strategy_aCRV.address);
    config.CRV.CLever.acrv.strategies.aCRV = strategy_aCRV.address;
  }

  // setup
  if (!(await clever_aCRV.reserveRate()).eq(config.CRV.CLever.acrv.reserveRate)) {
    const tx = await clever_aCRV.updateReserveRate(config.CRV.CLever.acrv.reserveRate);
    console.log("Setup reserve rate for clever_aCRV, hash:", tx.hash);
    const receipt = await tx.wait();
    console.log("✅ Done, gas used:", receipt.gasUsed.toString());
  }

  const feeInfo = await clever_aCRV.feeInfo();
  if (
    feeInfo.platform !== PLATFORM ||
    feeInfo.platformPercentage !== PLATFORM_FEE_PERCENTAGE ||
    feeInfo.repayPercentage !== REPAY_FEE_PERCENTAGE ||
    feeInfo.bountyPercentage !== HARVEST_BOUNTY_PERCENTAGE
  ) {
    const tx = await clever_aCRV.updateFeeInfo(
      PLATFORM,
      PLATFORM_FEE_PERCENTAGE,
      HARVEST_BOUNTY_PERCENTAGE,
      REPAY_FEE_PERCENTAGE
    );
    console.log("Setup fees in clever_aCRV, hash:", tx.hash);
    const receipt = await tx.wait();
    console.log("✅ Done, gas used:", receipt.gasUsed.toString());
  }

  if (!(await crvFurnace.isWhitelisted(clever_aCRV.address))) {
    const tx = await crvFurnace.updateWhitelists([clever_aCRV.address], true);
    console.log("Add whitelist clever_aCRV to crvFurnace, hash:", tx.hash);
    const receipt = await tx.wait();
    console.log("✅ Done, gas used:", receipt.gasUsed.toString());
  }

  if (!(await clevCRV.isMinter(clever_aCRV.address))) {
    const tx = await clevCRV.updateMinters([clever_aCRV.address], true);
    console.log("Setup clever_aCRV as minter of clevCRV, hash:", tx.hash);
    const receipt = await tx.wait();
    console.log("✅ Done, gas used:", receipt.gasUsed.toString());
  }

  if (!(await clevCRV.minterInfo(clever_aCRV.address)).ceiling.eq(config.CRV.CLever.acrv.mintCeiling)) {
    const tx = await clevCRV.updateCeiling(clever_aCRV.address, config.CRV.CLever.acrv.mintCeiling);
    console.log("Setup minter ceiling for clever_aCRV, hash:", tx.hash);
    const receipt = await tx.wait();
    console.log("✅ Done, gas used:", receipt.gasUsed.toString());
  }

  const [, strategies] = await clever_aCRV.getActiveYieldStrategies();
  if (!strategies.includes(strategy_aCRV.address)) {
    const tx = await clever_aCRV.addYieldStrategy(strategy_aCRV.address, []);
    console.log("setup add AladdinCRVStrategy to clever_aCRV, hash:", tx.hash);
    const receipt = await tx.wait();
    console.log("✅ Done, gas used:", receipt.gasUsed.toString());
  }
}

async function deployFRAX() {
  const [deployer] = await ethers.getSigners();

  if (config.FRAX.clevFRAX !== "") {
    clevFRAX = (await ethers.getContractAt("CLeverToken", config.FRAX.clevFRAX, deployer)) as CLeverToken;
    console.log("Found clevFRAX at:", clevFRAX.address);
  } else {
    const CLeverToken = await ethers.getContractFactory("CLeverToken", deployer);
    clevFRAX = (await CLeverToken.deploy("CLever FRAX", "clevFRAX")) as CLeverToken;
    console.log("Deploying clevFRAX, hash:", clevFRAX.deployTransaction.hash);
    await clevFRAX.deployed();
    console.log("✅ Deploy clevFRAX at:", clevFRAX.address);
    config.FRAX.clevFRAX = clevFRAX.address;
  }

  if (config.FRAX.Furnace !== "") {
    fraxFurnace = await ethers.getContractAt("MetaFurnace", config.FRAX.Furnace, deployer);
    console.log("Found MetaFurnace For FRAX at:", fraxFurnace.address);
  } else {
    const data = MetaFurnace__factory.createInterface().encodeFunctionData("initialize", [
      ADDRESS.FRAX,
      clevFRAX.address,
    ]);
    const BeaconProxy = await ethers.getContractFactory("BeaconProxy", deployer);
    const proxy = await BeaconProxy.deploy(furnaceBeacon.address, data);
    console.log("Deploying MetaFurnace For FRAX, hash:", proxy.deployTransaction.hash);
    await proxy.deployed();
    fraxFurnace = await ethers.getContractAt("MetaFurnace", proxy.address, deployer);
    config.FRAX.Furnace = fraxFurnace.address;
    console.log("✅ Deploy MetaFurnace For FRAX at:", fraxFurnace.address);
  }

  // FRAX-USDC Clever and strategies
  {
    if (config.FRAX.CLever.FRAXUSDC.clever !== "") {
      clever_FRAXUSDC = await ethers.getContractAt("MetaCLever", config.FRAX.CLever.FRAXUSDC.clever, deployer);
      console.log("Found MetaCLever for FRAXUSDC at:", clever_FRAXUSDC.address);
    } else {
      const data = MetaCLever__factory.createInterface().encodeFunctionData("initialize", [
        clevCRV.address,
        crvFurnace.address,
      ]);
      const BeaconProxy = await ethers.getContractFactory("BeaconProxy", deployer);
      const proxy = await BeaconProxy.deploy(cleverBeacon.address, data);
      console.log("Deploying MetaCLever For FRAXUSDC, hash:", proxy.deployTransaction.hash);
      await proxy.deployed();
      clever_FRAXUSDC = await ethers.getContractAt("MetaCLever", proxy.address, deployer);
      console.log("✅ Deploy MetaCLever for FRAXUSDC, at:", clever_FRAXUSDC.address);
      config.FRAX.CLever.FRAXUSDC.clever = clever_FRAXUSDC.address;
    }

    if (config.FRAX.CLever.FRAXUSDC.strategies.FRAXUSDC_All !== "") {
      strategy_FRAXUSDC_All = await ethers.getContractAt(
        "ConcentratorStrategy",
        config.FRAX.CLever.FRAXUSDC.strategies.FRAXUSDC_All,
        deployer
      );
      console.log("Found ConcentratorStrategy FRAXUSDC/All at:", strategy_FRAXUSDC_All.address);
    } else {
      const ConcentratorStrategy = await ethers.getContractFactory("ConcentratorStrategy", deployer);
      strategy_FRAXUSDC_All = await ConcentratorStrategy.deploy(
        DEPLOYED_CONTRACTS.AladdinZap,
        DEPLOYED_CONTRACTS.Concentrator.AladdinCRVConvexVault,
        15,
        1e9, // 100%
        ADDRESS.CURVE_FRAXUSDC_POOL,
        ADDRESS.CURVE_FRAXUSDC_TOKEN,
        ADDRESS.FRAX,
        clever_FRAXUSDC.address
      );
      console.log("Deploying ConcentratorStrategy FRAXUSDC/All, hash:", strategy_FRAXUSDC_All.deployTransaction.hash);
      await strategy_FRAXUSDC_All.deployed();
      console.log("✅ Deploy ConcentratorStrategy FRAXUSDC/All at:", strategy_FRAXUSDC_All.address);
      config.FRAX.CLever.FRAXUSDC.strategies.FRAXUSDC_All = strategy_FRAXUSDC_All.address;
    }

    if (config.FRAX.CLever.FRAXUSDC.strategies.FRAXUSDC_Half !== "") {
      strategy_FRAXUSDC_Half = await ethers.getContractAt(
        "ConcentratorStrategy",
        config.FRAX.CLever.FRAXUSDC.strategies.FRAXUSDC_Half,
        deployer
      );
      console.log("Found ConcentratorStrategy FRAXUSDC/Half at:", strategy_FRAXUSDC_Half.address);
    } else {
      const ConcentratorStrategy = await ethers.getContractFactory("ConcentratorStrategy", deployer);
      strategy_FRAXUSDC_Half = await ConcentratorStrategy.deploy(
        DEPLOYED_CONTRACTS.AladdinZap,
        DEPLOYED_CONTRACTS.Concentrator.AladdinCRVConvexVault,
        15,
        5e8, // 50%
        ADDRESS.CURVE_FRAXUSDC_POOL,
        ADDRESS.CURVE_FRAXUSDC_TOKEN,
        ADDRESS.FRAX,
        clever_FRAXUSDC.address
      );
      console.log("Deploying ConcentratorStrategy FRAXUSDC/Half, hash:", strategy_FRAXUSDC_Half.deployTransaction.hash);
      await strategy_FRAXUSDC_Half.deployed();
      console.log("✅ Deploy ConcentratorStrategy FRAXUSDC/Half at:", strategy_FRAXUSDC_Half.address);
      config.FRAX.CLever.FRAXUSDC.strategies.FRAXUSDC_Half = strategy_FRAXUSDC_Half.address;
    }
  }

  // Setup FRAX-USDC Clever
  {
    if (!(await clever_FRAXUSDC.reserveRate()).eq(config.FRAX.CLever.FRAXUSDC.reserveRate)) {
      const tx = await clever_FRAXUSDC.updateReserveRate(config.FRAX.CLever.FRAXUSDC.reserveRate);
      console.log("Setup reserve rate for clever_FRAXUSDC, hash:", tx.hash);
      const receipt = await tx.wait();
      console.log("✅ Done, gas used:", receipt.gasUsed.toString());
    }

    const feeInfo = await clever_FRAXUSDC.feeInfo();
    if (
      feeInfo.platform !== PLATFORM ||
      feeInfo.platformPercentage !== PLATFORM_FEE_PERCENTAGE ||
      feeInfo.repayPercentage !== REPAY_FEE_PERCENTAGE ||
      feeInfo.bountyPercentage !== HARVEST_BOUNTY_PERCENTAGE
    ) {
      const tx = await clever_FRAXUSDC.updateFeeInfo(
        PLATFORM,
        PLATFORM_FEE_PERCENTAGE,
        HARVEST_BOUNTY_PERCENTAGE,
        REPAY_FEE_PERCENTAGE
      );
      console.log("Setup fees in clever_FRAXUSDC, hash:", tx.hash);
      const receipt = await tx.wait();
      console.log("✅ Done, gas used:", receipt.gasUsed.toString());
    }

    if (!(await fraxFurnace.isWhitelisted(clever_FRAXUSDC.address))) {
      const tx = await fraxFurnace.updateWhitelists([clever_FRAXUSDC.address], true);
      console.log("Add whitelist clever_FRAXUSDC to fraxFurnace, hash:", tx.hash);
      const receipt = await tx.wait();
      console.log("✅ Done, gas used:", receipt.gasUsed.toString());
    }

    if (!(await clevFRAX.isMinter(clever_FRAXUSDC.address))) {
      const tx = await clevFRAX.updateMinters([clever_FRAXUSDC.address], true);
      console.log("Setup clever_FRAXUSDC as minter of clevFRAX, hash:", tx.hash);
      const receipt = await tx.wait();
      console.log("✅ Done, gas used:", receipt.gasUsed.toString());
    }

    if (!(await clevFRAX.minterInfo(clever_FRAXUSDC.address)).ceiling.eq(config.FRAX.CLever.FRAXUSDC.mintCeiling)) {
      const tx = await clevFRAX.updateCeiling(clever_FRAXUSDC.address, config.FRAX.CLever.FRAXUSDC.mintCeiling);
      console.log("Setup minter ceiling for clever_FRAXUSDC, hash:", tx.hash);
      const receipt = await tx.wait();
      console.log("✅ Done, gas used:", receipt.gasUsed.toString());
    }

    const [, strategies] = await clever_FRAXUSDC.getActiveYieldStrategies();
    if (!strategies.includes(strategy_FRAXUSDC_All.address)) {
      const tx = await clever_FRAXUSDC.addYieldStrategy(strategy_FRAXUSDC_All.address, []);
      console.log("setup add ConcentratorStrategy FRAXUSDC/All to clever_FRAXUSDC, hash:", tx.hash);
      const receipt = await tx.wait();
      console.log("✅ Done, gas used:", receipt.gasUsed.toString());
    }
    if (!strategies.includes(strategy_FRAXUSDC_Half.address)) {
      const tx = await clever_FRAXUSDC.addYieldStrategy(strategy_FRAXUSDC_Half.address, [
        DEPLOYED_CONTRACTS.Concentrator.aCRV,
      ]);
      console.log("setup add ConcentratorStrategy FRAXUSDC/All to clever_FRAXUSDC, hash:", tx.hash);
      const receipt = await tx.wait();
      console.log("✅ Done, gas used:", receipt.gasUsed.toString());
    }
  }
}

async function deployGuage() {
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
}

async function main() {
  const [deployer] = await ethers.getSigners();

  if (config.CLeverBeacon !== "") {
    cleverBeacon = await ethers.getContractAt("UpgradeableBeacon", config.CLeverBeacon, deployer);
    console.log("Found CleverBeacon at:", cleverBeacon.address);
  } else {
    const MetaCLever = await ethers.getContractFactory("MetaCLever", deployer);
    const impl = await MetaCLever.deploy();
    console.log("Deploying MetaCLever Impl, hash:", impl.deployTransaction.hash);
    await impl.deployed();
    console.log("✅ Deploy MetaCLever Impl at:", impl.address);

    const UpgradeableBeacon = await ethers.getContractFactory("UpgradeableBeacon", deployer);
    cleverBeacon = await UpgradeableBeacon.deploy(impl.address);
    console.log("Deploying CleverBeacon, hash:", cleverBeacon.deployTransaction.hash);
    await cleverBeacon.deployed();
    console.log("✅ Deploy CleverBeacon at:", cleverBeacon.address);
  }

  if (config.FurnaceBeacon !== "") {
    furnaceBeacon = await ethers.getContractAt("UpgradeableBeacon", config.FurnaceBeacon, deployer);
    console.log("Found FurnaceBeacon at:", furnaceBeacon.address);
  } else {
    const MetaFurnace = await ethers.getContractFactory("MetaFurnace", deployer);
    const impl = await MetaFurnace.deploy();
    console.log("Deploying MetaFurnace Impl, hash:", impl.deployTransaction.hash);
    await impl.deployed();
    console.log("✅ Deploy MetaFurnace Impl at:", impl.address);

    const UpgradeableBeacon = await ethers.getContractFactory("UpgradeableBeacon", deployer);
    furnaceBeacon = await UpgradeableBeacon.deploy(impl.address);
    console.log("Deploying FurnaceBeacon, hash:", furnaceBeacon.deployTransaction.hash);
    await furnaceBeacon.deployed();
    console.log("✅ Deploy FurnaceBeacon at:", furnaceBeacon.address);
  }

  if (config.TokenZapLogic !== "") {
    logic = await ethers.getContractAt("TokenZapLogic", config.TokenZapLogic, deployer);
    console.log("Found TokenZapLogic at:", logic.address);
  } else {
    const TokenZapLogic = await ethers.getContractFactory("TokenZapLogic", deployer);
    logic = await TokenZapLogic.deploy();
    console.log("Deploying TokenZapLogic, hash:", logic.deployTransaction.hash);
    await logic.deployed();
    config.TokenZapLogic = logic.address;
    console.log("✅ Deploy TokenZapLogic at:", logic.address);
  }

  if (config.AllInOneGateway !== "") {
    gateway = await ethers.getContractAt("AllInOneGateway", config.AllInOneGateway, deployer);
    console.log("Found AllInOneGateway at:", logic.address);
  } else {
    const AllInOneGateway = await ethers.getContractFactory("AllInOneGateway", deployer);
    gateway = await AllInOneGateway.deploy(logic.address);
    console.log("Deploying AllInOneGateway, hash:", gateway.deployTransaction.hash);
    await gateway.deployed();
    config.AllInOneGateway = gateway.address;
    console.log("✅ Deploy AllInOneGateway at:", gateway.address);
  }

  await deployCRV();
  await deployFRAX();
  await deployGuage();
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
