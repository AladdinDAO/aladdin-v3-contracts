/* eslint-disable camelcase */
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ZeroAddress } from "ethers";
import { ethers } from "hardhat";

import { request_fork } from "@/test/utils";
import { FxWBTCTwapOracle, MockTwapOracle } from "@/types/index";

const FOKR_HEIGHT = 19203007;

describe("FxWBTCTwapOracle.spec", async () => {
  let deployer: HardhatEthersSigner;

  let oracle: FxWBTCTwapOracle;

  beforeEach(async () => {
    request_fork(FOKR_HEIGHT, [ZeroAddress]);
    deployer = await ethers.getSigner(ZeroAddress);

    const FxChainlinkTwapOracle = await ethers.getContractFactory("FxChainlinkTwapOracle", deployer);
    const BTCUSDOracle = await FxChainlinkTwapOracle.deploy(
      30 * 60,
      "0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c",
      1,
      3600,
      "BTC/USD"
    );
    const WBTCBTCOracle = await FxChainlinkTwapOracle.deploy(
      30 * 60,
      "0xfdFD9C85aD200c506Cf9e21F1FD8dd01932FBB23",
      1,
      86400,
      "WBTC/BTC"
    );

    const FxWBTCTwapOracle = await ethers.getContractFactory("FxWBTCTwapOracle", deployer);
    oracle = await FxWBTCTwapOracle.deploy(
      "0x9db9e0e53058c89e5b94e29621a205198648425b",
      BTCUSDOracle.getAddress(),
      WBTCBTCOracle.getAddress()
    );
  });

  it("should succeed when normal", async () => {
    const r = await oracle.getPrice();
    expect(r._isValid).to.eq(true);
    expect(r._safePrice).to.eq(r._minUnsafePrice);
    expect(r._safePrice).to.eq(r._maxUnsafePrice);
  });

  context("WBTC/BTC price invalid", async () => {
    let btcUSDTwap: MockTwapOracle;
    let wbtcBTCTwap: MockTwapOracle;

    beforeEach(async () => {
      const MockTwapOracle = await ethers.getContractFactory("MockTwapOracle", deployer);
      btcUSDTwap = await MockTwapOracle.deploy();
      wbtcBTCTwap = await MockTwapOracle.deploy();

      const FxWBTCTwapOracle = await ethers.getContractFactory("FxWBTCTwapOracle", deployer);
      oracle = await FxWBTCTwapOracle.deploy(
        "0x9db9e0e53058c89e5b94e29621a205198648425b",
        wbtcBTCTwap.getAddress(),
        wbtcBTCTwap.getAddress()
      );
      await btcUSDTwap.setPrice(await oracle.getUniV3TwapUSDPrice());
    });

    it("should succeed return invalid when WBTC/BTC too large", async () => {
      await wbtcBTCTwap.setPrice(ethers.parseEther("1.2"));
      const r = await oracle.getPrice();
      expect(r._isValid).to.eq(false);
    });

    it("should succeed return invalid when WBTC/BTC too small", async () => {
      await wbtcBTCTwap.setPrice(ethers.parseEther("0.8"));
      const r = await oracle.getPrice();
      expect(r._isValid).to.eq(false);
    });
  });

  context("BTC/USD price invalid", async () => {
    let btcUSDTwap: MockTwapOracle;
    let wbtcBTCTwap: MockTwapOracle;

    beforeEach(async () => {
      const MockTwapOracle = await ethers.getContractFactory("MockTwapOracle", deployer);
      btcUSDTwap = await MockTwapOracle.deploy();
      wbtcBTCTwap = await MockTwapOracle.deploy();

      const FxWBTCTwapOracle = await ethers.getContractFactory("FxWBTCTwapOracle", deployer);
      oracle = await FxWBTCTwapOracle.deploy(
        "0x9db9e0e53058c89e5b94e29621a205198648425b",
        wbtcBTCTwap.getAddress(),
        wbtcBTCTwap.getAddress()
      );
      await wbtcBTCTwap.setPrice(ethers.parseEther("1.0"));
    });

    it("should succeed return invalid when WBTC/BTC too large", async () => {
      await btcUSDTwap.setPrice(((await oracle.getUniV3TwapUSDPrice()) * 12n) / 10n);
      const r = await oracle.getPrice();
      expect(r._isValid).to.eq(false);
    });

    it("should succeed return invalid when WBTC/BTC too small", async () => {
      await btcUSDTwap.setPrice(((await oracle.getUniV3TwapUSDPrice()) * 8n) / 10n);
      const r = await oracle.getPrice();
      expect(r._isValid).to.eq(false);
    });
  });
});
