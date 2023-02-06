/* eslint-disable camelcase */
/* eslint-disable node/no-missing-import */
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { constants } from "ethers";
import { ethers } from "hardhat";
import { TOKENS } from "../../scripts/utils";
import { ChainlinkPriceOracle, CurveBasePoolPriceOracle, CurveV2PriceOracle } from "../../typechain";
import { request_fork } from "../utils";

const FORK_HEIGHT = 16485890;
const DEPLOYER = "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf";
const OTHER = "0xBE0eB53F46cd790Cd13851d5EFf43D12404d33E8";

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

const USDC_POOLS: { [symbol: string]: string } = {
  STG: "0x3211C6cBeF1429da3D0d58494938299C92Ad5860",
  EURS: "0x98a7F18d4E56Cfe84E3D081B40001B3d5bD3eB8B",
  FIDU: "0x80aa1a80a30055DAA084E599836532F3e58c95E2",
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

const TRICRV_POOLS: { [symbol: string]: string } = {
  EURT: "0x9838eccc42659fa8aa7daf2ad134b53984c9427b",
  DCHF: "0xdcb11e81c8b8a1e06bf4b50d4f6f3bb31f7478c3",
  EUROC: "0xe84f5b1582ba325fdf9ce6b0c1f087ccfc924e54",
};

describe("CurveV2PriceOracle.spec", async () => {
  let deployer: SignerWithAddress;
  let other: SignerWithAddress;
  let baseOracleChainlink: ChainlinkPriceOracle;
  let baseOracleCurveBasePool: CurveBasePoolPriceOracle;
  let oracleWETH: CurveV2PriceOracle;
  let oracleUSDC: CurveV2PriceOracle;
  let oracleFraxBP: CurveV2PriceOracle;
  let oracle3CRV: CurveV2PriceOracle;

  beforeEach(async () => {
    request_fork(FORK_HEIGHT, [DEPLOYER, OTHER]);
    deployer = await ethers.getSigner(DEPLOYER);
    other = await ethers.getSigner(OTHER);

    const ChainlinkPriceOracle = await ethers.getContractFactory("ChainlinkPriceOracle", deployer);
    baseOracleChainlink = await ChainlinkPriceOracle.deploy();
    await baseOracleChainlink.deployed();

    const CurveBasePoolPriceOracle = await ethers.getContractFactory("CurveBasePoolPriceOracle", deployer);
    baseOracleCurveBasePool = await CurveBasePoolPriceOracle.deploy(baseOracleChainlink.address);
    await baseOracleCurveBasePool.deployed();

    const CurveV2PriceOracle = await ethers.getContractFactory("CurveV2PriceOracle", deployer);
    oracleWETH = await CurveV2PriceOracle.deploy(baseOracleChainlink.address, TOKENS.WETH.address);
    await oracleWETH.deployed();

    oracleUSDC = await CurveV2PriceOracle.deploy(baseOracleChainlink.address, TOKENS.USDC.address);
    await oracleUSDC.deployed();

    oracleFraxBP = await CurveV2PriceOracle.deploy(baseOracleCurveBasePool.address, TOKENS.crvFRAX.address);
    await oracleFraxBP.deployed();

    oracle3CRV = await CurveV2PriceOracle.deploy(baseOracleCurveBasePool.address, TOKENS.TRICRV.address);
    await oracle3CRV.deployed();

    await baseOracleChainlink.setFeeds([TOKENS.WETH.address], ["0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419"]);
    await baseOracleChainlink.setFeeds([TOKENS.USDC.address], ["0x8fFfFfd4AfB6115b954Bd326cbe7B4BA576818f6"]);
    await baseOracleChainlink.setFeeds([TOKENS.USDT.address], ["0x3E7d1eAB13ad0104d2750B8863b489D65364e32D"]);
    await baseOracleChainlink.setFeeds([TOKENS.DAI.address], ["0xAed0c38402a5d19df6E4c03F4E2DceD6e29c1ee9"]);
    await baseOracleChainlink.setFeeds([TOKENS.FRAX.address], ["0xB9E1E3A9feFf48998E45Fa90847ed4D467E8BcfD"]);
    await baseOracleCurveBasePool.setPools([TOKENS.crvFRAX.address], ["0xDcEF968d416a41Cdac0ED8702fAC8128A64241A2"]);
    await baseOracleCurveBasePool.setPools([TOKENS.TRICRV.address], ["0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7"]);
  });

  context("auth", async () => {
    it("should revert, when non-owner call", async () => {
      await expect(oracleUSDC.connect(other).setPools([], [])).to.revertedWith("Ownable: caller is not the owner");
    });

    it("should revert, when length mismatch", async () => {
      await expect(oracleUSDC.setPools([], [constants.AddressZero])).to.revertedWith("length mismatch");
      await expect(oracleUSDC.setPools([constants.AddressZero], [])).to.revertedWith("length mismatch");
    });

    it("should succeed, when base is coin0", async () => {
      expect((await oracleUSDC.pools(TOKENS.EURS.address)).pool).to.eq(constants.AddressZero);
      expect((await oracleUSDC.pools(TOKENS.EURS.address)).baseIndex).to.eq(0);
      await oracleUSDC.setPools([TOKENS.EURS.address], [USDC_POOLS.EURS]);
      expect((await oracleUSDC.pools(TOKENS.EURS.address)).pool).to.eq(USDC_POOLS.EURS);
      expect((await oracleUSDC.pools(TOKENS.EURS.address)).baseIndex).to.eq(0);
    });

    it("should succeed, when base is coin1", async () => {
      expect((await oracleUSDC.pools(TOKENS.STG.address)).pool).to.eq(constants.AddressZero);
      expect((await oracleUSDC.pools(TOKENS.STG.address)).baseIndex).to.eq(0);
      await oracleUSDC.setPools([TOKENS.STG.address], [USDC_POOLS.STG]);
      expect((await oracleUSDC.pools(TOKENS.STG.address)).pool).to.eq(USDC_POOLS.STG);
      expect((await oracleUSDC.pools(TOKENS.STG.address)).baseIndex).to.eq(1);
    });
  });

  context("price with WETH base", async () => {
    beforeEach(async () => {
      await oracleWETH.setPools(
        Object.keys(WETH_POOLS).map((symbol) => TOKENS[symbol].address),
        Object.keys(WETH_POOLS).map((symbol) => WETH_POOLS[symbol])
      );
    });

    it("should succeed", async () => {
      for (const symbol of Object.keys(WETH_POOLS)) {
        const gas = await oracleWETH.estimateGas.price(TOKENS[symbol].address);
        console.log(
          `price of ${symbol}: ${ethers.utils.formatEther(await oracleWETH.price(TOKENS[symbol].address))},`,
          "gas usage:",
          gas.toString()
        );
      }
    });
  });

  context("price with USDC base", async () => {
    beforeEach(async () => {
      await oracleUSDC.setPools(
        Object.keys(USDC_POOLS).map((symbol) => TOKENS[symbol].address),
        Object.keys(USDC_POOLS).map((symbol) => USDC_POOLS[symbol])
      );
    });

    it("should succeed", async () => {
      for (const symbol of Object.keys(USDC_POOLS)) {
        const gas = await oracleUSDC.estimateGas.price(TOKENS[symbol].address);
        console.log(
          `price of ${symbol}: ${ethers.utils.formatEther(await oracleUSDC.price(TOKENS[symbol].address))},`,
          "gas usage:",
          gas.toString()
        );
      }
    });
  });

  context("price with FraxBP base", async () => {
    beforeEach(async () => {
      await oracleFraxBP.setPools(
        Object.keys(FRAXBP_POOLS).map((symbol) => TOKENS[symbol].address),
        Object.keys(FRAXBP_POOLS).map((symbol) => FRAXBP_POOLS[symbol])
      );
    });

    it("should succeed", async () => {
      for (const symbol of Object.keys(FRAXBP_POOLS)) {
        const gas = await oracleFraxBP.estimateGas.price(TOKENS[symbol].address);
        console.log(
          `price of ${symbol}: ${ethers.utils.formatEther(await oracleFraxBP.price(TOKENS[symbol].address))},`,
          "gas usage:",
          gas.toString()
        );
      }
    });
  });

  context("price with 3CRV base", async () => {
    beforeEach(async () => {
      await oracle3CRV.setPools(
        Object.keys(TRICRV_POOLS).map((symbol) => TOKENS[symbol].address),
        Object.keys(TRICRV_POOLS).map((symbol) => TRICRV_POOLS[symbol])
      );
    });

    it("should succeed", async () => {
      for (const symbol of Object.keys(TRICRV_POOLS)) {
        const gas = await oracle3CRV.estimateGas.price(TOKENS[symbol].address);
        console.log(
          `price of ${symbol}: ${ethers.utils.formatEther(await oracle3CRV.price(TOKENS[symbol].address))},`,
          "gas usage:",
          gas.toString()
        );
      }
    });
  });
});
