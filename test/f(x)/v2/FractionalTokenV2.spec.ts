import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ZeroAddress, id } from "ethers";
import { ethers } from "hardhat";

import {
  FractionalTokenV2,
  MockTwapOracle,
  MockFxRateProvider,
  WrappedTokenTreasuryV2,
  MockERC20,
} from "@/types/index";

const PRECISION = 10n ** 18n;

describe("FractionalTokenV2.spec", async () => {
  let deployer: HardhatEthersSigner;
  let signer: HardhatEthersSigner;
  let admin: HardhatEthersSigner;

  let baseToken: MockERC20;
  let treasury: WrappedTokenTreasuryV2;
  let rateProvider: MockFxRateProvider;
  let oracle: MockTwapOracle;
  let fToken: FractionalTokenV2;

  beforeEach(async () => {
    [deployer, signer, admin] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20", deployer);
    baseToken = await MockERC20.deploy("x", "x", 18);

    const MockFxRateProvider = await ethers.getContractFactory("MockFxRateProvider", deployer);
    rateProvider = await MockFxRateProvider.deploy();
    await rateProvider.setRate(ethers.parseEther("1"));

    const MockTwapOracle = await ethers.getContractFactory("MockTwapOracle", deployer);
    oracle = await MockTwapOracle.deploy();

    const EmptyContract = await ethers.getContractFactory("EmptyContract", deployer);
    const placeholder = await EmptyContract.deploy();
    const TransparentUpgradeableProxy = await ethers.getContractFactory("TransparentUpgradeableProxy", deployer);
    const treasuryProxy = await TransparentUpgradeableProxy.deploy(placeholder.getAddress(), admin.address, "0x");
    treasury = await ethers.getContractAt("WrappedTokenTreasuryV2", await treasuryProxy.getAddress(), deployer);
    const fTokenProxy = await TransparentUpgradeableProxy.deploy(placeholder.getAddress(), admin.address, "0x");
    fToken = await ethers.getContractAt("FractionalTokenV2", await fTokenProxy.getAddress(), deployer);
    const xTokenProxy = await TransparentUpgradeableProxy.deploy(placeholder.getAddress(), admin.address, "0x");
    const xToken = await ethers.getContractAt("LeveragedTokenV2", await xTokenProxy.getAddress(), deployer);

    const WrappedTokenTreasuryV2 = await ethers.getContractFactory("WrappedTokenTreasuryV2", deployer);
    const treasuryImpl = await WrappedTokenTreasuryV2.deploy(
      baseToken.getAddress(),
      fToken.getAddress(),
      xToken.getAddress()
    );
    await treasuryProxy.connect(admin).upgradeTo(treasuryImpl.getAddress());

    const FractionalTokenV2 = await ethers.getContractFactory("FractionalTokenV2", deployer);
    const fTokenImpl = await FractionalTokenV2.deploy(treasury.getAddress());
    await fTokenProxy.connect(admin).upgradeTo(fTokenImpl.getAddress());

    const LeveragedTokenV2 = await ethers.getContractFactory("LeveragedTokenV2", deployer);
    const xTokenImpl = await LeveragedTokenV2.deploy(treasury.getAddress(), fToken.getAddress());
    await xTokenProxy.connect(admin).upgradeTo(xTokenImpl.getAddress());

    await fToken.initialize("Fractional ETH", "fETH");
    await xToken.initialize("Leveraged ETH", "xETH");
    await treasury.initialize(
      deployer.address,
      deployer.address,
      rateProvider.getAddress(),
      oracle.getAddress(),
      ethers.parseEther("10000"),
      60
    );

    await oracle.setPrice(ethers.parseEther("2000"));
    await baseToken.mint(treasury.getAddress(), ethers.parseEther("1"));
    await treasury.grantRole(id("PROTOCOL_INITIALIZER_ROLE"), deployer.address);
    await treasury.initializeProtocol(ethers.parseEther("1"));
  });

  context("auth", async () => {
    it("should revert, when intialize again", async () => {
      await expect(fToken.initialize("", "")).to.revertedWith("Initializable: contract is already initialized");
    });

    it("should initialize correctly", async () => {
      expect(await fToken.treasury()).to.eq(await treasury.getAddress());
      expect(await fToken.name()).to.eq("Fractional ETH");
      expect(await fToken.symbol()).to.eq("fETH");
      expect(await fToken.nav()).to.eq(PRECISION);
    });
  });

  context("#nav", async () => {
    it("should 1.0 when collateral ratio > 1", async () => {
      expect(await treasury.collateralRatio()).to.gt(PRECISION);
      expect(await fToken.nav()).to.eq(PRECISION);
    });

    it("should = 1.0 when collateral ratio = 1", async () => {
      await oracle.setPrice(ethers.parseEther("1000"));
      expect(await treasury.collateralRatio()).to.eq(PRECISION);
      expect(await fToken.nav()).to.eq(PRECISION);
    });

    it("should < 1.0 when collateral ratio < 1", async () => {
      await oracle.setPrice(ethers.parseEther("500"));
      expect(await treasury.collateralRatio()).to.lt(PRECISION);
      expect(await fToken.nav()).to.eq(ethers.parseEther("0.5"));
    });
  });

  context("#mint", async () => {
    it("should revert, when non-treasury call", async () => {
      await expect(fToken.mint(ZeroAddress, 0n)).to.revertedWithCustomError(fToken, "ErrorCallerIsNotTreasury");
    });

    it("should succeed", async () => {
      await treasury.grantRole(id("FX_MARKET_ROLE"), deployer.address);
      expect(await fToken.balanceOf(signer.address)).to.eq(0n);
      await treasury.mintFToken(ethers.parseEther("1.0"), signer.address);
      expect(await fToken.balanceOf(signer.address)).to.eq(ethers.parseEther("2000"));
    });
  });

  context("#burn", async () => {
    it("should revert, when non-treasury call", async () => {
      await expect(fToken.burn(ZeroAddress, 0n)).to.revertedWithCustomError(fToken, "ErrorCallerIsNotTreasury");
    });

    it("should succeed", async () => {
      await treasury.grantRole(id("FX_MARKET_ROLE"), signer.address);
      expect(await fToken.balanceOf(deployer.address)).to.eq(ethers.parseEther("1000"));
      expect(await baseToken.balanceOf(signer.address)).to.eq(0n);
      expect(await treasury.connect(signer).redeem(ethers.parseEther("1"), 0n, deployer.address));
      expect(await baseToken.balanceOf(signer.address)).to.eq(ethers.parseEther("0.0005"));
      expect(await fToken.balanceOf(deployer.address)).to.eq(ethers.parseEther("999"));
    });
  });
});
