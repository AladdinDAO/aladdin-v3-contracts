/* eslint-disable no-lone-blocks */
/* eslint-disable camelcase */
/* eslint-disable node/no-missing-import */
import { BigNumber, constants } from "ethers";
import { ethers } from "hardhat";
import {
  AladdinCRVStrategy,
  AllInOneGateway,
  CLEV,
  CLeverToken,
  ConcentratorStrategy,
  FeeDistributor,
  FundraisingGaugeFactoryV1,
  FundraisingGaugeV1,
  GaugeController,
  MetaCLever,
  MetaCLever__factory,
  MetaFurnace,
  MetaFurnace__factory,
  Minter,
  MultipleVestHelper,
  TokenSale,
  TokenZapLogic,
  UpgradeableBeacon,
  VeCLEV,
  Vesting,
} from "../typechain";
import { ADDRESS, DEPLOYED_CONTRACTS, VAULT_CONFIG, ZAP_ROUTES } from "./utils";

const config: {
  CLeverBeacon: string;
  FurnaceBeacon: string;
  TokenZapLogic: string;
  FundraisingGaugeV1: string;
  FundraisingGaugeFactoryV1: string;
  MultipleVestHelper: string;
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
    clevUSD: string;
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
  Gauge: {
    Curve_CLEV_ETH: {
      pool: string;
      token: string;
      gauge: string;
    };
    Balancer_clevCVX_CVX: {
      poolId: string;
      token: string;
      gauge: string;
    };
    Curve_clevCVX_CVX: {
      pool: string;
      token: string;
      gauge: string;
    };
  };
  CLEV: string;
  veCLEV: string;
  Minter: string;
  GaugeController: string;
  FeeDistributor: string;
  sale: string;
  vest: string;
} = {
  CLeverBeacon: constants.AddressZero,
  FurnaceBeacon: constants.AddressZero,
  TokenZapLogic: "0x858D62CE483B8ab538d1f9254C3Fd3Efe1c5346F",
  AllInOneGateway: "0x6e513d492Ded19AD8211a57Cc6B4493C9E6C857B",
  FundraisingGaugeV1: "0xB9CD9979718e7E4C341D8D99dA3F1290c908FBdd",
  FundraisingGaugeFactoryV1: "0x3abf0BE21E5020007B6e2e201E292a7119bC2b0d",
  MultipleVestHelper: "",
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
    clevUSD: "0x3CC69909Da81861A006106d10026e4869dAdA67e",
    Furnace: "0x8fa020ee7446a86ced2FC0ed45d73797Da839f5f",
    CLever: {
      FRAXUSDC: {
        clever: "0x4FEe74f78Db3aff41f8783f94E3435abe511EcFa",
        reserveRate: 5e8, // 50%
        mintCeiling: ethers.utils.parseEther("10000000"),
        strategies: {
          FRAXUSDC_All: "0xaAB8CDfe24319BE5cE2d5eE1468fcC5205395Db5",
          FRAXUSDC_Half: "0x8961af9cD94274ddC9b98A9a8813cA57F6EECF7E",
        },
      },
    },
  },
  Gauge: {
    Curve_CLEV_ETH: {
      pool: "0x342D1C4Aa76EA6F5E5871b7f11A019a0eB713A4f",
      token: "0x6C280dB098dB673d30d5B34eC04B6387185D3620",
      gauge: "0x86e917ad6Cb44F9E6C8D9fA012acF0d0CfcF114f",
    },
    Balancer_clevCVX_CVX: {
      poolId: "0x69671c808c8f1c1490a4c9e0145884dfb5631378000200000000000000000392",
      token: "0x69671c808c8f1c1490a4c9e0145884dfb5631378",
      gauge: "0x9b02548De409D7aAeE228BfA3ff2bCa70e7a2fe8",
    },
    Curve_clevCVX_CVX: {
      pool: "0xF9078Fb962A7D13F55d40d49C8AA6472aBD1A5a6",
      token: "0xF9078Fb962A7D13F55d40d49C8AA6472aBD1A5a6",
      gauge: "0xF758BE28E93672d1a8482BE15EAf21aa5450F979",
    },
  },
  CLEV: "0x72953a5C32413614d24C29c84a66AE4B59581Bbf",
  veCLEV: "0x94be07d45d57c7973A535C1c517Bd79E602E051e",
  GaugeController: "0xB992E8E1943f40f89301aB89A5C254F567aF5b63",
  Minter: "0x4aa2afd5616bEEC2321a9EfD7349400d4F18566A",
  FeeDistributor: constants.AddressZero,
  sale: "0x07867298d99B95772008583bd603cfA68B8C75E7",
  vest: "0x84C82d43f1Cc64730849f3E389fE3f6d776F7A4E",
};

