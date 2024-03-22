/* eslint-disable camelcase */
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ZeroAddress } from "ethers";
import { ethers } from "hardhat";

import { request_fork } from "@/test/utils";
import { FxCVXTwapOracle, MockTwapOracle } from "@/types/index";

const FOKR_HEIGHT = 19203007;

describe("FxCVXTwapOracle.spec", async () => {
  let deployer: HardhatEthersSigner;

  let oracle: FxCVXTwapOracle;

  beforeEach(async () => {
    request_fork(FOKR_HEIGHT, [ZeroAddress]);
    deployer = await ethers.getSigner(ZeroAddress);

    const ChainlinkTwapOracleV3 = await ethers.getContractFactory("ChainlinkTwapOracleV3", deployer);
    const cvxTwapOracle = await ChainlinkTwapOracleV3.deploy(
      "0xd962fC30A72A84cE50161031391756Bf2876Af5D",
      1,
      10800,
      "CVX"
    );

    const FxCVXTwapOracle = await ethers.getContractFactory("FxCVXTwapOracle", deployer);
    oracle = await FxCVXTwapOracle.deploy(
      "0xB576491F1E6e5E62f1d8F26062Ee822B40B0E0d4",
      cvxTwapOracle.getAddress(),
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
      const ChainlinkTwapOracleV3 = await ethers.getContractFactory("ChainlinkTwapOracleV3", deployer);
      const cvxTwapOracle = await ChainlinkTwapOracleV3.deploy(
        "0xd962fC30A72A84cE50161031391756Bf2876Af5D",
        1,
        10800,
        "CVX"
      );

      const FxCVXTwapOracle = await ethers.getContractFactory("FxCVXTwapOracle", deployer);
      oracle = await FxCVXTwapOracle.deploy(
        "0xB576491F1E6e5E62f1d8F26062Ee822B40B0E0d4",
        cvxTwapOracle.getAddress(),
        twap.getAddress()
      );
    });

    it("should succeed return invalid when ETHUSD too large", async () => {
      await twap.setPrice(ethers.parseEther("6000"));
      const r = await oracle.getPrice();
      expect(r.isValid).to.eq(false);
      expect(r.safePrice).to.eq(ethers.parseEther("3.18672869"));
      expect(r.minUnsafePrice).to.eq(ethers.parseEther("3.18672869"));
      expect(r.maxUnsafePrice).to.eq(ethers.parseEther("7.565500807384974"));
    });

    it("should succeed return invalid when ETHUSD price too small", async () => {
      await twap.setPrice(ethers.parseEther("2000"));
      const r = await oracle.getPrice();
      expect(r.isValid).to.eq(false);
      expect(r.safePrice).to.eq(ethers.parseEther("3.18672869"));
      expect(r.maxUnsafePrice).to.eq(ethers.parseEther("3.18672869"));
      expect(r.minUnsafePrice).to.eq(ethers.parseEther("2.521833602461658"));
    });
  });
});
