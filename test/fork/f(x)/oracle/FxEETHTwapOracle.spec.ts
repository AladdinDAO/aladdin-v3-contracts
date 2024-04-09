/* eslint-disable camelcase */
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ZeroAddress } from "ethers";
import { ethers } from "hardhat";

import { request_fork } from "@/test/utils";
import { FxEETHTwapOracle, MockTwapOracle } from "@/types/index";

const FOKR_HEIGHT = 19203007;

describe("FxEETHTwapOracle.spec", async () => {
  let deployer: HardhatEthersSigner;

  let oracle: FxEETHTwapOracle;

  beforeEach(async () => {
    request_fork(FOKR_HEIGHT, [ZeroAddress]);
    deployer = await ethers.getSigner(ZeroAddress);

    const FxEETHTwapOracle = await ethers.getContractFactory("FxEETHTwapOracle", deployer);
    oracle = await FxEETHTwapOracle.deploy(
      "0x13947303f63b363876868d070f14dc865c36463b",
      "0x4e68ccd3e89f51c3074ca5072bbac773960dfa36",
      "0x460B3CdE57DfbA90DBed02fd83d3990a92DA1230"
    );
  });

  it("should succeed when normal", async () => {
    const r = await oracle.getPrice();
    expect(r.isValid).to.eq(true);
    expect(r.safePrice).to.closeTo(r.minUnsafePrice, r.safePrice / 100n);
    expect(r.safePrice).to.closeTo(r.maxUnsafePrice, r.safePrice / 100n);
  });

  context("ETH price invalid", async () => {
    let twap: MockTwapOracle;

    beforeEach(async () => {
      const MockTwapOracle = await ethers.getContractFactory("MockTwapOracle", deployer);
      twap = await MockTwapOracle.deploy();

      const FxEETHTwapOracle = await ethers.getContractFactory("FxEETHTwapOracle", deployer);
      oracle = await FxEETHTwapOracle.deploy(
        "0x13947303f63b363876868d070f14dc865c36463b",
        "0x4e68ccd3e89f51c3074ca5072bbac773960dfa36",
        twap.getAddress()
      );
    });

    it("should succeed return invalid when UniV3 price too large", async () => {
      // uniswap price is 2525.289389
      await twap.setPrice(ethers.parseEther("2295.717626363636363636"));
      const r = await oracle.getPrice();
      expect(r.isValid).to.eq(false);
      expect(r.safePrice).to.eq(ethers.parseEther("2295.717626363636363636"));
    });

    it("should succeed return invalid when UniV3 price too small", async () => {
      // uniswap price is 2525.289389
      await twap.setPrice(ethers.parseEther("2805.877098888888888888"));
      const r = await oracle.getPrice();
      expect(r.isValid).to.eq(false);
      expect(r.safePrice).to.eq(ethers.parseEther("2805.877098888888888888"));
    });
  });

  context("eETH price invalid", async () => {
    let twap: MockTwapOracle;

    beforeEach(async () => {
      const MockTwapOracle = await ethers.getContractFactory("MockTwapOracle", deployer);
      twap = await MockTwapOracle.deploy();
      const FxEETHTwapOracle = await ethers.getContractFactory("FxEETHTwapOracle", deployer);
      oracle = await FxEETHTwapOracle.deploy(
        twap.getAddress(),
        "0x4e68ccd3e89f51c3074ca5072bbac773960dfa36",
        "0x460B3CdE57DfbA90DBed02fd83d3990a92DA1230"
      );
    });

    it("should succeed return invalid when curve price too large", async () => {
      await twap.setPrice(ethers.parseEther("1.1"));
      const r = await oracle.getPrice();
      expect(r.isValid).to.eq(false);
    });

    it("should succeed return invalid when curve price too small", async () => {
      await twap.setPrice(ethers.parseEther("0.9"));
      const r = await oracle.getPrice();
      expect(r.isValid).to.eq(false);
    });
  });
});