const PLATFORM = "0xFC08757c505eA28709dF66E54870fB6dE09f0C5E";
const PLATFORM_FEE_PERCENTAGE = 2e7; // 2%
const HARVEST_BOUNTY_PERCENTAGE = 1e7; // 1%
const REPAY_FEE_PERCENTAGE = 5e7; // 5%

let cleverBeacon: UpgradeableBeacon;
let furnaceBeacon: UpgradeableBeacon;
let logic: TokenZapLogic;
let gateway: AllInOneGateway;
let vefunder: FundraisingGaugeV1;
let factory: FundraisingGaugeFactoryV1;
let helper: MultipleVestHelper;

let clevCRV: CLeverToken;
let crvFurnace: MetaFurnace;
let clever_aCRV: MetaCLever;
let strategy_aCRV: AladdinCRVStrategy;

let clevUSD: CLeverToken;
let fraxFurnace: MetaFurnace;
let clever_FRAXUSDC: MetaCLever;
let strategy_FRAXUSDC_All: ConcentratorStrategy;
let strategy_FRAXUSDC_Half: ConcentratorStrategy;

let clev: CLEV;
let ve: VeCLEV;
let minter: Minter;
let controller: GaugeController;
let distributor: FeeDistributor;

let vest: Vesting;
let sale: TokenSale;

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

  if (config.FRAX.clevUSD !== "") {
    clevUSD = (await ethers.getContractAt("CLeverToken", config.FRAX.clevUSD, deployer)) as CLeverToken;
    console.log("Found clevUSD at:", clevUSD.address);
  } else {
    const CLeverToken = await ethers.getContractFactory("CLeverToken", deployer);
    clevUSD = (await CLeverToken.deploy("CLever USD", "clevUSD")) as CLeverToken;
    console.log("Deploying clevUSD, hash:", clevUSD.deployTransaction.hash);
    await clevUSD.deployed();
    console.log("✅ Deploy clevUSD at:", clevUSD.address);
    config.FRAX.clevUSD = clevUSD.address;
  }

  if (config.FRAX.Furnace !== "") {
    fraxFurnace = await ethers.getContractAt("MetaFurnace", config.FRAX.Furnace, deployer);
    console.log("Found MetaFurnace For FRAX at:", fraxFurnace.address);
  } else {
    const data = MetaFurnace__factory.createInterface().encodeFunctionData("initialize", [
      ADDRESS.FRAX,
      clevUSD.address,
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
        clevUSD.address,
        fraxFurnace.address,
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

    if (!(await clevUSD.isMinter(clever_FRAXUSDC.address))) {
      const tx = await clevUSD.updateMinters([clever_FRAXUSDC.address], true);
      console.log("Setup clever_FRAXUSDC as minter of clevUSD, hash:", tx.hash);
      const receipt = await tx.wait();
      console.log("✅ Done, gas used:", receipt.gasUsed.toString());
    }

    if (!(await clevUSD.minterInfo(clever_FRAXUSDC.address)).ceiling.eq(config.FRAX.CLever.FRAXUSDC.mintCeiling)) {
      const tx = await clevUSD.updateCeiling(clever_FRAXUSDC.address, config.FRAX.CLever.FRAXUSDC.mintCeiling);
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

  await gateway.depositCLever(
    clever_FRAXUSDC.address,
    0,
    constants.AddressZero,
    1000000000,
    ADDRESS.CURVE_FRAXUSDC_TOKEN,
    VAULT_CONFIG.fraxusdc.deposit.WETH,
    0,
    { value: 1000000000 }
  );
  const share = (await clever_FRAXUSDC.getUserInfo(deployer.address))._shares[0];
  console.log("share", share);
  await clever_FRAXUSDC.withdraw(0, deployer.address, share, 0, false, { gasLimit: 3000000 });
}

async function deployTokenAndVe() {
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

  if ((await clev.minter()) !== minter.address) {
    const tx = await clev.set_minter(minter.address);
    console.log("set minter, hash:", tx.hash);
    const receipt = await tx.wait();
    console.log("✅ Done, gas used", receipt.gasUsed.toString());
  }
}

async function deployGauge() {
  const [deployer] = await ethers.getSigners();

  const clev = await ethers.getContractAt("IERC20", config.CLEV, deployer);
  const weth = await ethers.getContractAt("IERC20", ADDRESS.WETH, deployer);

  console.log("WETH:", ethers.utils.formatEther(await weth.balanceOf(deployer.address)));

  // Deploy Curve CLEV/ETH Crypto Pool
  if (config.Gauge.Curve_CLEV_ETH.token === "") {
    const factory = await ethers.getContractAt(
      "ICurveCryptoPoolFactory",
      "0xf18056bbd320e96a48e3fbf8bc061322531aac99",
      deployer
    );
    const pool = await factory.callStatic.deploy_pool(
      "CLEV/ETH",
      "CLEVETH",
      [ADDRESS.WETH, config.CLEV],
      "400000",
      "145000000000000",
      "30000000",
      "90000000",
      "2000000000000",
      "230000000000000",
      "146000000000000",
      "5000000000",
      "600",
      "3461540000000000"
    );
    const tx = await factory.deploy_pool(
      "CLEV/ETH",
      "CLEVETH",
      [ADDRESS.WETH, config.CLEV],
      "400000",
      "145000000000000",
      "30000000",
      "90000000",
      "2000000000000",
      "230000000000000",
      "146000000000000",
      "5000000000",
      "600",
      "3461540000000000"
    );
    console.log("Deploying Curve CLEV/ETH LP, hash:", tx.hash);
    const receipt = await tx.wait();
    const token = "0x" + receipt.logs[1].data.slice(26, 66);
    console.log("✅ Done, Curve CLEV/ETH LP:", token, "Pool:", pool);
    config.Gauge.Curve_CLEV_ETH.pool = pool;
    config.Gauge.Curve_CLEV_ETH.token = token;
  } else {
    const pool = await ethers.getContractAt("ICurveCryptoPool", config.Gauge.Curve_CLEV_ETH.pool, deployer);
    console.log("clev in pool:", ethers.utils.formatEther(await clev.balanceOf(pool.address)));
    if ((await clev.balanceOf(pool.address)).eq(constants.Zero)) {
      console.log("clev allowance", (await clev.allowance(deployer.address, pool.address)).toString());
      console.log("weth allowance", (await weth.allowance(deployer.address, pool.address)).toString());
      // await clev.approve(pool.address, constants.MaxUint256);
      // await weth.approve(pool.address, constants.MaxUint256);
      await pool.add_liquidity([ethers.utils.parseEther("0.43203125"), ethers.utils.parseEther("100")], 0, {
        gasLimit: 2000000,
      });
    }
  }
  // Deploy Curve CLEV/ETH Gauge
  if (config.Gauge.Curve_CLEV_ETH.gauge === "") {
    const LiquidityGaugeV3 = await ethers.getContractFactory("LiquidityGaugeV3", deployer);
    const gauge = await LiquidityGaugeV3.deploy(config.Gauge.Curve_CLEV_ETH.token, config.Minter, deployer.address);
    console.log("Deploying Curve CLEV/ETH Gauge, hash:", gauge.deployTransaction.hash);
    await gauge.deployed();
    console.log("✅ Deploy Curve CLEV/ETH Gauge at:", gauge.address);
    config.Gauge.Curve_CLEV_ETH.gauge = gauge.address;
  }
  console.log("Zap to Curve CLEV/ETH:");
  console.log(
    `  {"symbol": "WETH", "address": "${ADDRESS.WETH}", "routes": [${ZAP_ROUTES.WETH.Curve_CLEVETH_TOKEN.map(
      (x) => `"${x.toHexString()}"`
    )}]}`
  );
  console.log(
    `  {"symbol": "ETH", "address": "${constants.AddressZero}", "routes": [${ZAP_ROUTES.WETH.Curve_CLEVETH_TOKEN.map(
      (x) => `"${x.toHexString()}"`
    )}]}`
  );
  console.log(
    `  {"symbol": "CLEV", "address": "${config.CLEV}", "routes": [${ZAP_ROUTES.CLEV.Curve_CLEVETH_TOKEN.map(
      (x) => `"${x.toHexString()}"`
    )}]}`
  );
  console.log(
    `  {"symbol": "USDC", "address": "${ADDRESS.USDC}", "routes": [${ZAP_ROUTES.USDC.Curve_CLEVETH_TOKEN.map(
      (x) => `"${x.toHexString()}"`
    )}]}`
  );

  // Deploy Curve clevCVX/CVX Gauge
  if (config.Gauge.Curve_clevCVX_CVX.gauge === "") {
    const LiquidityGaugeV3 = await ethers.getContractFactory("LiquidityGaugeV3", deployer);
    const gauge = await LiquidityGaugeV3.deploy(config.Gauge.Curve_clevCVX_CVX.token, config.Minter, deployer.address);
    console.log("Deploying Curve clevCVX/CVX Gauge, hash:", gauge.deployTransaction.hash);
    await gauge.deployed();
    console.log("✅ Deploy Curve clevCVX/CVX Gauge at:", gauge.address);
    config.Gauge.Curve_clevCVX_CVX.gauge = gauge.address;
  }

  console.log("Zap to Curve clevCVX/CVX:");
  console.log(
    `  {"symbol": "clevCVX", "address": "${ADDRESS.clevCVX}", "routes": [${ZAP_ROUTES.clevCVX.Curve_CLEVCVX_TOKEN.map(
      (x) => `"${x.toHexString()}"`
    )}]}`
  );
  console.log(
    `  {"symbol": "CVX", "address": "${ADDRESS.CVX}", "routes": [${ZAP_ROUTES.CVX.Curve_CLEVCVX_TOKEN.map(
      (x) => `"${x.toHexString()}"`
    )}]}`
  );
  console.log(
    `  {"symbol": "WETH", "address": "${ADDRESS.WETH}", "routes": [${ZAP_ROUTES.WETH.Curve_CLEVCVX_TOKEN.map(
      (x) => `"${x.toHexString()}"`
    )}]}`
  );
  console.log(
    `  {"symbol": "ETH", "address": "${constants.AddressZero}", "routes": [${ZAP_ROUTES.WETH.Curve_CLEVCVX_TOKEN.map(
      (x) => `"${x.toHexString()}"`
    )}]}`
  );
  console.log(
    `  {"symbol": "USDC", "address": "${ADDRESS.USDC}", "routes": [${ZAP_ROUTES.USDC.Curve_CLEVCVX_TOKEN.map(
      (x) => `"${x.toHexString()}"`
    )}]}`
  );

  // Deploy Balancer clevCVX/CVX Gauge
  if (config.Gauge.Balancer_clevCVX_CVX.gauge === "") {
    const LiquidityGaugeV3 = await ethers.getContractFactory("LiquidityGaugeV3", deployer);
    const gauge = await LiquidityGaugeV3.deploy(
      config.Gauge.Balancer_clevCVX_CVX.token,
      config.Minter,
      deployer.address
    );
    console.log("Deploying Balancer clevCVX/CVX Gauge, hash:", gauge.deployTransaction.hash);
    await gauge.deployed();
    console.log("✅ Deploy Balancer clevCVX/CVX Gauge at:", gauge.address);
    config.Gauge.Balancer_clevCVX_CVX.gauge = gauge.address;
  }

  console.log("Zap to Balancer clevCVX/CVX:");
  console.log(`  {"symbol": "clevCVX", "address": "${ADDRESS.clevCVX}", "routes": []}`);
  console.log(`  {"symbol": "CVX", "address": "${ADDRESS.CVX}", "routes": []}`);
  console.log(
    `  {"symbol": "WETH", "address": "${ADDRESS.WETH}", "routes": [${ZAP_ROUTES.WETH.CVX.map(
      (x) => `"${x.toHexString()}"`
    )}]}`
  );
  console.log(
    `  {"symbol": "ETH", "address": "${constants.AddressZero}", "routes": [${ZAP_ROUTES.WETH.CVX.map(
      (x) => `"${x.toHexString()}"`
    )}]}`
  );
  console.log(
    `  {"symbol": "USDC", "address": "${ADDRESS.USDC}", "routes": [${ZAP_ROUTES.USDC.CVX.map(
      (x) => `"${x.toHexString()}"`
    )}]}`
  );

  console.log("gauge_type_names:", await controller.gauge_type_names(0));
  if ((await controller.get_gauge_weight(config.Gauge.Curve_CLEV_ETH.gauge)).isZero()) {
    const tx = await controller["add_gauge(address,int128,uint256)"](
      config.Gauge.Curve_CLEV_ETH.gauge,
      0,
      "1000000000000000000",
      { gasLimit: 1000000 }
    );
    console.log("add Curve CLEV/ETH Gauge, hash:", tx.hash);
    const receipt = await tx.wait();
    console.log("✅ Done, gas used", receipt.gasUsed.toString());
  }
  /* if ((await controller.get_gauge_weight(config.Gauge.Curve_clevCVX_CVX.gauge)).isZero()) {
    const tx = await controller["add_gauge(address,int128,uint256)"](config.Gauge.Curve_clevCVX_CVX.gauge, 0, "25", {
      gasLimit: 1000000,
    });
    console.log("add Curve clevCVX/CVX Gauge, hash:", tx.hash);
    const receipt = await tx.wait();
    console.log("✅ Done, gas used", receipt.gasUsed.toString());
  }
  if ((await controller.get_gauge_weight(config.Gauge.Balancer_clevCVX_CVX.gauge)).isZero()) {
    const tx = await controller["add_gauge(address,int128,uint256)"](config.Gauge.Balancer_clevCVX_CVX.gauge, 0, "25", {
      gasLimit: 1000000,
    });
    console.log("add Balancer clevCVX/CVX Gauge, hash:", tx.hash);
    const receipt = await tx.wait();
    console.log("✅ Done, gas used", receipt.gasUsed.toString());
  } */
}

async function deployIDO() {
  const [deployer] = await ethers.getSigners();

  if (config.vest !== "") {
    vest = await ethers.getContractAt("Vesting", config.vest, deployer);
    console.log("Found Vesting at:", vest.address);
  } else {
    const Vesting = await ethers.getContractFactory("Vesting", deployer);
    vest = await Vesting.deploy(clev.address);
    await vest.deployed();
    config.vest = vest.address;
    console.log("Deploy Vesting at:", vest.address);
  }

  if (config.sale !== "") {
    sale = await ethers.getContractAt("TokenSale", config.sale, deployer);
    console.log("Found TokenSale at:", sale.address);
  } else {
    const TokenSale = await ethers.getContractFactory("TokenSale", deployer);
    sale = await TokenSale.deploy(
      ADDRESS.WETH,
      ADDRESS.CVX,
      DEPLOYED_CONTRACTS.AladdinZap,
      ethers.utils.parseEther("100000")
    );
    await sale.deployed();
    config.sale = sale.address;
    console.log("Deploy TokenSale at:", sale.address);
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
    console.log("Found AllInOneGateway at:", gateway.address);
  } else {
    const AllInOneGateway = await ethers.getContractFactory("AllInOneGateway", deployer);
    gateway = await AllInOneGateway.deploy(logic.address);
    console.log("Deploying AllInOneGateway, hash:", gateway.deployTransaction.hash);
    await gateway.deployed();
    config.AllInOneGateway = gateway.address;
    console.log("✅ Deploy AllInOneGateway at:", gateway.address);
  }

  if (config.FundraisingGaugeV1 !== "") {
    vefunder = await ethers.getContractAt("FundraisingGaugeV1", config.FundraisingGaugeV1, deployer);
    console.log("Found FundraisingGaugeV1 at:", vefunder.address);
  } else {
    const FundraisingGaugeV1 = await ethers.getContractFactory("FundraisingGaugeV1", deployer);
    vefunder = await FundraisingGaugeV1.deploy(DEPLOYED_CONTRACTS.CLever.Treasury);
    console.log("Deploying FundraisingGaugeV1, hash:", vefunder.deployTransaction.hash);
    await vefunder.deployed();
    config.FundraisingGaugeV1 = vefunder.address;
    console.log("✅ Deploy FundraisingGaugeV1 at:", vefunder.address);
  }

  if (config.FundraisingGaugeFactoryV1 !== "") {
    factory = await ethers.getContractAt("FundraisingGaugeFactoryV1", config.FundraisingGaugeFactoryV1, deployer);
    console.log("Found FundraisingGaugeFactoryV1 at:", factory.address);
  } else {
    const FundraisingGaugeFactoryV1 = await ethers.getContractFactory("FundraisingGaugeFactoryV1", deployer);
    factory = await FundraisingGaugeFactoryV1.deploy(vefunder.address);
    console.log("Deploying FundraisingGaugeFactoryV1, hash:", factory.deployTransaction.hash);
    await factory.deployed();
    config.FundraisingGaugeFactoryV1 = factory.address;
    console.log("✅ Deploy FundraisingGaugeFactoryV1 at:", factory.address);
  }

  if (config.MultipleVestHelper !== "") {
    helper = await ethers.getContractAt("MultipleVestHelper", config.MultipleVestHelper, deployer);
    console.log("Found MultipleVestHelper at:", helper.address);
  } else {
    const MultipleVestHelper = await ethers.getContractFactory("MultipleVestHelper", deployer);
    helper = await MultipleVestHelper.deploy();
    console.log("Deploying MultipleVestHelper, hash:", helper.deployTransaction.hash);
    await helper.deployed();
    config.MultipleVestHelper = helper.address;
    console.log("✅ Deploy MultipleVestHelper at:", helper.address);
  }

  await deployCRV();
  await deployFRAX();
  await deployTokenAndVe();
  await deployIDO();
  await deployGauge();
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
