/* eslint-disable camelcase */
/* eslint-disable node/no-missing-import */
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { constants } from "ethers";
import { ethers } from "hardhat";
import { DEPLOYED_CONTRACTS, TOKENS } from "../../../scripts/utils";
import {
  AladdinPriceOracle,
  ChainlinkPriceOracle,
  CurveBasePoolPriceOracle,
  CurveV2PriceOracle,
  CvxCrvStakingWrapperStrategy,
  CvxCrvWeightAdjuster,
} from "../../../typechain";
import { request_fork } from "../../utils";

const FORK_HEIGHT = 16492610;
const DEPLOYER = "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf";
const OTHER = "0xBE0eB53F46cd790Cd13851d5EFf43D12404d33E8";
const STRATEGY = "0x94cC627Db80253056B2130aAC39abB252A75F345";

const FEEDS: { [symbol: string]: string } = {
  CRV: "0xCd627aA160A6fA45Eb793D19Ef54f5062F20f33f",
  CVX: "0xd962fC30A72A84cE50161031391756Bf2876Af5D",
  DAI: "0xAed0c38402a5d19df6E4c03F4E2DceD6e29c1ee9",
  USDC: "0x8fFfFfd4AfB6115b954Bd326cbe7B4BA576818f6",
  USDT: "0x3E7d1eAB13ad0104d2750B8863b489D65364e32D",
  FRAX: "0xB9E1E3A9feFf48998E45Fa90847ed4D467E8BcfD",
  WETH: "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419",
};

const WETH_POOLS: { [symbol: string]: string } = {
  CRV: "0x8301AE4fc9c624d1D396cbDAa1ed877821D7C511",
  CVX: "0xB576491F1E6e5E62f1d8F26062Ee822B40B0E0d4",
  LDO: "0x9409280DC1e6D33AB7A8C6EC03e5763FB61772B5",
  YFI: "0xC26b89A667578ec7b3f11b2F98d6Fd15C07C54ba",
  KP3R: "0x21410232B484136404911780bC32756D5d1a9Fa9",
  cbETH: "0x5FAE7E604FC3e24fd43A72867ceBaC94c65b404A",
  T: "0x752eBeb79963cf0732E9c0fec72a49FD1DEfAEAC",
  GEAR: "0x0E9B5B092caD6F1c5E6bc7f89Ffe1abb5c95F1C2",
};

const FRAXBP_POOLS: { [symbol: string]: string } = {
  cvxFXS: "0x21d158d95c2e150e144c36fc64e3653b8d6c6267",
  RSR: "0x6a6283ab6e31c2aec3fa08697a8f806b740660b2",
  cvxCRV: "0x31c325a01861c7dbd331a9270296a31296d797a0",
  CVX: "0xbec570d92afb7ffc553bdd9d4b4638121000b10d",
  BADGER: "0x13b876c26ad6d21cb87ae459eaf6d7a1b788a113",
  agEUR: "0x58257e4291f95165184b4bea7793a1d6f8e7b627",
  SDT: "0x3e3c6c7db23cddef80b694679aaf1bcd9517d0ae",
  ALCX: "0x4149d1038575ce235e03e03b39487a80fd709d31",
};

