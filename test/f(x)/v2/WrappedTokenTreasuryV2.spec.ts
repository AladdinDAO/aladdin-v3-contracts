import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ZeroAddress, ZeroHash, id } from "ethers";
import { ethers } from "hardhat";

import {
  FractionalTokenV2,
  MockTwapOracle,
  MockFxRateProvider,
  WrappedTokenTreasuryV2,
  MockERC20,
  LeveragedTokenV2,
  RebalancePoolSplitter,
} from "@/types/index";

const PRECISION = ethers.parseEther("1");

describe("WrappedTokenTreasuryV2.spec", async () => {
  let deployer: HardhatEthersSigner;
  let platform: HardhatEthersSigner;
  let market: HardhatEthersSigner;
  let signer: HardhatEthersSigner;
  let admin: HardhatEthersSigner;

  let baseToken: MockERC20;
  let treasury: WrappedTokenTreasuryV2;
  let rateProvider: MockFxRateProvider;
  let oracle: MockTwapOracle;
  let splitter: RebalancePoolSplitter;
  let fToken: FractionalTokenV2;
  let xToken: LeveragedTokenV2;

  beforeEach(async () => {
    [deployer, signer, market, admin, platform] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20", deployer);
    baseToken = await MockERC20.deploy("x", "x", 18);

    const MockFxRateProvider = await ethers.getContractFactory("MockFxRateProvider", deployer);
    rateProvider = await MockFxRateProvider.deploy();
    await rateProvider.setRate(ethers.parseEther("1"));

    const MockTwapOracle = await ethers.getContractFactory("MockTwapOracle", deployer);
    oracle = await MockTwapOracle.deploy();
    await oracle.setIsValid(true);

    const RebalancePoolSplitter = await ethers.getContractFactory("RebalancePoolSplitter", deployer);
    splitter = await RebalancePoolSplitter.deploy();

    const EmptyContract = await ethers.getContractFactory("EmptyContract", deployer);
    const placeholder = await EmptyContract.deploy();
    const TransparentUpgradeableProxy = await ethers.getContractFactory("TransparentUpgradeableProxy", deployer);
    const treasuryProxy = await TransparentUpgradeableProxy.deploy(placeholder.getAddress(), admin.address, "0x");
    treasury = await ethers.getContractAt("WrappedTokenTreasuryV2", await treasuryProxy.getAddress(), deployer);
    const fTokenProxy = await TransparentUpgradeableProxy.deploy(placeholder.getAddress(), admin.address, "0x");
    fToken = await ethers.getContractAt("FractionalTokenV2", await fTokenProxy.getAddress(), deployer);
    const xTokenProxy = await TransparentUpgradeableProxy.deploy(placeholder.getAddress(), admin.address, "0x");
    xToken = await ethers.getContractAt("LeveragedTokenV2", await xTokenProxy.getAddress(), deployer);

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
      platform.address,
      splitter.getAddress(),
      rateProvider.getAddress(),
      oracle.getAddress(),
      ethers.parseEther("10000"),
      60
    );
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

      // from WrappedTokenTreasuryV2
      expect(await treasury.rateProvider()).to.eq(await rateProvider.getAddress());

      await expect(
        treasury.initialize(
          platform.address,
          splitter.getAddress(),
          rateProvider.getAddress(),
          oracle.getAddress(),
          ethers.parseEther("10000"),
          60
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
        await rateProvider.setRate(ethers.parseEther("1.0"));
        await baseToken.mint(treasury.getAddress(), ethers.parseEther("1"));
        await treasury.grantRole(id("PROTOCOL_INITIALIZER_ROLE"), signer.address);
        await expect(
          treasury.connect(signer).initializeProtocol(ethers.parseEther("1") + 1n)
        ).to.revertedWithCustomError(treasury, "ErrorInsufficientInitialBaseToken");
      });

      it("should succeed", async () => {
        await oracle.setPrice(ethers.parseEther("2000"));
        await rateProvider.setRate(ethers.parseEther("1.0"));
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
      });
    });

    context("#updateStrategy", async () => {
      it("should revert when caller is not admin", async () => {
        await expect(treasury.connect(signer).updateStrategy(ZeroAddress)).to.revertedWith(
          "AccessControl: account " + signer.address.toLowerCase() + " is missing role " + ZeroHash
        );
      });

      it("should succeed", async () => {
        expect(await treasury.strategy()).to.eq(ZeroAddress);
        await expect(treasury.updateStrategy(deployer.address))
          .to.emit(treasury, "UpdateStrategy")
          .withArgs(ZeroAddress, deployer.address);
        expect(await treasury.strategy()).to.eq(deployer.address);
      });
    });

    context("#updatePriceOracle", async () => {
      it("should revert when caller is not admin", async () => {
        await expect(treasury.connect(signer).updatePriceOracle(ZeroAddress)).to.revertedWith(
          "AccessControl: account " + signer.address.toLowerCase() + " is missing role " + ZeroHash
        );
      });

      it("should revert when address is zero", async () => {
        await expect(treasury.updatePriceOracle(ZeroAddress)).to.revertedWithCustomError(treasury, "ErrorZeroAddress");
      });

      it("should succeed", async () => {
        expect(await treasury.priceOracle()).to.eq(await oracle.getAddress());
        await expect(treasury.updatePriceOracle(deployer.address))
          .to.emit(treasury, "UpdatePriceOracle")
          .withArgs(await oracle.getAddress(), deployer.address);
        expect(await treasury.priceOracle()).to.eq(deployer.address);
      });
    });

    context("#updateBaseTokenCap", async () => {
      it("should revert when caller is not admin", async () => {
        await expect(treasury.connect(signer).updateBaseTokenCap(0n)).to.revertedWith(
          "AccessControl: account " + signer.address.toLowerCase() + " is missing role " + ZeroHash
        );
      });

      it("should succeed", async () => {
        expect(await treasury.baseTokenCap()).to.eq(ethers.parseEther("10000"));
        await expect(treasury.updateBaseTokenCap(ethers.parseEther("1000")))
          .to.emit(treasury, "UpdateBaseTokenCap")
          .withArgs(ethers.parseEther("10000"), ethers.parseEther("1000"));
        expect(await treasury.baseTokenCap()).to.eq(ethers.parseEther("1000"));
      });
    });

    context("#updateEMASampleInterval", async () => {
      it("should revert when caller is not admin", async () => {
        await expect(treasury.connect(signer).updateEMASampleInterval(0n)).to.revertedWith(
          "AccessControl: account " + signer.address.toLowerCase() + " is missing role " + ZeroHash
        );
      });

      it("should revert when too small", async () => {
        await oracle.setPrice(ethers.parseEther("2000"));
        await baseToken.mint(treasury.getAddress(), ethers.parseEther("1"));
        await treasury.grantRole(id("PROTOCOL_INITIALIZER_ROLE"), signer.address);
        await expect(treasury.connect(signer).initializeProtocol(ethers.parseEther("1")))
          .to.emit(treasury, "Settle")
          .withArgs(0n, ethers.parseEther("2000"));
        await expect(treasury.updateEMASampleInterval(59)).to.revertedWithCustomError(
          treasury,
          "ErrorEMASampleIntervalTooSmall"
        );
      });

      it("should succeed", async () => {
        await oracle.setPrice(ethers.parseEther("2000"));
        await rateProvider.setRate(ethers.parseEther("1.0"));
        await baseToken.mint(treasury.getAddress(), ethers.parseEther("1"));
        await treasury.grantRole(id("PROTOCOL_INITIALIZER_ROLE"), signer.address);
        await expect(treasury.connect(signer).initializeProtocol(ethers.parseEther("1")))
          .to.emit(treasury, "Settle")
          .withArgs(0n, ethers.parseEther("2000"));

        expect((await treasury.emaLeverageRatio()).sampleInterval).to.eq(60);
        await expect(treasury.updateEMASampleInterval(70))
          .to.emit(treasury, "UpdateEMASampleInterval")
          .withArgs(60, 70);
        expect((await treasury.emaLeverageRatio()).sampleInterval).to.eq(70);
      });
    });

    context("#updatePlatform", async () => {
      it("should revert when caller is not admin", async () => {
        await expect(treasury.connect(signer).updatePlatform(ZeroAddress)).to.revertedWith(
          "AccessControl: account " + signer.address.toLowerCase() + " is missing role " + ZeroHash
        );
      });

      it("should revert when address is zero", async () => {
        await expect(treasury.updatePlatform(ZeroAddress)).to.revertedWithCustomError(treasury, "ErrorZeroAddress");
      });

      it("should succeed", async () => {
        expect(await treasury.platform()).to.eq(platform.address);
        await expect(treasury.updatePlatform(deployer.address))
          .to.emit(treasury, "UpdatePlatform")
          .withArgs(platform.address, deployer.address);
        expect(await treasury.platform()).to.eq(deployer.address);
      });
    });

    context("#updateRebalancePoolSplitter", async () => {
      it("should revert when caller is not admin", async () => {
        await expect(treasury.connect(signer).updateRebalancePoolSplitter(ZeroAddress)).to.revertedWith(
          "AccessControl: account " + signer.address.toLowerCase() + " is missing role " + ZeroHash
        );
      });

      it("should revert when address is zero", async () => {
        await expect(treasury.updateRebalancePoolSplitter(ZeroAddress)).to.revertedWithCustomError(
          treasury,
          "ErrorZeroAddress"
        );
      });

      it("should succeed", async () => {
        expect(await treasury.rebalancePoolSplitter()).to.eq(await splitter.getAddress());
        await expect(treasury.updateRebalancePoolSplitter(deployer.address))
          .to.emit(treasury, "UpdateRebalancePoolSplitter")
          .withArgs(await splitter.getAddress(), deployer.address);
        expect(await treasury.rebalancePoolSplitter()).to.eq(deployer.address);
      });
    });

    context("#updateRebalancePoolRatio", async () => {
      it("should revert when caller is not admin", async () => {
        await expect(treasury.connect(signer).updateRebalancePoolRatio(0n)).to.revertedWith(
          "AccessControl: account " + signer.address.toLowerCase() + " is missing role " + ZeroHash
        );
      });

      it("should revert when too large", async () => {
        await expect(treasury.updateRebalancePoolRatio(1e9 + 1)).to.revertedWithCustomError(
          treasury,
          "ErrorRebalancePoolRatioTooLarge"
        );
      });

      it("should succeed", async () => {
        expect(await treasury.getRebalancePoolRatio()).to.eq(0n);
        expect(await treasury.getHarvesterRatio()).to.eq(0n);
        await expect(treasury.updateRebalancePoolRatio(1e9))
          .to.emit(treasury, "UpdateRebalancePoolRatio")
          .withArgs(0, 1e9);
        expect(await treasury.getRebalancePoolRatio()).to.eq(1e9);
        expect(await treasury.getHarvesterRatio()).to.eq(0n);
        await expect(treasury.updateRebalancePoolRatio(1e8))
          .to.emit(treasury, "UpdateRebalancePoolRatio")
          .withArgs(1e9, 1e8);
        expect(await treasury.getRebalancePoolRatio()).to.eq(1e8);
        expect(await treasury.getHarvesterRatio()).to.eq(0n);
      });
    });

    context("#updateHarvesterRatio", async () => {
      it("should revert when caller is not admin", async () => {
        await expect(treasury.connect(signer).updateHarvesterRatio(0n)).to.revertedWith(
          "AccessControl: account " + signer.address.toLowerCase() + " is missing role " + ZeroHash
        );
      });

      it("should revert when too large", async () => {
        await expect(treasury.updateHarvesterRatio(1e8 + 1)).to.revertedWithCustomError(
          treasury,
          "ErrorHarvesterRatioTooLarge"
        );
      });

      it("should succeed", async () => {
        expect(await treasury.getRebalancePoolRatio()).to.eq(0n);
        expect(await treasury.getHarvesterRatio()).to.eq(0n);
        await expect(treasury.updateHarvesterRatio(1e8)).to.emit(treasury, "UpdateHarvesterRatio").withArgs(0, 1e8);
        expect(await treasury.getRebalancePoolRatio()).to.eq(0n);
        expect(await treasury.getHarvesterRatio()).to.eq(1e8);
        await expect(treasury.updateHarvesterRatio(1e7)).to.emit(treasury, "UpdateHarvesterRatio").withArgs(1e8, 1e7);
        expect(await treasury.getRebalancePoolRatio()).to.eq(0n);
        expect(await treasury.getHarvesterRatio()).to.eq(1e7);
      });
    });

    context("#updateRateProvider", async () => {
      it("should revert when caller is not admin", async () => {
        await expect(treasury.connect(signer).updateRateProvider(ZeroAddress)).to.revertedWith(
          "AccessControl: account " + signer.address.toLowerCase() + " is missing role " + ZeroHash
        );
      });

      it("should revert when address is zero", async () => {
        await expect(treasury.updateRateProvider(ZeroAddress)).to.revertedWithCustomError(treasury, "ErrorZeroAddress");
      });

      it("should succeed", async () => {
        expect(await treasury.rateProvider()).to.eq(await rateProvider.getAddress());
        await expect(treasury.updateRateProvider(deployer.address))
          .to.emit(treasury, "UpdateRateProvider")
          .withArgs(await rateProvider.getAddress(), deployer.address);
        expect(await treasury.rateProvider()).to.eq(deployer.address);
      });
    });
  });

  context("mint and redeem", async () => {
    beforeEach(async () => {
      await oracle.setPrice(ethers.parseEther("2000"));
      await baseToken.mint(treasury.getAddress(), ethers.parseEther("1"));
      await treasury.grantRole(id("PROTOCOL_INITIALIZER_ROLE"), signer.address);
      await treasury.grantRole(id("FX_MARKET_ROLE"), market.address);
    });

    context("rate = 1.0", async () => {
      beforeEach(async () => {
        await rateProvider.setRate(ethers.parseEther("1.0"));
        await treasury.connect(signer).initializeProtocol(ethers.parseEther("1"));
        expect(await fToken.balanceOf(signer.address)).to.eq(ethers.parseEther("1000"));
        expect(await xToken.balanceOf(signer.address)).to.eq(ethers.parseEther("1000"));
        expect(await treasury.totalBaseToken()).to.eq(ethers.parseEther("1"));
      });

      context("#mintFToken", async () => {
        it("should revert, when caller is not market", async () => {
          await expect(treasury.connect(signer).mintFToken(0n, ZeroAddress)).to.revertedWith(
            "AccessControl: account " + signer.address.toLowerCase() + " is missing role " + id("FX_MARKET_ROLE")
          );
        });

        it("should revert when under collateral", async () => {
          await oracle.setPrice(ethers.parseEther("1000"));
          await expect(treasury.connect(market).mintFToken(1n, deployer.address)).to.revertedWithCustomError(
            treasury,
            "ErrorUnderCollateral"
          );
          await oracle.setPrice(ethers.parseEther("1000") - 1n);
          await expect(treasury.connect(market).mintFToken(1n, deployer.address)).to.revertedWithCustomError(
            treasury,
            "ErrorUnderCollateral"
          );
        });

        it("should revert when exceed cap", async () => {
          await expect(
            treasury.connect(market).mintFToken(ethers.parseEther("9999") + 1n, deployer.address)
          ).to.revertedWithCustomError(treasury, "ErrorExceedTotalCap");
        });

        it("should succeed when price not change", async () => {
          const expected = await treasury
            .connect(market)
            .mintFToken.staticCall(ethers.parseEther("1"), deployer.address);
          expect(expected).to.eq(ethers.parseEther("2000"));
          await treasury.connect(market).mintFToken(ethers.parseEther("1"), deployer.address);
          expect(await treasury.totalBaseToken()).to.eq(ethers.parseEther("2"));
          expect(await fToken.balanceOf(deployer.address)).to.eq(expected);
        });

        it("should succeed when price down", async () => {
          await oracle.setPrice(ethers.parseEther("1001"));
          const expected = await treasury
            .connect(market)
            .mintFToken.staticCall(ethers.parseEther("1"), deployer.address);
          expect(expected).to.eq(ethers.parseEther("1001"));
          await treasury.connect(market).mintFToken(ethers.parseEther("1"), deployer.address);
          expect(await treasury.totalBaseToken()).to.eq(ethers.parseEther("2"));
          expect(await fToken.balanceOf(deployer.address)).to.eq(expected);
        });

        it("should succeed when price up", async () => {
          await oracle.setPrice(ethers.parseEther("2001"));
          const expected = await treasury
            .connect(market)
            .mintFToken.staticCall(ethers.parseEther("1"), deployer.address);
          expect(expected).to.eq(ethers.parseEther("2001"));
          await treasury.connect(market).mintFToken(ethers.parseEther("1"), deployer.address);
          expect(await treasury.totalBaseToken()).to.eq(ethers.parseEther("2"));
          expect(await fToken.balanceOf(deployer.address)).to.eq(expected);
        });

        it("should compute #maxMintableFToken correctly", async () => {
          // 10% change
          await oracle.setPrice(ethers.parseEther("2200"));
          expect(await treasury.currentBaseTokenPrice()).to.eq(ethers.parseEther("2200"));
          expect(await fToken.nav()).to.eq(PRECISION);
          expect(await xToken.nav()).to.eq(ethers.parseEther("1.2"));
          expect(await treasury.collateralRatio()).to.eq(ethers.parseEther("2.2"));

          // make collateral ratio to 300%
          let [maxBaseIn, maxFTokenMintable] = await treasury.maxMintableFToken(ethers.parseEther("3"));
          expect(maxBaseIn).to.eq(0n);

          // make collateral ratio to 150%
          [maxBaseIn, maxFTokenMintable] = await treasury.maxMintableFToken(ethers.parseEther("1.5"));
          expect(maxBaseIn).to.eq(ethers.parseEther(".636363636363636363"));
          await treasury.connect(market).mintFToken(maxBaseIn, deployer.address);
          expect(await fToken.balanceOf(deployer.address)).to.closeTo(maxFTokenMintable, 10000);
          expect(await treasury.collateralRatio()).to.eq(ethers.parseEther("1.5"));
        });
      });

      context("#mintXToken", async () => {
        it("should revert, when caller is not market", async () => {
          await expect(treasury.connect(signer).mintXToken(0n, ZeroAddress)).to.revertedWith(
            "AccessControl: account " + signer.address.toLowerCase() + " is missing role " + id("FX_MARKET_ROLE")
          );
        });

        it("should revert when under collateral", async () => {
          await oracle.setPrice(ethers.parseEther("1000"));
          await expect(treasury.connect(market).mintXToken(1n, deployer.address)).to.revertedWithCustomError(
            treasury,
            "ErrorUnderCollateral"
          );
          await oracle.setPrice(ethers.parseEther("1000") - 1n);
          await expect(treasury.connect(market).mintXToken(1n, deployer.address)).to.revertedWithCustomError(
            treasury,
            "ErrorUnderCollateral"
          );
        });

        it("should revert when exceed cap", async () => {
          await expect(
            treasury.connect(market).mintXToken(ethers.parseEther("9999") + 1n, deployer.address)
          ).to.revertedWithCustomError(treasury, "ErrorExceedTotalCap");
        });

        it("should succeed when price not change", async () => {
          const expected = await treasury
            .connect(market)
            .mintXToken.staticCall(ethers.parseEther("1"), deployer.address);
          expect(expected).to.eq(ethers.parseEther("2000"));
          await treasury.connect(market).mintXToken(ethers.parseEther("1"), deployer.address);
          expect(await treasury.totalBaseToken()).to.eq(ethers.parseEther("2"));
          expect(await xToken.balanceOf(deployer.address)).to.eq(expected);
        });

        it("should succeed when price down", async () => {
          await oracle.setPrice(ethers.parseEther("1001"));
          const expected = await treasury
            .connect(market)
            .mintXToken.staticCall(ethers.parseEther("1"), deployer.address);
          expect(expected).to.eq(ethers.parseEther("1001000"));
          await treasury.connect(market).mintXToken(ethers.parseEther("1"), deployer.address);
          expect(await treasury.totalBaseToken()).to.eq(ethers.parseEther("2"));
          expect(await xToken.balanceOf(deployer.address)).to.eq(expected);
        });

        it("should succeed when price up", async () => {
          await oracle.setPrice(ethers.parseEther("2001"));
          const expected = await treasury
            .connect(market)
            .mintXToken.staticCall(ethers.parseEther("1"), deployer.address);
          expect(expected).to.eq(ethers.parseEther("1999.000999000999000999"));
          await treasury.connect(market).mintXToken(ethers.parseEther("1"), deployer.address);
          expect(await treasury.totalBaseToken()).to.eq(ethers.parseEther("2"));
          expect(await xToken.balanceOf(deployer.address)).to.eq(expected);
        });

        it("should compute #maxMintableXToken correctly", async () => {
          // 10% change
          await oracle.setPrice(ethers.parseEther("2200"));
          expect(await treasury.currentBaseTokenPrice()).to.eq(ethers.parseEther("2200"));
          expect(await fToken.nav()).to.eq(PRECISION);
          expect(await xToken.nav()).to.eq(ethers.parseEther("1.2"));
          expect(await treasury.collateralRatio()).to.eq(ethers.parseEther("2.2"));

          // make collateral ratio to 150%
          let [maxBaseIn, maxXTokenMintable] = await treasury.maxMintableXToken(ethers.parseEther("1.5"));
          expect(maxBaseIn).to.eq(0n);

          // make collateral ratio to 300%
          [maxBaseIn, maxXTokenMintable] = await treasury.maxMintableXToken(ethers.parseEther("3.0"));
          expect(maxBaseIn).to.eq(ethers.parseEther(".363636363636363636"));

          await treasury.connect(market).mintXToken(maxBaseIn, deployer.address);
          expect(await xToken.balanceOf(deployer.address)).to.closeTo(maxXTokenMintable, 10000);
          expect(await treasury.collateralRatio()).to.closeTo(ethers.parseEther("3"), 100);
        });
      });

      context("#redeem FToken", async () => {
        it("should revert, when caller is not market", async () => {
          await expect(treasury.connect(signer).redeem(1n, 0n, ZeroAddress)).to.revertedWith(
            "AccessControl: account " + signer.address.toLowerCase() + " is missing role " + id("FX_MARKET_ROLE")
          );
        });

        it("should succeed when price not change", async () => {
          const expected = await treasury.connect(market).redeem.staticCall(ethers.parseEther("1"), 0n, signer.address);
          expect(expected).to.eq(ethers.parseEther("0.0005"));
          await treasury.connect(market).redeem(ethers.parseEther("1"), 0n, signer.address);
          expect(await treasury.totalBaseToken()).to.eq(ethers.parseEther("0.9995"));
          expect(await baseToken.balanceOf(market.address)).to.eq(expected);
          expect(await fToken.balanceOf(signer.address)).to.eq(ethers.parseEther("999"));
        });

        it("should succeed when price down", async () => {
          await oracle.setPrice(ethers.parseEther("1001"));
          const expected = await treasury.connect(market).redeem.staticCall(ethers.parseEther("1"), 0n, signer.address);
          expect(expected).to.eq(ethers.parseEther("0.000999000999000999"));
          await treasury.connect(market).redeem(ethers.parseEther("1"), 0n, signer.address);
          expect(await treasury.totalBaseToken()).to.eq(ethers.parseEther("0.999000999000999001"));
          expect(await baseToken.balanceOf(market.address)).to.eq(expected);
          expect(await fToken.balanceOf(signer.address)).to.eq(ethers.parseEther("999"));
        });

        it("should succeed when price up", async () => {
          await oracle.setPrice(ethers.parseEther("2001"));
          const expected = await treasury.connect(market).redeem.staticCall(ethers.parseEther("1"), 0n, signer.address);
          expect(expected).to.eq(ethers.parseEther("0.000499750124937531"));
          await treasury.connect(market).redeem(ethers.parseEther("1"), 0n, signer.address);
          expect(await treasury.totalBaseToken()).to.eq(ethers.parseEther("0.999500249875062469"));
          expect(await baseToken.balanceOf(market.address)).to.eq(expected);
          expect(await fToken.balanceOf(signer.address)).to.eq(ethers.parseEther("999"));
        });

        it("should succeed when under collateral", async () => {
          await oracle.setPrice(ethers.parseEther("999"));
          const expected = await treasury.connect(market).redeem.staticCall(ethers.parseEther("1"), 0n, signer.address);
          expect(expected).to.eq(ethers.parseEther("0.001"));
          await treasury.connect(market).redeem(ethers.parseEther("1"), 0n, signer.address);
          expect(await treasury.totalBaseToken()).to.eq(ethers.parseEther("0.999"));
          expect(await baseToken.balanceOf(market.address)).to.eq(expected);
          expect(await fToken.balanceOf(signer.address)).to.eq(ethers.parseEther("999"));
        });

        it("should compute #maxRedeemableFToken correctly", async () => {
          // 10% change
          await oracle.setPrice(ethers.parseEther("2200"));
          expect(await treasury.currentBaseTokenPrice()).to.eq(ethers.parseEther("2200"));
          expect(await fToken.nav()).to.eq(PRECISION);
          expect(await xToken.nav()).to.eq(ethers.parseEther("1.2"));
          expect(await treasury.collateralRatio()).to.eq(ethers.parseEther("2.2"));

          // make collateral ratio to 150%
          let [maxBaseOut, maxFTokenRedeemable] = await treasury.maxRedeemableFToken(ethers.parseEther("1.5"));
          expect(maxFTokenRedeemable).to.eq(0n);

          // make collateral ratio to 300%
          [maxBaseOut, maxFTokenRedeemable] = await treasury.maxRedeemableFToken(ethers.parseEther("3"));
          expect(maxFTokenRedeemable).to.eq(ethers.parseEther("400"));

          await treasury.connect(market).redeem(maxFTokenRedeemable, 0n, signer.address);
          expect(await baseToken.balanceOf(market.address)).to.closeTo(maxBaseOut, 10000);
          expect(await treasury.collateralRatio()).to.closeTo(ethers.parseEther("3"), 100);
        });
      });

      context("#redeem XToken", async () => {
        it("should revert, when caller is not market", async () => {
          await expect(treasury.connect(signer).redeem(0n, 1n, ZeroAddress)).to.revertedWith(
            "AccessControl: account " + signer.address.toLowerCase() + " is missing role " + id("FX_MARKET_ROLE")
          );
        });

        it("should revert when under collateral", async () => {
          await oracle.setPrice(ethers.parseEther("1000"));
          await expect(
            treasury.connect(market).redeem(0n, ethers.parseEther("1"), signer.address)
          ).to.revertedWithCustomError(treasury, "ErrorUnderCollateral");
          await oracle.setPrice(ethers.parseEther("1000") - 1n);
          await expect(
            treasury.connect(market).redeem(0n, ethers.parseEther("1"), signer.address)
          ).to.revertedWithCustomError(treasury, "ErrorUnderCollateral");
          await oracle.setPrice(ethers.parseEther("999"));
          await expect(
            treasury.connect(market).redeem(0n, ethers.parseEther("1"), signer.address)
          ).to.revertedWithCustomError(treasury, "ErrorUnderCollateral");
        });

        it("should succeed when price not change", async () => {
          const expected = await treasury.connect(market).redeem.staticCall(0n, ethers.parseEther("1"), signer.address);
          expect(expected).to.eq(ethers.parseEther("0.0005"));
          await treasury.connect(market).redeem(0n, ethers.parseEther("1"), signer.address);
          expect(await treasury.totalBaseToken()).to.eq(ethers.parseEther("0.9995"));
          expect(await baseToken.balanceOf(market.address)).to.eq(expected);
          expect(await xToken.balanceOf(signer.address)).to.eq(ethers.parseEther("999"));
        });

        it("should succeed when price down", async () => {
          await oracle.setPrice(ethers.parseEther("1001"));
          const expected = await treasury.connect(market).redeem.staticCall(0n, ethers.parseEther("1"), signer.address);
          expect(expected).to.eq(ethers.parseEther("0.000000999000999000"));
          await treasury.connect(market).redeem(0n, ethers.parseEther("1"), signer.address);
          expect(await treasury.totalBaseToken()).to.eq(ethers.parseEther("0.999999000999001000"));
          expect(await baseToken.balanceOf(market.address)).to.eq(expected);
          expect(await xToken.balanceOf(signer.address)).to.eq(ethers.parseEther("999"));
        });

        it("should succeed when price up", async () => {
          await oracle.setPrice(ethers.parseEther("2001"));
          const expected = await treasury.connect(market).redeem.staticCall(0n, ethers.parseEther("1"), signer.address);
          expect(expected).to.eq(ethers.parseEther("0.000500249875062468"));
          await treasury.connect(market).redeem(0n, ethers.parseEther("1"), signer.address);
          expect(await treasury.totalBaseToken()).to.eq(ethers.parseEther("0.999499750124937532"));
          expect(await baseToken.balanceOf(market.address)).to.eq(expected);
          expect(await xToken.balanceOf(signer.address)).to.eq(ethers.parseEther("999"));
        });

        it("should compute #maxRedeemableXToken correctly", async () => {
          // 10% change
          await oracle.setPrice(ethers.parseEther("2200"));
          expect(await treasury.currentBaseTokenPrice()).to.eq(ethers.parseEther("2200"));
          expect(await fToken.nav()).to.eq(PRECISION);
          expect(await xToken.nav()).to.eq(ethers.parseEther("1.2"));
          expect(await treasury.collateralRatio()).to.eq(ethers.parseEther("2.2"));

          // make collateral ratio to 300%
          let [maxBaseOut, maxXTokenRedeemable] = await treasury.maxRedeemableXToken(ethers.parseEther("3"));
          expect(maxXTokenRedeemable).to.eq(0n);

          // make collateral ratio to 150%
          [maxBaseOut, maxXTokenRedeemable] = await treasury.maxRedeemableXToken(ethers.parseEther("1.5"));
          expect(maxXTokenRedeemable).to.eq(ethers.parseEther("583.333333333333333333"));

          await treasury.connect(market).redeem(0n, maxXTokenRedeemable, signer.address);
          expect(await baseToken.balanceOf(market.address)).to.closeTo(maxBaseOut, 10000);
          expect(await treasury.collateralRatio()).to.closeTo(ethers.parseEther("1.5"), 100);
        });
      });
    });

    context("rate = 1.01", async () => {
      beforeEach(async () => {
        await rateProvider.setRate(ethers.parseEther("1.01"));
        await treasury.connect(signer).initializeProtocol(ethers.parseEther("1.01"));
        expect(await fToken.balanceOf(signer.address)).to.eq(ethers.parseEther("1010"));
        expect(await xToken.balanceOf(signer.address)).to.eq(ethers.parseEther("1010"));
        expect(await treasury.totalBaseToken()).to.eq(ethers.parseEther("1.01"));
      });

      context("#mintFToken", async () => {
        it("should revert, when caller is not market", async () => {
          await expect(treasury.connect(signer).mintFToken(0n, ZeroAddress)).to.revertedWith(
            "AccessControl: account " + signer.address.toLowerCase() + " is missing role " + id("FX_MARKET_ROLE")
          );
        });

        it("should revert when under collateral", async () => {
          await oracle.setPrice(ethers.parseEther("1000"));
          await expect(treasury.connect(market).mintFToken(1n, deployer.address)).to.revertedWithCustomError(
            treasury,
            "ErrorUnderCollateral"
          );
          await oracle.setPrice(ethers.parseEther("1000") - 1n);
          await expect(treasury.connect(market).mintFToken(1n, deployer.address)).to.revertedWithCustomError(
            treasury,
            "ErrorUnderCollateral"
          );
        });

        it("should revert when exceed cap", async () => {
          await expect(
            treasury.connect(market).mintFToken(ethers.parseEther("9999") + 1n, deployer.address)
          ).to.revertedWithCustomError(treasury, "ErrorExceedTotalCap");
        });

        it("should succeed when price not change", async () => {
          const expected = await treasury
            .connect(market)
            .mintFToken.staticCall(ethers.parseEther("1"), deployer.address);
          expect(expected).to.eq(ethers.parseEther("2000"));
          await treasury.connect(market).mintFToken(ethers.parseEther("1"), deployer.address);
          expect(await treasury.totalBaseToken()).to.eq(ethers.parseEther("2.01"));
          expect(await fToken.balanceOf(deployer.address)).to.eq(expected);
        });

        it("should succeed when price down", async () => {
          await oracle.setPrice(ethers.parseEther("1001"));
          const expected = await treasury
            .connect(market)
            .mintFToken.staticCall(ethers.parseEther("1"), deployer.address);
          expect(expected).to.eq(ethers.parseEther("1001"));
          await treasury.connect(market).mintFToken(ethers.parseEther("1"), deployer.address);
          expect(await treasury.totalBaseToken()).to.eq(ethers.parseEther("2.01"));
          expect(await fToken.balanceOf(deployer.address)).to.eq(expected);
        });

        it("should succeed when price up", async () => {
          await oracle.setPrice(ethers.parseEther("2001"));
          const expected = await treasury
            .connect(market)
            .mintFToken.staticCall(ethers.parseEther("1"), deployer.address);
          expect(expected).to.eq(ethers.parseEther("2001"));
          await treasury.connect(market).mintFToken(ethers.parseEther("1"), deployer.address);
          expect(await treasury.totalBaseToken()).to.eq(ethers.parseEther("2.01"));
          expect(await fToken.balanceOf(deployer.address)).to.eq(expected);
        });
      });

      context("#mintXToken", async () => {
        it("should revert, when caller is not market", async () => {
          await expect(treasury.connect(signer).mintXToken(0n, ZeroAddress)).to.revertedWith(
            "AccessControl: account " + signer.address.toLowerCase() + " is missing role " + id("FX_MARKET_ROLE")
          );
        });

        it("should revert when under collateral", async () => {
          await oracle.setPrice(ethers.parseEther("1000"));
          await expect(treasury.connect(market).mintXToken(1n, deployer.address)).to.revertedWithCustomError(
            treasury,
            "ErrorUnderCollateral"
          );
          await oracle.setPrice(ethers.parseEther("1000") - 1n);
          await expect(treasury.connect(market).mintXToken(1n, deployer.address)).to.revertedWithCustomError(
            treasury,
            "ErrorUnderCollateral"
          );
        });

        it("should revert when exceed cap", async () => {
          await expect(
            treasury.connect(market).mintXToken(ethers.parseEther("9999") + 1n, deployer.address)
          ).to.revertedWithCustomError(treasury, "ErrorExceedTotalCap");
        });

        it("should succeed when price not change", async () => {
          const expected = await treasury
            .connect(market)
            .mintXToken.staticCall(ethers.parseEther("1"), deployer.address);
          expect(expected).to.eq(ethers.parseEther("2000"));
          await treasury.connect(market).mintXToken(ethers.parseEther("1"), deployer.address);
          expect(await treasury.totalBaseToken()).to.eq(ethers.parseEther("2.01"));
          expect(await xToken.balanceOf(deployer.address)).to.eq(expected);
        });

        it("should succeed when price down", async () => {
          await oracle.setPrice(ethers.parseEther("1001"));
          const expected = await treasury
            .connect(market)
            .mintXToken.staticCall(ethers.parseEther("1"), deployer.address);
          expect(expected).to.eq(ethers.parseEther("1001000"));
          await treasury.connect(market).mintXToken(ethers.parseEther("1"), deployer.address);
          expect(await treasury.totalBaseToken()).to.eq(ethers.parseEther("2.01"));
          expect(await xToken.balanceOf(deployer.address)).to.eq(expected);
        });

        it("should succeed when price up", async () => {
          await oracle.setPrice(ethers.parseEther("2001"));
          const expected = await treasury
            .connect(market)
            .mintXToken.staticCall(ethers.parseEther("1"), deployer.address);
          expect(expected).to.eq(ethers.parseEther("1999.000999000999000999"));
          await treasury.connect(market).mintXToken(ethers.parseEther("1"), deployer.address);
          expect(await treasury.totalBaseToken()).to.eq(ethers.parseEther("2.01"));
          expect(await xToken.balanceOf(deployer.address)).to.eq(expected);
        });
      });

      context("#redeem FToken", async () => {
        it("should revert, when caller is not market", async () => {
          await expect(treasury.connect(signer).redeem(1n, 0n, ZeroAddress)).to.revertedWith(
            "AccessControl: account " + signer.address.toLowerCase() + " is missing role " + id("FX_MARKET_ROLE")
          );
        });

        it("should succeed when price not change", async () => {
          const expected = await treasury.connect(market).redeem.staticCall(ethers.parseEther("1"), 0n, signer.address);
          expect(expected).to.eq(ethers.parseEther("0.0005"));
          await treasury.connect(market).redeem(ethers.parseEther("1"), 0n, signer.address);
          expect(await treasury.totalBaseToken()).to.eq(ethers.parseEther("1.0095"));
          expect(await baseToken.balanceOf(market.address)).to.eq((expected * PRECISION) / ethers.parseEther("1.01"));
          expect(await fToken.balanceOf(signer.address)).to.eq(ethers.parseEther("1009"));
        });

        it("should succeed when price down", async () => {
          await oracle.setPrice(ethers.parseEther("1001"));
          const expected = await treasury.connect(market).redeem.staticCall(ethers.parseEther("1"), 0n, signer.address);
          expect(expected).to.eq(ethers.parseEther("0.000999000999000999"));
          await treasury.connect(market).redeem(ethers.parseEther("1"), 0n, signer.address);
          expect(await treasury.totalBaseToken()).to.eq(ethers.parseEther("1.009000999000999001"));
          expect(await baseToken.balanceOf(market.address)).to.eq((expected * PRECISION) / ethers.parseEther("1.01"));
          expect(await fToken.balanceOf(signer.address)).to.eq(ethers.parseEther("1009"));
        });

        it("should succeed when price up", async () => {
          await oracle.setPrice(ethers.parseEther("2001"));
          const expected = await treasury.connect(market).redeem.staticCall(ethers.parseEther("1"), 0n, signer.address);
          expect(expected).to.eq(ethers.parseEther("0.000499750124937531"));
          await treasury.connect(market).redeem(ethers.parseEther("1"), 0n, signer.address);
          expect(await treasury.totalBaseToken()).to.eq(ethers.parseEther("1.009500249875062469"));
          expect(await baseToken.balanceOf(market.address)).to.eq((expected * PRECISION) / ethers.parseEther("1.01"));
          expect(await fToken.balanceOf(signer.address)).to.eq(ethers.parseEther("1009"));
        });

        it("should succeed when under collateral", async () => {
          await oracle.setPrice(ethers.parseEther("999"));
          const expected = await treasury.connect(market).redeem.staticCall(ethers.parseEther("1"), 0n, signer.address);
          expect(expected).to.eq(ethers.parseEther("0.001"));
          await treasury.connect(market).redeem(ethers.parseEther("1"), 0n, signer.address);
          expect(await treasury.totalBaseToken()).to.eq(ethers.parseEther("1.009"));
          expect(await baseToken.balanceOf(market.address)).to.eq((expected * PRECISION) / ethers.parseEther("1.01"));
          expect(await fToken.balanceOf(signer.address)).to.eq(ethers.parseEther("1009"));
        });
      });

      context("#redeem XToken", async () => {
        it("should revert, when caller is not market", async () => {
          await expect(treasury.connect(signer).redeem(0n, 1n, ZeroAddress)).to.revertedWith(
            "AccessControl: account " + signer.address.toLowerCase() + " is missing role " + id("FX_MARKET_ROLE")
          );
        });

        it("should revert when under collateral", async () => {
          await oracle.setPrice(ethers.parseEther("1000"));
          await expect(
            treasury.connect(market).redeem(0n, ethers.parseEther("1"), signer.address)
          ).to.revertedWithCustomError(treasury, "ErrorUnderCollateral");
          await oracle.setPrice(ethers.parseEther("1000") - 1n);
          await expect(
            treasury.connect(market).redeem(0n, ethers.parseEther("1"), signer.address)
          ).to.revertedWithCustomError(treasury, "ErrorUnderCollateral");
          await oracle.setPrice(ethers.parseEther("999"));
          await expect(
            treasury.connect(market).redeem(0n, ethers.parseEther("1"), signer.address)
          ).to.revertedWithCustomError(treasury, "ErrorUnderCollateral");
        });

        it("should succeed when price not change", async () => {
          const expected = await treasury.connect(market).redeem.staticCall(0n, ethers.parseEther("1"), signer.address);
          expect(expected).to.eq(ethers.parseEther("0.0005"));
          await treasury.connect(market).redeem(0n, ethers.parseEther("1"), signer.address);
          expect(await treasury.totalBaseToken()).to.eq(ethers.parseEther("1.0095"));
          expect(await baseToken.balanceOf(market.address)).to.eq((expected * PRECISION) / ethers.parseEther("1.01"));
          expect(await xToken.balanceOf(signer.address)).to.eq(ethers.parseEther("1009"));
        });

        it("should succeed when price down", async () => {
          await oracle.setPrice(ethers.parseEther("1001"));
          const expected = await treasury.connect(market).redeem.staticCall(0n, ethers.parseEther("1"), signer.address);
          expect(expected).to.eq(ethers.parseEther("0.000000999000999000"));
          await treasury.connect(market).redeem(0n, ethers.parseEther("1"), signer.address);
          expect(await treasury.totalBaseToken()).to.eq(ethers.parseEther("1.009999000999001000"));
          expect(await baseToken.balanceOf(market.address)).to.eq((expected * PRECISION) / ethers.parseEther("1.01"));
          expect(await xToken.balanceOf(signer.address)).to.eq(ethers.parseEther("1009"));
        });

        it("should succeed when price up", async () => {
          await oracle.setPrice(ethers.parseEther("2001"));
          const expected = await treasury.connect(market).redeem.staticCall(0n, ethers.parseEther("1"), signer.address);
          expect(expected).to.eq(ethers.parseEther("0.000500249875062468"));
          await treasury.connect(market).redeem(0n, ethers.parseEther("1"), signer.address);
          expect(await treasury.totalBaseToken()).to.eq(ethers.parseEther("1.009499750124937532"));
          expect(await baseToken.balanceOf(market.address)).to.eq((expected * PRECISION) / ethers.parseEther("1.01"));
          expect(await xToken.balanceOf(signer.address)).to.eq(ethers.parseEther("1009"));
        });
      });
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
        await rateProvider.setRate(ethers.parseEther("1.0"));
        await treasury.connect(signer).initializeProtocol(ethers.parseEther("1"));
        expect(await fToken.balanceOf(signer.address)).to.eq(ethers.parseEther("1000"));
        expect(await xToken.balanceOf(signer.address)).to.eq(ethers.parseEther("1000"));
        expect(await treasury.totalBaseToken()).to.eq(ethers.parseEther("1"));
        expect(await treasury.harvestable()).to.eq(0n);
      });

      it("should do nothing when rate doesn't change", async () => {
        await treasury.harvest();
        expect(await baseToken.balanceOf(treasury.getAddress())).to.eq(ethers.parseEther("1"));
        expect(await treasury.totalBaseToken()).to.eq(ethers.parseEther("1"));
        expect(await treasury.harvestable()).to.eq(0n);
      });

      it("should succeed, when balance up", async () => {
        await treasury.updateHarvesterRatio(1e8); // 10%
        await treasury.updateRebalancePoolRatio(5e8); // 50%
        await splitter.setSplitter(baseToken.getAddress(), treasury.getAddress());
        await baseToken.mint(treasury.getAddress(), ethers.parseEther("1"));
        expect(await treasury.harvestable()).to.eq(ethers.parseEther("1"));
        await expect(treasury.connect(signer).harvest())
          .to.emit(treasury, "Harvest")
          .withArgs(signer.address, ethers.parseEther("1"), ethers.parseEther("0.5"), ethers.parseEther("0.1"));
        expect(await baseToken.balanceOf(treasury.getAddress())).to.eq(ethers.parseEther("1"));
        expect(await treasury.totalBaseToken()).to.eq(ethers.parseEther("1"));
        expect(await treasury.harvestable()).to.eq(0n);
        expect(await baseToken.balanceOf(signer.address)).to.eq(ethers.parseEther("0.1"));
        expect(await baseToken.balanceOf(platform.address)).to.eq(ethers.parseEther("0.4"));
        expect(await baseToken.balanceOf(splitter.getAddress())).to.eq(ethers.parseEther("0.5"));
      });
    });

    context("rate = 1.01", async () => {
      beforeEach(async () => {
        await rateProvider.setRate(ethers.parseEther("1.01"));
        await treasury.connect(signer).initializeProtocol(ethers.parseEther("1.01"));
        expect(await fToken.balanceOf(signer.address)).to.eq(ethers.parseEther("1010"));
        expect(await xToken.balanceOf(signer.address)).to.eq(ethers.parseEther("1010"));
        expect(await treasury.totalBaseToken()).to.eq(ethers.parseEther("1.01"));
        expect(await treasury.harvestable()).to.eq(0n);
      });

      it("should do nothing when rate doesn't change", async () => {
        await treasury.harvest();
        expect(await baseToken.balanceOf(treasury.getAddress())).to.eq(ethers.parseEther("1"));
        expect(await treasury.totalBaseToken()).to.eq(ethers.parseEther("1.01"));
        expect(await treasury.harvestable()).to.eq(0n);
      });

      it("should succeed, when rate up", async () => {
        await treasury.updateHarvesterRatio(1e8); // 10%
        await treasury.updateRebalancePoolRatio(5e8); // 50%
        await splitter.setSplitter(baseToken.getAddress(), treasury.getAddress());
        await rateProvider.setRate(ethers.parseEther("1.02"));
        expect(await treasury.harvestable()).to.eq(ethers.parseEther("0.009803921568627451"));
        await expect(treasury.connect(signer).harvest())
          .to.emit(treasury, "Harvest")
          .withArgs(
            signer.address,
            ethers.parseEther("0.009803921568627451"),
            ethers.parseEther("0.004901960784313725"),
            ethers.parseEther("0.000980392156862745")
          );
        expect(await baseToken.balanceOf(treasury.getAddress())).to.eq(ethers.parseEther("0.990196078431372549"));
        expect(await treasury.totalBaseToken()).to.eq(ethers.parseEther("1.01"));
        expect(await treasury.harvestable()).to.eq(0n);
        expect(await baseToken.balanceOf(signer.address)).to.eq(ethers.parseEther("0.000980392156862745"));
        expect(await baseToken.balanceOf(platform.address)).to.eq(ethers.parseEther("0.003921568627450981"));
        expect(await baseToken.balanceOf(splitter.getAddress())).to.eq(ethers.parseEther("0.004901960784313725"));
      });
    });
  });

  context("settle", async () => {
    it("should revert when caller is not whitelisted", async () => {
      await expect(treasury.connect(signer).settle()).to.revertedWith(
        "AccessControl: account " + signer.address.toLowerCase() + " is missing role " + id("SETTLE_WHITELIST_ROLE")
      );
    });

    it("should succeed", async () => {
      await oracle.setPrice(ethers.parseEther("2000"));
      await rateProvider.setRate(ethers.parseEther("1.0"));
      await baseToken.mint(treasury.getAddress(), ethers.parseEther("1"));
      await treasury.grantRole(id("PROTOCOL_INITIALIZER_ROLE"), signer.address);
      await expect(treasury.connect(signer).initializeProtocol(ethers.parseEther("1")))
        .to.emit(treasury, "Settle")
        .withArgs(0n, ethers.parseEther("2000"));

      await treasury.grantRole(id("SETTLE_WHITELIST_ROLE"), signer.address);
      await oracle.setPrice(ethers.parseEther("2001"));
      await expect(treasury.connect(signer).settle())
        .to.emit(treasury, "Settle")
        .withArgs(ethers.parseEther("2000"), ethers.parseEther("2001"));
      expect((await treasury.emaLeverageRatio()).lastTime).to.eq((await ethers.provider.getBlock("latest"))!.timestamp);
      expect((await treasury.emaLeverageRatio()).lastValue).to.eq(ethers.parseEther("1.999000999000998999"));
    });
  });

  context("strategy", async () => {
    it("should revert when caller is not strategy", async () => {
      await expect(treasury.transferToStrategy(0n)).to.rejectedWith("Only strategy");
      await expect(treasury.notifyStrategyProfit(0n)).to.rejectedWith("Only strategy");
    });

    it("should succeed when call from strategy", async () => {
      await treasury.updateStrategy(signer.address);
      await baseToken.mint(treasury.getAddress(), 10000);
      expect(await baseToken.balanceOf(treasury.getAddress())).to.eq(10000);
      await treasury.connect(signer).transferToStrategy(1000);
      expect(await treasury.strategyUnderlying()).to.eq(1000);
      expect(await baseToken.balanceOf(signer.address)).to.eq(1000);
      expect(await baseToken.balanceOf(treasury.getAddress())).to.eq(9000);

      await treasury.connect(signer).notifyStrategyProfit(0n);
    });
  });
});
