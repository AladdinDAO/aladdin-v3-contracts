/* eslint-disable camelcase */
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ZeroAddress } from "ethers";
import { ethers } from "hardhat";

import { request_fork } from "@/test/utils";
import { FxEzETHTwapOracle, IFxRateProvider, MockTwapOracle } from "@/types/index";

const FOKR_HEIGHT = 19438990;

describe("FxEzETHTwapOracle.spec", async () => {
  let deployer: HardhatEthersSigner;

  let oracle: FxEzETHTwapOracle;

  beforeEach(async () => {
    request_fork(FOKR_HEIGHT, [ZeroAddress]);
    deployer = await ethers.getSigner(ZeroAddress);

    const ChainlinkTwapOracleV3 = await ethers.getContractFactory("ChainlinkTwapOracleV3", deployer);
    const ezETHTwapOracle = await ChainlinkTwapOracleV3.deploy(
      "0xF4a3e183F59D2599ee3DF213ff78b1B3b1923696",
      1,
      10800,
      "ezETH"
    );

    const FxEzETHTwapOracle = await ethers.getContractFactory("FxEzETHTwapOracle", deployer);
    oracle = await FxEzETHTwapOracle.deploy(ezETHTwapOracle.getAddress(), "0x460B3CdE57DfbA90DBed02fd83d3990a92DA1230");
  });

  it("should succeed when normal", async () => {
    const r = await oracle.getPrice();
    expect(r.isValid).to.eq(true);
    expect(r.safePrice).to.closeTo(r.minUnsafePrice, r.safePrice / 100n);
    expect(r.safePrice).to.closeTo(r.maxUnsafePrice, r.safePrice / 100n);
  });

  context("ETH price invalid", async () => {
    let twap: MockTwapOracle;
    let rate: IFxRateProvider;

    beforeEach(async () => {
      rate = await ethers.getContractAt("IFxRateProvider", "0x387dBc0fB00b26fb085aa658527D5BE98302c84C", deployer);

      const MockTwapOracle = await ethers.getContractFactory("MockTwapOracle", deployer);
      twap = await MockTwapOracle.deploy();

      const FxEzETHTwapOracle = await ethers.getContractFactory("FxEzETHTwapOracle", deployer);
      oracle = await FxEzETHTwapOracle.deploy(twap.getAddress(), "0x460B3CdE57DfbA90DBed02fd83d3990a92DA1230");
    });

    it("should succeed return invalid when ezETH/ETH too large", async () => {
      await twap.setPrice(((await rate.getRate()) * 102n) / 100n);
      const r = await oracle.getPrice();
      expect(r.isValid).to.eq(false);
    });

    it("should succeed return invalid when ezETH/ETH price too small", async () => {
      await twap.setPrice(((await rate.getRate()) * 98n) / 100n);
      const r = await oracle.getPrice();
      expect(r.isValid).to.eq(false);
    });
  });
});
