/* eslint-disable camelcase */
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ZeroAddress } from "ethers";
import { ethers } from "hardhat";

import { request_fork } from "@/test/utils";
import { FxEzETHTwapOracle, MockTwapOracle } from "@/types/index";

const FOKR_HEIGHT = 19203007;

describe("FxEzETHTwapOracle.spec", async () => {
  let deployer: HardhatEthersSigner;

  let oracle: FxEzETHTwapOracle;

  beforeEach(async () => {
    request_fork(FOKR_HEIGHT, [ZeroAddress]);
    deployer = await ethers.getSigner(ZeroAddress);

    const FxEzETHTwapOracle = await ethers.getContractFactory("FxEzETHTwapOracle", deployer);
    oracle = await FxEzETHTwapOracle.deploy(
      "0x85de3add465a219ee25e04d22c39ab027cf5c12e",
      "0x4e68ccd3e89f51c3074ca5072bbac773960dfa36",
      "0x460B3CdE57DfbA90DBed02fd83d3990a92DA1230"
    );
  });

  it("should succeed when normal", async () => {
    const r = await oracle.getPrice();
    expect(r.isValid).to.eq(true);
    expect(r.safePrice).to.eq(r.minUnsafePrice);
    expect(r.safePrice).to.eq(r.maxUnsafePrice);
  });

  context("ETH price invalid", async () => {
    let twap: MockTwapOracle;

    beforeEach(async () => {
      const MockTwapOracle = await ethers.getContractFactory("MockTwapOracle", deployer);
      twap = await MockTwapOracle.deploy();

      const FxEzETHTwapOracle = await ethers.getContractFactory("FxEzETHTwapOracle", deployer);
      oracle = await FxEzETHTwapOracle.deploy(
        "0x85de3add465a219ee25e04d22c39ab027cf5c12e",
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

  context("ezETH price invalid", async () => {
    let twap: MockTwapOracle;

    beforeEach(async () => {
      const MockTwapOracle = await ethers.getContractFactory("MockTwapOracle", deployer);
      twap = await MockTwapOracle.deploy();
      const FxEzETHTwapOracle = await ethers.getContractFactory("FxEzETHTwapOracle", deployer);
      oracle = await FxEzETHTwapOracle.deploy(
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
