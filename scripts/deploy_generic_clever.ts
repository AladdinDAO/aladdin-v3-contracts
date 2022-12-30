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
  PlatformFeeDistributor,
  TokenSale,
  TokenZapLogic,
  UpgradeableBeacon,
  VeCLEV,
  Vesting,
} from "../typechain";
import { ADDRESS, DEPLOYED_CONTRACTS, TOKENS, AVAILABLE_VAULTS, ZAP_ROUTES } from "./utils";

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
    platformFeePercentage: number;
    harvestBountyPercentage: number;
    rewardPeriod: number;
    CLever: {
      [name: string]: {
        clever: string;
        token: string;
        pool: string;
        reserveRate: number;
        repayFeePercentage: number;
        platformFeePercentage: number;
        harvestBountyPercentage: number;
        mintCeiling: BigNumber;
        concentratorPID: number;
        strategies: { [name: string]: string };
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
  FeeDistributor: { [reward: string]: string };
  PlatformFeeDistributor: string;
  sale: string;
  vest: string;
} = {
  CLeverBeacon: "0xf5D1cA341e1BAadd986D43b226F92B778C75C8cA",
  FurnaceBeacon: "0xeB937D47ab60DDd50E9C04c98ceCb21E7e009773",
  TokenZapLogic: "0x858D62CE483B8ab538d1f9254C3Fd3Efe1c5346F",
  AllInOneGateway: "0x6e513d492Ded19AD8211a57Cc6B4493C9E6C857B",
  FundraisingGaugeV1: "0xB9CD9979718e7E4C341D8D99dA3F1290c908FBdd",
  FundraisingGaugeFactoryV1: "0x3abf0BE21E5020007B6e2e201E292a7119bC2b0d",
  MultipleVestHelper: "0x572DeCa882f4C9ABCBDc6f020601A1b789D11983",
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
    clevUSD: "0x3C20Ac688410bE8F391bE1fb00AFc5C212972F86",
    Furnace: "0x7f160EFC2436F1aF4E9E8a57d0a5beB8345761a9",
    platformFeePercentage: 2e8, // 20%
    harvestBountyPercentage: 1e7, // 0%
    rewardPeriod: 86400 * 14, // 14 days
    CLever: {
      FRAXUSDC: {
        clever: "0xEB0ea9D24235aB37196111eeDd656D56Ce4F53b1",
        token: ADDRESS.CURVE_FRAXUSDC_TOKEN,
        pool: ADDRESS.CURVE_FRAXUSDC_POOL,
        reserveRate: 3e8, // 30%
        repayFeePercentage: 5e6, // 0.5%
        platformFeePercentage: 1e8, // 10%
        harvestBountyPercentage: 0, // 0%
        mintCeiling: ethers.utils.parseEther("50000"),
        concentratorPID: 15,
        strategies: {
          FRAXUSDC_100: "0xAdC6A89d6Df7374629eA3cFd0737843709d29F66", // 100% aCRV are zapped to FRAX
        },
      },
      LUSDFRAXBP: {
        clever: "0xb2Fcee71b25B62baFE442c58AF58c42143673cC1",
        token: ADDRESS.CURVE_LUSDFRAXBP_TOKEN,
        pool: ADDRESS.CURVE_LUSDFRAXBP_POOL,
        reserveRate: 3e8, // 30%
        repayFeePercentage: 5e6, // 0.5%
        platformFeePercentage: 1e8, // 10%
        harvestBountyPercentage: 0, // 0%
        mintCeiling: ethers.utils.parseEther("25000"),
        concentratorPID: 30,
        strategies: {
          LUSDFRAXBP_100: "0xC65D58A33D9917Df3e1a4033eD73506D9b6aCE6c", // 100% aCRV are zapped to FRAX
        },
      },
      TUSDFRAXBP: {
        clever: "0xad4caC207A0BFEd10dF8A4FC6A28D377caC730E0",
        token: ADDRESS.CURVE_TUSDFRAXBP_TOKEN,
        pool: ADDRESS.CURVE_TUSDFRAXBP_POOL,
        reserveRate: 3e8, // 30%
        repayFeePercentage: 5e6, // 0.5%
        platformFeePercentage: 1e8, // 10%
        harvestBountyPercentage: 0, // 0%
        mintCeiling: ethers.utils.parseEther("25000"),
        concentratorPID: 29,
        strategies: {
          TUSDFRAXBP_100: "0xa7625Dd9F2D8a95a0D1Ac7E8671547197e9fcAf0", // 100% aCRV are zapped to FRAX
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
  FeeDistributor: {
    aCRV: "0xA5D9358c60fC9Bd2b508eDa17c78C67A43A4458C",
    CVX: "0xEA99147773782cc88a03d76a7c9E30152D97Fc0b",
    CRV: constants.AddressZero,
    FRAX: constants.AddressZero,
  },
  PlatformFeeDistributor: "0xD6eFa5B63531e9ae61e225b02CbACD59092a35bE",
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
let platform: PlatformFeeDistributor;

let clevCRV: CLeverToken;
let crvFurnace: MetaFurnace;
let clever_aCRV: MetaCLever;
let strategy_aCRV: AladdinCRVStrategy;

let clevUSD: CLeverToken;
let fraxFurnace: MetaFurnace;

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
  console.log(
    "Zap from cvxCRV => FRAX:",
    `from[${ADDRESS.cvxCRV}]`,
    `to[${ADDRESS.FRAX}]`,
    `routes[${ZAP_ROUTES.cvxCRV.FRAX.map((x) => x.toHexString())}]`
  );
  console.log(
    "Zap from FRAXUSDC => FRAX:",
    `from[${ADDRESS.CURVE_FRAXUSDC_TOKEN}]`,
    `to[${ADDRESS.FRAX}]`,
    `routes[${AVAILABLE_VAULTS.fraxusdc.withdraw.FRAX.map((x) => x.toHexString())}]`
  );
  console.log(
    "Zap from TUSDFRAXBP => FRAX:",
    `from[${ADDRESS.CURVE_TUSDFRAXBP_TOKEN}]`,
    `to[${ADDRESS.FRAX}]`,
    `routes[${AVAILABLE_VAULTS.tusdfraxbp.withdraw.FRAX.map((x) => x.toHexString())}]`
  );
  console.log(
    "Zap from LUSDFRAXBP => FRAX:",
    `from[${ADDRESS.CURVE_LUSDFRAXBP_TOKEN}]`,
    `to[${ADDRESS.FRAX}]`,
    `routes[${AVAILABLE_VAULTS.lusdfraxbp.withdraw.FRAX.map((x) => x.toHexString())}]`
  );

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

  // Set up furnace
  const rewardInfo = await fraxFurnace.rewardInfo();
  if (rewardInfo.periodLength !== config.FRAX.rewardPeriod) {
    const tx = await fraxFurnace.updatePeriodLength(config.FRAX.rewardPeriod);
    console.log(
      "Setup Period Length for FRAX_Furnace, hash:",
      tx.hash,
      `length: ${rewardInfo.periodLength} => ${config.FRAX.rewardPeriod}`
    );
    const receipt = await tx.wait();
    console.log("✅ Done, gas used:", receipt.gasUsed.toString());
  }

  {
    const feeInfo = await fraxFurnace.feeInfo();
    const platform = DEPLOYED_CONTRACTS.CLever.Treasury;
    const platformPercentage = config.FRAX.platformFeePercentage;
    const bountyPercentage = config.FRAX.harvestBountyPercentage;
    if (
      feeInfo.platform !== platform ||
      feeInfo.platformPercentage !== platformPercentage ||
      feeInfo.bountyPercentage !== bountyPercentage
    ) {
      const tx = await fraxFurnace.updatePlatformInfo(platform, platformPercentage, bountyPercentage);
      console.log(
        `Setup fees in FRAX_Furnace, hash: ${tx.hash}`,
        `platform: ${feeInfo.platform} => ${platform}`,
        `platformPercentage: ${ethers.utils.formatUnits(feeInfo.platformPercentage, 9)} => ${ethers.utils.formatUnits(
          platformPercentage,
          9
        )}`,
        `bountyPercentage: ${ethers.utils.formatUnits(feeInfo.bountyPercentage, 9)} => ${ethers.utils.formatUnits(
          bountyPercentage,
          9
        )}`
      );
      const receipt = await tx.wait();
      console.log("✅ Done, gas used:", receipt.gasUsed.toString());
    }
  }

  for (const underlying of ["FRAXUSDC", "TUSDFRAXBP", "LUSDFRAXBP"]) {
    let clever: MetaCLever;
    // deploy CLever and strategies
    if (config.FRAX.CLever[underlying].clever !== "") {
      clever = await ethers.getContractAt("MetaCLever", config.FRAX.CLever[underlying].clever, deployer);
      console.log(`Found MetaCLever for ${underlying} at:`, clever.address);
    } else {
      const data = MetaCLever__factory.createInterface().encodeFunctionData("initialize", [
        clevUSD.address,
        fraxFurnace.address,
      ]);
      const BeaconProxy = await ethers.getContractFactory("BeaconProxy", deployer);
      const proxy = await BeaconProxy.deploy(cleverBeacon.address, data);
      console.log(`Deploying MetaCLever For ${underlying}, hash:`, proxy.deployTransaction.hash);
      await proxy.deployed();
      clever = await ethers.getContractAt("MetaCLever", proxy.address, deployer);
      console.log(`✅ Deploy MetaCLever for ${underlying}, at:`, clever.address);
      config.FRAX.CLever[underlying].clever = clever.address;
    }

    // deploy strategies
    for (const percentage of ["100"]) {
      let strategy: ConcentratorStrategy;
      const name = `${underlying}_${percentage}`;
      if (config.FRAX.CLever[underlying].strategies[name] !== "") {
        strategy = await ethers.getContractAt(
          "ConcentratorStrategy",
          config.FRAX.CLever[underlying].strategies[name],
          deployer
        );
        console.log(`Found ConcentratorStrategy ${name} at:`, strategy.address);
      } else {
        const ConcentratorStrategy = await ethers.getContractFactory("ConcentratorStrategy", deployer);
        strategy = await ConcentratorStrategy.deploy(
          DEPLOYED_CONTRACTS.AladdinZap,
          DEPLOYED_CONTRACTS.Concentrator.cvxCRV.ConcentratorIFOVault,
          config.FRAX.CLever[underlying].concentratorPID,
          BigNumber.from(percentage).mul(10000000),
          config.FRAX.CLever[underlying].pool,
          config.FRAX.CLever[underlying].token,
          ADDRESS.FRAX,
          clever.address
        );
        console.log(`Deploying ConcentratorStrategy ${name}, hash:`, strategy.deployTransaction.hash);
        await strategy.deployed();
        console.log(`✅ Deploy ConcentratorStrategy ${name} at:`, strategy.address);
        config.FRAX.CLever[underlying].strategies[name] = strategy.address;
      }
    }

    // Setup CLever
    const expectedReserveRate = config.FRAX.CLever[underlying].reserveRate;
    const currentReserveRate = await clever.reserveRate();
    if (!currentReserveRate.eq(expectedReserveRate)) {
      const tx = await clever.updateReserveRate(expectedReserveRate);
      console.log(
        `Setup reserve rate for CLever_${underlying}, hash:`,
        tx.hash,
        `rate: ${ethers.utils.formatUnits(currentReserveRate, 9)} => ${ethers.utils.formatUnits(
          expectedReserveRate,
          9
        )}`
      );
      const receipt = await tx.wait();
      console.log("✅ Done, gas used:", receipt.gasUsed.toString());
    }

    const feeInfo = await clever.feeInfo();
    const platform = DEPLOYED_CONTRACTS.CLever.Treasury;
    const platformPercentage = config.FRAX.CLever[underlying].platformFeePercentage;
    const repayPercentage = config.FRAX.CLever[underlying].repayFeePercentage;
    const bountyPercentage = config.FRAX.CLever[underlying].harvestBountyPercentage;
    if (
      feeInfo.platform !== platform ||
      feeInfo.platformPercentage !== platformPercentage ||
      feeInfo.repayPercentage !== repayPercentage ||
      feeInfo.bountyPercentage !== bountyPercentage
    ) {
      const tx = await clever.updateFeeInfo(platform, platformPercentage, bountyPercentage, repayPercentage);
      console.log(
        `Setup fees in CLever_${underlying}, hash: ${tx.hash}`,
        `platform: ${feeInfo.platform} => ${platform}`,
        `platformPercentage: ${ethers.utils.formatUnits(feeInfo.platformPercentage, 9)} => ${ethers.utils.formatUnits(
          platformPercentage,
          9
        )}`,
        `bountyPercentage: ${ethers.utils.formatUnits(feeInfo.bountyPercentage, 9)} => ${ethers.utils.formatUnits(
          bountyPercentage,
          9
        )}`,
        `repayPercentage: ${ethers.utils.formatUnits(feeInfo.repayPercentage, 9)} => ${ethers.utils.formatUnits(
          repayPercentage,
          9
        )}`
      );
      const receipt = await tx.wait();
      console.log("✅ Done, gas used:", receipt.gasUsed.toString());
    }

    if (!(await fraxFurnace.isWhitelisted(clever.address))) {
      const tx = await fraxFurnace.updateWhitelists([clever.address], true);
      console.log(`Add whitelist CLever_${underlying} to fraxFurnace, hash:`, tx.hash);
      const receipt = await tx.wait();
      console.log("✅ Done, gas used:", receipt.gasUsed.toString());
    }

    if (!(await clevUSD.isMinter(clever.address))) {
      const tx = await clevUSD.updateMinters([clever.address], true);
      console.log(`Setup CLever_${underlying} as minter of clevUSD, hash:`, tx.hash);
      const receipt = await tx.wait();
      console.log("✅ Done, gas used:", receipt.gasUsed.toString());
    }

    if (!(await clevUSD.minterInfo(clever.address)).ceiling.eq(config.FRAX.CLever[underlying].mintCeiling)) {
      const tx = await clevUSD.updateCeiling(clever.address, config.FRAX.CLever[underlying].mintCeiling);
      console.log(`Setup minter ceiling for CLever_${underlying}, hash:`, tx.hash);
      const receipt = await tx.wait();
      console.log("✅ Done, gas used:", receipt.gasUsed.toString());
    }

    const [, strategies] = await clever.getActiveYieldStrategies();
    for (const percentage of ["100"]) {
      const name = `${underlying}_${percentage}`;
      const strategy = await ethers.getContractAt(
        "ConcentratorStrategy",
        config.FRAX.CLever[underlying].strategies[name],
        deployer
      );
      if (!strategies.includes(strategy.address)) {
        const tx = await clever.addYieldStrategy(strategy.address, []);
        console.log(`setup add ConcentratorStrategy ${name} to CLever_${underlying}, hash:`, tx.hash);
        const receipt = await tx.wait();
        console.log("✅ Done, gas used:", receipt.gasUsed.toString());
      }
    }
  }
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

  for (const reward of ["aCRV", "CVX", "CRV", "FRAX"]) {
    if (config.FeeDistributor[reward] !== "") {
      distributor = await ethers.getContractAt("FeeDistributor", config.FeeDistributor[reward], deployer);
      console.log(`Found FeeDistributor for ${reward} at:`, distributor.address);
    } else {
      const FeeDistributor = await ethers.getContractFactory("FeeDistributor", deployer);
      const timestamp = (await ethers.provider.getBlock("latest")).timestamp;
      if (reward === "aCRV") {
        distributor = await FeeDistributor.deploy(
          DEPLOYED_CONTRACTS.Concentrator.veCTR,
          timestamp,
          TOKENS[reward].address,
          DEPLOYED_CONTRACTS.Concentrator.Treasury,
          DEPLOYED_CONTRACTS.Concentrator.Treasury
        );
      } else {
        distributor = await FeeDistributor.deploy(
          ve.address,
          timestamp,
          TOKENS[reward].address,
          DEPLOYED_CONTRACTS.CLever.Treasury,
          DEPLOYED_CONTRACTS.CLever.Treasury
        );
      }
      console.log(`Deploying FeeDistributor for ${reward}, hash:`, distributor.deployTransaction.hash);
      await distributor.deployed();
      config.FeeDistributor[reward] = distributor.address;
      console.log(`✅ Deploy FeeDistributor for ${reward} at:`, distributor.address);
    }
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

  if (config.PlatformFeeDistributor !== "") {
    platform = await ethers.getContractAt("PlatformFeeDistributor", config.PlatformFeeDistributor, deployer);
    console.log("Found PlatformFeeDistributor at:", platform.address);
  } else {
    const PlatformFeeDistributor = await ethers.getContractFactory("PlatformFeeDistributor", deployer);
    platform = await PlatformFeeDistributor.deploy(
      "0x11E91BB6d1334585AA37D8F4fde3932C7960B938",
      DEPLOYED_CONTRACTS.CLever.Treasury,
      config.FeeDistributor.CVX,
      [{ token: TOKENS.CVX.address, gaugePercentage: 0, treasuryPercentage: 250000000 }]
    );
    console.log("Deploying PlatformFeeDistributor, hash:", platform.deployTransaction.hash);
    await platform.deployed();
    config.PlatformFeeDistributor = platform.address;
    console.log("✅ Deploy PlatformFeeDistributor at:", platform.address);
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