describe("CvxCrvWeightAdjuster.spec", async () => {
  let deployer: SignerWithAddress;
  let other: SignerWithAddress;
  let adjuster: CvxCrvWeightAdjuster;
  let chainlinkOracle: ChainlinkPriceOracle;
  let curveV2OracleWETH: CurveV2PriceOracle;
  let curveV2OracleFraxBP: CurveV2PriceOracle;
  let curveBasePoolOracle: CurveBasePoolPriceOracle;
  let oracle: AladdinPriceOracle;
  let strategy: CvxCrvStakingWrapperStrategy;

  beforeEach(async () => {
    request_fork(FORK_HEIGHT, [DEPLOYER, OTHER, DEPLOYED_CONTRACTS.ManagementMultisig]);
    deployer = await ethers.getSigner(DEPLOYER);
    other = await ethers.getSigner(OTHER);

    const owner = await ethers.getSigner(DEPLOYED_CONTRACTS.ManagementMultisig);
    await deployer.sendTransaction({ to: owner.address, value: ethers.utils.parseEther("10") });

    const AladdinPriceOracle = await ethers.getContractFactory("AladdinPriceOracle", deployer);
    oracle = await AladdinPriceOracle.deploy();
    await oracle.deployed();

    const ChainlinkPriceOracle = await ethers.getContractFactory("ChainlinkPriceOracle", deployer);
    chainlinkOracle = await ChainlinkPriceOracle.deploy();
    await chainlinkOracle.deployed();

    const CurveBasePoolPriceOracle = await ethers.getContractFactory("CurveBasePoolPriceOracle", deployer);
    curveBasePoolOracle = await CurveBasePoolPriceOracle.deploy(chainlinkOracle.address);
    await curveBasePoolOracle.deployed();

    const CurveV2PriceOracle = await ethers.getContractFactory("CurveV2PriceOracle", deployer);
    curveV2OracleWETH = await CurveV2PriceOracle.deploy(chainlinkOracle.address, TOKENS.WETH.address);
    await curveV2OracleWETH.deployed();

    curveV2OracleFraxBP = await CurveV2PriceOracle.deploy(curveBasePoolOracle.address, TOKENS.crvFRAX.address);
    await curveV2OracleFraxBP.deployed();

    for (const symbol of ["WETH", "USDC", "DAI", "USDT", "FRAX"]) {
      await chainlinkOracle.setFeeds([TOKENS[symbol].address], [FEEDS[symbol]]);
    }

    await curveV2OracleWETH.setPools([TOKENS.CRV.address], [WETH_POOLS.CRV]); // CRV
    await curveV2OracleWETH.setPools([TOKENS.CVX.address], [WETH_POOLS.CVX]); // CVX
    await curveV2OracleFraxBP.setPools([TOKENS.cvxCRV.address], [FRAXBP_POOLS.cvxCRV]); // cvxCRV
    await curveBasePoolOracle.setPools([TOKENS.crvFRAX.address], ["0xDcEF968d416a41Cdac0ED8702fAC8128A64241A2"]); // fraxBP
    await curveBasePoolOracle.setPools([TOKENS.TRICRV.address], ["0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7"]); // 3crv

    await oracle.setSources([TOKENS.CRV.address], [curveV2OracleWETH.address]); // CRV
    await oracle.setSources([TOKENS.CVX.address], [curveV2OracleWETH.address]); // CVX
    await oracle.setSources([TOKENS.TRICRV.address], [curveBasePoolOracle.address]); // 3CRV
    await oracle.setSources([TOKENS.cvxCRV.address], [curveV2OracleFraxBP.address]); // cvxCRV

    const CvxCrvWeightAdjuster = await ethers.getContractFactory("CvxCrvWeightAdjuster", deployer);
    adjuster = await CvxCrvWeightAdjuster.deploy(oracle.address, STRATEGY);
    await adjuster.deployed();

    strategy = await ethers.getContractAt("CvxCrvStakingWrapperStrategy", STRATEGY, owner);
    await strategy.transferOwnership(adjuster.address);
  });

  it("should price", async () => {
    console.log("CRV price:", ethers.utils.formatEther(await oracle.price(TOKENS.CRV.address)));
    console.log("CVX price:", ethers.utils.formatEther(await oracle.price(TOKENS.CVX.address)));
    console.log("3CRV price:", ethers.utils.formatEther(await oracle.price(TOKENS.TRICRV.address)));
    console.log("cvxCRV price:", ethers.utils.formatEther(await oracle.price(TOKENS.cvxCRV.address)));
  });

  context("auth", async () => {
    context("switchWeightAdjuster", async () => {
      it("should revert, when non-owner call", async () => {
        await expect(adjuster.connect(other).switchWeightAdjuster(constants.AddressZero)).to.revertedWith(
          "Ownable: caller is not the owner"
        );
      });

      it("should succeed", async () => {
        expect(await strategy.owner()).to.eq(adjuster.address);
        await adjuster.switchWeightAdjuster(deployer.address);
        expect(await strategy.owner()).to.eq(deployer.address);
      });
    });

    context("setPermissioned", async () => {
      it("should revert, when non-owner call", async () => {
        await expect(adjuster.connect(other).setPermissioned(false)).to.revertedWith(
          "Ownable: caller is not the owner"
        );
      });

      it("should succeed", async () => {
        expect(await adjuster.isPermissioned()).to.eq(true);
        await adjuster.setPermissioned(false);
        expect(await adjuster.isPermissioned()).to.eq(false);
        await adjuster.setPermissioned(true);
        expect(await adjuster.isPermissioned()).to.eq(true);
      });
    });

    context("setAdjusters", async () => {
      it("should revert, when non-owner call", async () => {
        await expect(adjuster.connect(other).setAdjusters([], false)).to.revertedWith(
          "Ownable: caller is not the owner"
        );
      });

      it("should succeed", async () => {
        expect(await adjuster.adjusters(deployer.address)).to.eq(false);
        await adjuster.setAdjusters([deployer.address], true);
        expect(await adjuster.adjusters(deployer.address)).to.eq(true);
        await adjuster.setAdjusters([deployer.address], false);
        expect(await adjuster.adjusters(deployer.address)).to.eq(false);
      });
    });

    context("forceAdjust", async () => {
      it("should revert, when non-owner call", async () => {
        await expect(adjuster.connect(other).forceAdjust(1)).to.revertedWith("Ownable: caller is not the owner");
      });

      it("should succeed", async () => {
        await adjuster.forceAdjust(1);
      });
    });
  });

  context("adjust", async () => {
    it("should revert, when not permissioned", async () => {
      await expect(adjuster.adjust(0)).to.revertedWith("not allowed");
    });

    it("should revert, when insufficient daily APR", async () => {
      await adjuster.setAdjusters([deployer.address], true);
      await expect(adjuster.adjust(constants.MaxUint256)).to.revertedWith("insufficient daily APR");
    });

    it("should succeed, when adjust by anyone", async () => {
      const currentDailyAPR = await adjuster.getCurrentDailyAPR();
      console.log("current daily APR:", ethers.utils.formatEther(currentDailyAPR));
      console.log("current yearly APR:", ethers.utils.formatEther(currentDailyAPR.mul(365)));

      const [optimalDailyAPR, optimalWeight] = await adjuster.getOptimalDailyAPR();
      console.log("optimal daily APR:", ethers.utils.formatEther(optimalDailyAPR));
      console.log("optimal yearly APR:", ethers.utils.formatEther(optimalDailyAPR.mul(365)));
      console.log("optimal weight:", ethers.utils.formatUnits(optimalWeight, 4));

      await adjuster.setPermissioned(false);
      await adjuster.adjust(0);

      const adjustedDailyAPR = await adjuster.getCurrentDailyAPR();
      console.log("adjusted daily APR:", ethers.utils.formatEther(adjustedDailyAPR));
      console.log("adjusted yearly APR:", ethers.utils.formatEther(adjustedDailyAPR.mul(365)));
    });

    it("should succeed, when adjust by adjuster", async () => {
      const currentDailyAPR = await adjuster.getCurrentDailyAPR();
      console.log("current daily APR:", ethers.utils.formatEther(currentDailyAPR));
      console.log("current yearly APR:", ethers.utils.formatEther(currentDailyAPR.mul(365)));

      const [optimalDailyAPR, optimalWeight] = await adjuster.getOptimalDailyAPR();
      console.log("optimal daily APR:", ethers.utils.formatEther(optimalDailyAPR));
      console.log("optimal yearly APR:", ethers.utils.formatEther(optimalDailyAPR.mul(365)));
      console.log("optimal weight:", ethers.utils.formatUnits(optimalWeight, 4));

      await adjuster.setAdjusters([deployer.address], true);
      await adjuster.adjust(0);

      const adjustedDailyAPR = await adjuster.getCurrentDailyAPR();
      console.log("adjusted daily APR:", ethers.utils.formatEther(adjustedDailyAPR));
      console.log("adjusted yearly APR:", ethers.utils.formatEther(adjustedDailyAPR.mul(365)));
    });
  });
});
