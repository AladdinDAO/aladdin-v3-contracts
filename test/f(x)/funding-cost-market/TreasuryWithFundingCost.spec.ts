import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ZeroAddress, ZeroHash, id } from "ethers";
import { ethers } from "hardhat";

import {
  FractionalTokenV2,
  MockTwapOracle,
  MockERC20,
  LeveragedTokenV2,
  RebalancePoolSplitter,
  TreasuryWithFundingCost,
} from "@/types/index";

const PRECISION = ethers.parseEther("1");

describe("TreasuryWithFundingCost.spec", async () => {
  let deployer: HardhatEthersSigner;
  let platform: HardhatEthersSigner;
  let market: HardhatEthersSigner;
  let signer: HardhatEthersSigner;
  let admin: HardhatEthersSigner;

  let baseToken: MockERC20;
  let treasury: TreasuryWithFundingCost;
  let oracle: MockTwapOracle;
  let splitter: RebalancePoolSplitter;
  let fToken: FractionalTokenV2;
  let xToken: LeveragedTokenV2;

  beforeEach(async () => {
    [deployer, signer, market, admin, platform] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20", deployer);
    baseToken = await MockERC20.deploy("x", "x", 18);

    const MockTwapOracle = await ethers.getContractFactory("MockTwapOracle", deployer);
    oracle = await MockTwapOracle.deploy();
    await oracle.setIsValid(true);

    const RebalancePoolSplitter = await ethers.getContractFactory("RebalancePoolSplitter", deployer);
    splitter = await RebalancePoolSplitter.deploy();

    const EmptyContract = await ethers.getContractFactory("EmptyContract", deployer);
    const placeholder = await EmptyContract.deploy();
    const TransparentUpgradeableProxy = await ethers.getContractFactory("TransparentUpgradeableProxy", deployer);
    const treasuryProxy = await TransparentUpgradeableProxy.deploy(placeholder.getAddress(), admin.address, "0x");
    treasury = await ethers.getContractAt("TreasuryWithFundingCost", await treasuryProxy.getAddress(), deployer);
    const fTokenProxy = await TransparentUpgradeableProxy.deploy(placeholder.getAddress(), admin.address, "0x");
    fToken = await ethers.getContractAt("FractionalTokenV2", await fTokenProxy.getAddress(), deployer);
    const xTokenProxy = await TransparentUpgradeableProxy.deploy(placeholder.getAddress(), admin.address, "0x");
    xToken = await ethers.getContractAt("LeveragedTokenV2", await xTokenProxy.getAddress(), deployer);

    const TreasuryWithFundingCost = await ethers.getContractFactory("TreasuryWithFundingCost", deployer);
    const treasuryImpl = await TreasuryWithFundingCost.deploy(
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
      platform.address,
      splitter.getAddress(),
      oracle.getAddress(),
      ethers.parseEther("10000"),
      60,
      oracle.getAddress()
    );
    oracle.set_rate_mul(ethers.parseEther("1.1"));
  });

  context("constructor", async () => {
    it("should initialize correctly", async () => {
      // from TreasuryV2
      expect(await treasury.baseToken()).to.eq(await baseToken.getAddress());
      expect(await treasury.fToken()).to.eq(await fToken.getAddress());
      expect(await treasury.xToken()).to.eq(await xToken.getAddress());
      expect(await treasury.priceOracle()).to.eq(await oracle.getAddress());
      expect(await treasury.referenceBaseTokenPrice()).to.eq(0n);
      expect(await treasury.totalBaseToken()).to.eq(0n);
      expect(await treasury.baseTokenCap()).to.eq(ethers.parseEther("10000"));
      expect(await treasury.strategy()).to.eq(ZeroAddress);
      expect(await treasury.strategyUnderlying()).to.eq(0n);
      expect((await treasury.emaLeverageRatio()).sampleInterval).to.eq(60);
      expect(await treasury.platform()).to.eq(platform.address);
      expect(await treasury.rebalancePoolSplitter()).to.eq(await splitter.getAddress());

      // from CrvUSDBorrowRateAdapter
      expect(await treasury.amm()).to.eq(await oracle.getAddress());

      await expect(
        treasury.initialize(
          platform.address,
          splitter.getAddress(),
          oracle.getAddress(),
          ethers.parseEther("10000"),
          60,
          oracle.getAddress()
        )
      ).to.revertedWith("Initializable: contract is already initialized");
    });
  });

  context("auth", async () => {
    context("#initializeProtocol", async () => {
      it("should revert when caller is not whitelised", async () => {
        expect(treasury.connect(signer).initializeProtocol(0n)).to.revertedWith(
          "AccessControl: account " +
            signer.address.toLowerCase() +
            " is missing role " +
            id("PROTOCOL_INITIALIZER_ROLE")
        );
      });

      it("should revert when initialize twice", async () => {
        await oracle.setPrice(ethers.parseEther("2000"));
        await baseToken.mint(treasury.getAddress(), ethers.parseEther("1"));
        await treasury.grantRole(id("PROTOCOL_INITIALIZER_ROLE"), signer.address);
        await treasury.connect(signer).initializeProtocol(ethers.parseEther("1"));
        await expect(treasury.connect(signer).initializeProtocol(ethers.parseEther("1"))).to.revertedWithCustomError(
          treasury,
          "ErrorProtocolInitialized"
        );
      });

      it("should revert when balance not enough", async () => {
        await oracle.setPrice(ethers.parseEther("2000"));
        await baseToken.mint(treasury.getAddress(), ethers.parseEther("1"));
        await treasury.grantRole(id("PROTOCOL_INITIALIZER_ROLE"), signer.address);
        await expect(
          treasury.connect(signer).initializeProtocol(ethers.parseEther("1") + 1n)
        ).to.revertedWithCustomError(treasury, "ErrorInsufficientInitialBaseToken");
      });

      it("should succeed", async () => {
        await oracle.setPrice(ethers.parseEther("2000"));
        await baseToken.mint(treasury.getAddress(), ethers.parseEther("1"));
        await treasury.grantRole(id("PROTOCOL_INITIALIZER_ROLE"), signer.address);
        await expect(treasury.connect(signer).initializeProtocol(ethers.parseEther("1")))
          .to.emit(treasury, "Settle")
          .withArgs(0n, ethers.parseEther("2000"));
        expect(await treasury.referenceBaseTokenPrice()).to.eq(ethers.parseEther("2000"));
        expect(await treasury.collateralRatio()).to.eq(PRECISION * 2n);
        expect((await treasury.emaLeverageRatio()).lastValue).to.eq(PRECISION * 2n);
        expect((await treasury.emaLeverageRatio()).lastEmaValue).to.eq(PRECISION * 2n);
        expect(await fToken.balanceOf(signer.address)).to.eq(ethers.parseEther("1000"));
        expect(await xToken.balanceOf(signer.address)).to.eq(ethers.parseEther("1000"));
        expect((await treasury.borrowRateSnapshot()).borrowIndex).to.eq(ethers.parseEther("1.1"));
        expect((await treasury.borrowRateSnapshot()).timestamp).to.eq(
          (await ethers.provider.getBlock("latest"))!.timestamp
        );
        expect(await treasury.getFundingRate()).to.eq(0n);
      });
    });

    context("#updateFundingCostScale", async () => {
      it("should revert when caller is not admin", async () => {
        await expect(treasury.connect(signer).updateFundingCostScale(0n)).to.revertedWith(
          "AccessControl: account " + signer.address.toLowerCase() + " is missing role " + ZeroHash
        );
      });

      it("should succeed", async () => {
        expect(await treasury.fundingCostScale()).to.eq(ethers.parseEther("0.5"));
        await expect(treasury.updateFundingCostScale(ethers.parseEther("1000")))
          .to.emit(treasury, "UpdateFundingCostScale")
          .withArgs(ethers.parseEther("0.5"), ethers.parseEther("1000"));
        expect(await treasury.fundingCostScale()).to.eq(ethers.parseEther("1000"));
      });
    });
  });

  context("#getFundingRate", async () => {
    beforeEach(async () => {
      await oracle.setPrice(ethers.parseEther("2000"));
      await baseToken.mint(treasury.getAddress(), ethers.parseEther("1"));
      await treasury.grantRole(id("PROTOCOL_INITIALIZER_ROLE"), signer.address);
      await treasury.grantRole(id("FX_MARKET_ROLE"), market.address);
      await treasury.connect(signer).initializeProtocol(ethers.parseEther("1"));
    });

    it("should succeed", async () => {
      expect(await treasury.getFundingRate()).to.eq(0n);
      await oracle.set_rate_mul((ethers.parseEther("1.1") * 12n) / 10n);
      expect(await treasury.getFundingRate()).to.eq(ethers.parseEther("0.2") / 2n);
    });
  });

  context("harvest", async () => {
    beforeEach(async () => {
      await oracle.setPrice(ethers.parseEther("2000"));
      await baseToken.mint(treasury.getAddress(), ethers.parseEther("1"));
      await treasury.grantRole(id("PROTOCOL_INITIALIZER_ROLE"), signer.address);
      await treasury.grantRole(id("FX_MARKET_ROLE"), market.address);
    });

    context("rate = 1.0", async () => {
      beforeEach(async () => {
        await treasury.connect(signer).initializeProtocol(ethers.parseEther("1"));
        expect(await fToken.balanceOf(signer.address)).to.eq(ethers.parseEther("1000"));
        expect(await xToken.balanceOf(signer.address)).to.eq(ethers.parseEther("1000"));
        expect(await treasury.totalBaseToken()).to.eq(ethers.parseEther("1"));
        expect(await treasury.harvestable()).to.eq(0n);
      });

      it("should do nothing when borrow index doesn't change", async () => {
        await treasury.harvest();
        expect(await baseToken.balanceOf(treasury.getAddress())).to.eq(ethers.parseEther("1"));
        expect(await treasury.totalBaseToken()).to.eq(ethers.parseEther("1"));
        expect(await treasury.harvestable()).to.eq(0n);
      });

      it("should succeed, when borrow index up", async () => {
        await oracle.set_rate_mul((ethers.parseEther("1.1") * 12n) / 10n);
        await treasury.updateHarvesterRatio(1e8); // 10%
        await treasury.updateRebalancePoolRatio(5e8); // 50%
        await splitter.setSplitter(baseToken.getAddress(), treasury.getAddress());
        // lead to 1.999000999000998999 leverage ratio
        await oracle.setPrice(ethers.parseEther("2001"));
        // lead to 20% funding rate
        await oracle.set_rate_mul((ethers.parseEther("1.1") * 14n) / 10n);
        expect(await treasury.getFundingRate()).to.eq(ethers.parseEther("0.2"));
        expect(await treasury.harvestable()).to.eq(ethers.parseEther("0.099950024987506246"));
        await expect(treasury.connect(signer).harvest())
          .to.emit(treasury, "Harvest")
          .withArgs(
            signer.address,
            ethers.parseEther("0.099950024987506246"),
            ethers.parseEther("0.049975012493753123"),
            ethers.parseEther("0.009995002498750624")
          );
        expect(await baseToken.balanceOf(treasury.getAddress())).to.eq(ethers.parseEther("0.900049975012493754"));
        expect(await treasury.totalBaseToken()).to.eq(ethers.parseEther("0.900049975012493754"));
        expect(await treasury.harvestable()).to.eq(0n);
        expect(await baseToken.balanceOf(signer.address)).to.eq(ethers.parseEther("0.009995002498750624"));
        expect(await baseToken.balanceOf(platform.address)).to.eq(ethers.parseEther("0.039980009995002499"));
        expect(await baseToken.balanceOf(splitter.getAddress())).to.eq(ethers.parseEther("0.049975012493753123"));
      });
    });
  });
});
