/* eslint-disable camelcase */
/* eslint-disable node/no-missing-import */
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { constants } from "ethers";
import { ethers } from "hardhat";
import { TOKENS } from "../../scripts/utils";
import { ChainlinkPriceOracle } from "../../typechain";
import { request_fork } from "../utils";

const FORK_HEIGHT = 16485890;
const DEPLOYER = "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf";
const OTHER = "0xBE0eB53F46cd790Cd13851d5EFf43D12404d33E8";

const FEEDS: { [symbol: string]: string } = {
  CRV: "0xCd627aA160A6fA45Eb793D19Ef54f5062F20f33f",
  CVX: "0xd962fC30A72A84cE50161031391756Bf2876Af5D",
  DAI: "0xAed0c38402a5d19df6E4c03F4E2DceD6e29c1ee9",
  USDC: "0x8fFfFfd4AfB6115b954Bd326cbe7B4BA576818f6",
  USDT: "0x3E7d1eAB13ad0104d2750B8863b489D65364e32D",
  FRAX: "0xB9E1E3A9feFf48998E45Fa90847ed4D467E8BcfD",
  WETH: "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419",
};

describe("ChainlinkPriceOracle.spec", async () => {
  let deployer: SignerWithAddress;
  let other: SignerWithAddress;
  let oracle: ChainlinkPriceOracle;

  beforeEach(async () => {
    request_fork(FORK_HEIGHT, [DEPLOYER, OTHER]);
    deployer = await ethers.getSigner(DEPLOYER);
    other = await ethers.getSigner(OTHER);

    const ChainlinkPriceOracle = await ethers.getContractFactory("ChainlinkPriceOracle", deployer);
    oracle = await ChainlinkPriceOracle.deploy();
    await oracle.deployed();
  });

  context("auth", async () => {
    it("should revert, when non-owner call", async () => {
      await expect(oracle.connect(other).setFeeds([], [])).to.revertedWith("Ownable: caller is not the owner");
    });

    it("should revert, when length mismatch", async () => {
      await expect(oracle.setFeeds([], [constants.AddressZero])).to.revertedWith("length mismatch");
      await expect(oracle.setFeeds([constants.AddressZero], [])).to.revertedWith("length mismatch");
    });

    it("should succeed", async () => {
      expect((await oracle.feeds(TOKENS.CRV.address)).feed).to.eq(constants.AddressZero);
      expect((await oracle.feeds(TOKENS.CRV.address)).decimal).to.eq(0);
      await oracle.setFeeds([TOKENS.CRV.address], [FEEDS.CRV]);
      expect((await oracle.feeds(TOKENS.CRV.address)).feed).to.eq(FEEDS.CRV);
      expect((await oracle.feeds(TOKENS.CRV.address)).decimal).to.eq(8);
    });
  });

  context("price", async () => {
    beforeEach(async () => {
      await oracle.setFeeds(
        Object.keys(FEEDS).map((symbol) => TOKENS[symbol].address),
        Object.keys(FEEDS).map((symbol) => FEEDS[symbol])
      );
    });

    it("should succeed", async () => {
      for (const symbol of Object.keys(FEEDS)) {
        const gas = await oracle.estimateGas.price(TOKENS[symbol].address);
        console.log(
          `price of ${symbol}: ${ethers.utils.formatEther(await oracle.price(TOKENS[symbol].address))},`,
          "gas usage:",
          gas.toString()
        );
      }
    });
  });
});
