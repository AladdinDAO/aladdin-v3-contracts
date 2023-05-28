/* eslint-disable node/no-missing-import */
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { LeveragedToken, FractionalToken, Treasury, WETH9, MockTwapOracle } from "../../typechain";
import { BigNumber, constants } from "ethers";
import "../utils";

const PRECISION = BigNumber.from(10).pow(18);

describe("Treasury.spec", async () => {
  let deployer: SignerWithAddress;
  let market: SignerWithAddress;
  let signer: SignerWithAddress;

  let weth: WETH9;
  let oracle: MockTwapOracle;
  let fToken: FractionalToken;
  let xToken: LeveragedToken;
  let treasury: Treasury;

  beforeEach(async () => {
    [deployer, market, signer] = await ethers.getSigners();

    const WETH9 = await ethers.getContractFactory("WETH9", deployer);
    weth = await WETH9.deploy();
    await weth.deployed();

    const MockTwapOracle = await ethers.getContractFactory("MockTwapOracle", deployer);
    oracle = await MockTwapOracle.deploy();
    await oracle.deployed();

    const FractionalToken = await ethers.getContractFactory("FractionalToken", deployer);
    fToken = await FractionalToken.deploy();
    await fToken.deployed();

    const LeveragedToken = await ethers.getContractFactory("LeveragedToken", deployer);
    xToken = await LeveragedToken.deploy();
    await xToken.deployed();

    const Treasury = await ethers.getContractFactory("Treasury", deployer);
    treasury = await Treasury.deploy(ethers.utils.parseEther("0.5"));
    await treasury.deployed();

    await fToken.initialize(treasury.address, "Fractional ETH", "fETH");
    await xToken.initialize(treasury.address, fToken.address, "Leveraged ETH", "xETH");

    await treasury.initialize(
      market.address,
      weth.address,
      fToken.address,
      xToken.address,
      oracle.address,
      ethers.utils.parseEther("0.1")
    );

    await weth.deposit({ value: ethers.utils.parseEther("100") });
    await weth.transfer(treasury.address, ethers.utils.parseEther("100"));
  });

  context("auth", async () => {
    it("should revert, when intialize again", async () => {
      await expect(
        treasury.initialize(
          market.address,
          weth.address,
          fToken.address,
          xToken.address,
          oracle.address,
          ethers.utils.parseEther("0.1")
        )
      ).to.revertedWith("Initializable: contract is already initialized");
    });

    it("should initialize correctly", async () => {
      expect(await treasury.market()).to.eq(market.address);
      expect(await treasury.fToken()).to.eq(fToken.address);
      expect(await treasury.xToken()).to.eq(xToken.address);
      expect(await treasury.baseToken()).to.eq(weth.address);
      expect(await treasury.priceOracle()).to.eq(oracle.address);
      expect(await treasury.beta()).to.eq(ethers.utils.parseEther("0.1"));
      expect(await treasury.lastPermissionedPrice()).to.eq(constants.Zero);
      expect(await treasury.totalBaseToken()).to.eq(constants.Zero);
      expect(await treasury.strategy()).to.eq(constants.AddressZero);
      expect(await treasury.strategyUnderlying()).to.eq(constants.Zero);
    });

    context("#initializePrice", async () => {
      it("should revert, when non-owner call", async () => {
        await expect(treasury.connect(signer).initializePrice()).to.revertedWith("Ownable: caller is not the owner");
      });

      it("should succeed", async () => {
        await oracle.setPrice(ethers.utils.parseEther("1111.1111"));
        await expect(treasury.initializePrice())
          .to.emit(treasury, "ProtocolSettle")
          .withArgs(ethers.utils.parseEther("1111.1111"), PRECISION);
        expect(await treasury.lastPermissionedPrice()).to.eq(ethers.utils.parseEther("1111.1111"));
        expect(await fToken.nav()).to.eq(PRECISION);

        await expect(treasury.initializePrice()).to.revertedWith("only initialize price once");
      });
    });

    context("#updateStrategy", async () => {
      it("should revert, when non-owner call", async () => {
        await expect(treasury.connect(signer).updateStrategy(constants.AddressZero)).to.revertedWith(
          "Ownable: caller is not the owner"
        );
      });

      it("should succeed", async () => {
        expect(await treasury.strategy()).to.eq(constants.AddressZero);
        await expect(treasury.updateStrategy(deployer.address))
          .to.emit(treasury, "UpdateStrategy")
          .withArgs(deployer.address);
        expect(await treasury.strategy()).to.eq(deployer.address);
      });
    });

    context("#updateBeta", async () => {
      it("should revert, when non-owner call", async () => {
        await expect(treasury.connect(signer).updateBeta(2)).to.revertedWith("Ownable: caller is not the owner");
      });

      it("should succeed", async () => {
        expect(await treasury.beta()).to.eq(ethers.utils.parseEther("0.1"));
        await expect(treasury.updateBeta(2)).to.emit(treasury, "UpdateBeta").withArgs(2);
        expect(await treasury.beta()).to.eq(2);
      });
    });

    context("#updatePriceOracle", async () => {
      it("should revert, when non-owner call", async () => {
        await expect(treasury.connect(signer).updatePriceOracle(constants.AddressZero)).to.revertedWith(
          "Ownable: caller is not the owner"
        );
      });

      it("should succeed", async () => {
        expect(await treasury.priceOracle()).to.eq(oracle.address);
        await expect(treasury.updatePriceOracle(deployer.address))
          .to.emit(treasury, "UpdatePriceOracle")
          .withArgs(deployer.address);
        expect(await treasury.priceOracle()).to.eq(deployer.address);
      });
    });

    context("#updateSettleWhitelist", async () => {
      it("should revert, when non-owner call", async () => {
        await expect(treasury.connect(signer).updateSettleWhitelist(constants.AddressZero, false)).to.revertedWith(
          "Ownable: caller is not the owner"
        );
      });

      it("should succeed", async () => {
        expect(await treasury.settleWhitelist(deployer.address)).to.eq(false);
        await expect(treasury.updateSettleWhitelist(deployer.address, true))
          .to.emit(treasury, "UpdateSettleWhitelist")
          .withArgs(deployer.address, true);
        expect(await treasury.settleWhitelist(deployer.address)).to.eq(true);
        await expect(treasury.updateSettleWhitelist(deployer.address, false))
          .to.emit(treasury, "UpdateSettleWhitelist")
          .withArgs(deployer.address, false);
        expect(await treasury.settleWhitelist(deployer.address)).to.eq(false);
      });
    });
  });

  context("#mint", async () => {
    it("should revert, when non-market call", async () => {
      await expect(treasury.mint(constants.Zero, constants.AddressZero, 0)).to.revertedWith("Only market");
      await expect(treasury.mint(constants.Zero, constants.AddressZero, 1)).to.revertedWith("Only market");
      await expect(treasury.mint(constants.Zero, constants.AddressZero, 2)).to.revertedWith("Only market");
    });

    it("should succeed when mint both", async () => {
      await oracle.setPrice(ethers.utils.parseEther("1000"));
      await treasury.initializePrice();

      await treasury.connect(market).mint(ethers.utils.parseEther("1"), signer.address, 0);
      expect(await treasury.totalBaseToken()).to.eq(ethers.utils.parseEther("1"));
      expect(await fToken.balanceOf(signer.address)).to.eq(ethers.utils.parseEther("500"));
      expect(await xToken.balanceOf(signer.address)).to.eq(ethers.utils.parseEther("500"));
    });

    it("should succeed, when mint fToken", async () => {
      await oracle.setPrice(ethers.utils.parseEther("1000"));
      await treasury.initializePrice();
      await treasury.connect(market).mint(ethers.utils.parseEther("1"), deployer.address, 0);

      await treasury.connect(market).mint(ethers.utils.parseEther("1"), signer.address, 1);
      expect(await treasury.totalBaseToken()).to.eq(ethers.utils.parseEther("2"));
      expect(await fToken.balanceOf(signer.address)).to.eq(ethers.utils.parseEther("1000"));
    });

    it("should succeed, when mint xToken", async () => {
      await oracle.setPrice(ethers.utils.parseEther("1000"));
      await treasury.initializePrice();
      await treasury.connect(market).mint(ethers.utils.parseEther("1"), deployer.address, 0);

      await treasury.connect(market).mint(ethers.utils.parseEther("1"), signer.address, 2);
      expect(await treasury.totalBaseToken()).to.eq(ethers.utils.parseEther("2"));
      expect(await xToken.balanceOf(signer.address)).to.eq(ethers.utils.parseEther("1000"));
    });

    it("should succeed, mint both => price move up => mint fToken", async () => {
      await oracle.setPrice(ethers.utils.parseEther("1000"));
      await treasury.initializePrice();
      await treasury.connect(market).mint(ethers.utils.parseEther("1"), deployer.address, 0);

      // 10% change
      await oracle.setPrice(ethers.utils.parseEther("1100"));
      expect((await treasury.getCurrentNav())._baseNav).to.eq(ethers.utils.parseEther("1100"));
      expect((await treasury.getCurrentNav())._fNav).to.eq(ethers.utils.parseEther("1.01"));
      expect((await treasury.getCurrentNav())._xNav).to.eq(ethers.utils.parseEther("1.19"));

      // mint fToken
      await treasury.connect(market).mint(ethers.utils.parseEther("1"), signer.address, 1);
      expect(await treasury.totalBaseToken()).to.eq(ethers.utils.parseEther("2"));
      expect(await fToken.balanceOf(signer.address)).to.eq(ethers.utils.parseEther("1089.108910891089108910"));
    });

    it("should succeed, mint both => price move up => mint xToken", async () => {
      await oracle.setPrice(ethers.utils.parseEther("1000"));
      await treasury.initializePrice();
      await treasury.connect(market).mint(ethers.utils.parseEther("1"), deployer.address, 0);

      // 10% change
      await oracle.setPrice(ethers.utils.parseEther("1100"));
      expect((await treasury.getCurrentNav())._baseNav).to.eq(ethers.utils.parseEther("1100"));
      expect((await treasury.getCurrentNav())._fNav).to.eq(ethers.utils.parseEther("1.01"));
      expect((await treasury.getCurrentNav())._xNav).to.eq(ethers.utils.parseEther("1.19"));

      // mint xToken
      await treasury.connect(market).mint(ethers.utils.parseEther("1"), signer.address, 2);
      expect(await treasury.totalBaseToken()).to.eq(ethers.utils.parseEther("2"));
      expect(await xToken.balanceOf(signer.address)).to.eq(ethers.utils.parseEther("924.369747899159663865"));
    });

    it("should compute #maxMintableFToken correctly", async () => {
      await oracle.setPrice(ethers.utils.parseEther("1000"));
      await treasury.initializePrice();
      await treasury.connect(market).mint(ethers.utils.parseEther("1"), deployer.address, 0);

      // 10% change
      await oracle.setPrice(ethers.utils.parseEther("1100"));
      expect((await treasury.getCurrentNav())._baseNav).to.eq(ethers.utils.parseEther("1100"));
      expect((await treasury.getCurrentNav())._fNav).to.eq(ethers.utils.parseEther("1.01"));
      expect((await treasury.getCurrentNav())._xNav).to.eq(ethers.utils.parseEther("1.19"));

      expect(await treasury.collateralRatio()).to.eq(ethers.utils.parseEther("2.178217821782178217"));

      // make collateral ratio to 300%
      let [maxBaseIn, maxFTokenMintable] = await treasury.maxMintableFToken(ethers.utils.parseEther("3"));
      expect(maxBaseIn).to.eq(constants.Zero);

      // make collateral ratio to 150%
      [maxBaseIn, maxFTokenMintable] = await treasury.maxMintableFToken(ethers.utils.parseEther("1.5"));
      expect(maxBaseIn).to.eq(ethers.utils.parseEther(".622727272727272727"));
      await treasury.connect(market).mint(maxBaseIn, signer.address, 1);
      expect(await fToken.balanceOf(signer.address)).to.closeToBn(maxFTokenMintable, 10000);
      expect(await treasury.collateralRatio()).to.eq(ethers.utils.parseEther("1.5"));
    });

    it("should compute #maxMintableXToken correctly", async () => {
      await oracle.setPrice(ethers.utils.parseEther("1000"));
      await treasury.initializePrice();
      await treasury.connect(market).mint(ethers.utils.parseEther("1"), deployer.address, 0);

      // 10% change
      await oracle.setPrice(ethers.utils.parseEther("1100"));
      expect((await treasury.getCurrentNav())._baseNav).to.eq(ethers.utils.parseEther("1100"));
      expect((await treasury.getCurrentNav())._fNav).to.eq(ethers.utils.parseEther("1.01"));
      expect((await treasury.getCurrentNav())._xNav).to.eq(ethers.utils.parseEther("1.19"));

      expect(await treasury.collateralRatio()).to.eq(ethers.utils.parseEther("2.178217821782178217"));

      // make collateral ratio to 150%
      let [maxBaseIn, maxXTokenMintable] = await treasury.maxMintableXToken(ethers.utils.parseEther("1.5"));
      expect(maxBaseIn).to.eq(constants.Zero);

      // make collateral ratio to 300%
      [maxBaseIn, maxXTokenMintable] = await treasury.maxMintableXToken(ethers.utils.parseEther("3.0"));
      expect(maxBaseIn).to.eq(ethers.utils.parseEther(".377272727272727272"));

      await treasury.connect(market).mint(maxBaseIn, signer.address, 2);
      expect(await xToken.balanceOf(signer.address)).to.closeToBn(maxXTokenMintable, 10000);
      expect(await treasury.collateralRatio()).to.closeToBn(ethers.utils.parseEther("3"), 100);
    });
  });

  context("#redeem", async () => {
    it("should revert, when non-market call", async () => {
      await expect(treasury.redeem(constants.Zero, constants.Zero, constants.AddressZero)).to.revertedWith(
        "Only market"
      );
    });

    it("should succeed, mint both => price move up => redeem fToken", async () => {
      await oracle.setPrice(ethers.utils.parseEther("1000"));
      await treasury.initializePrice();
      await treasury.connect(market).mint(ethers.utils.parseEther("1"), deployer.address, 0);

      // 10% change
      await oracle.setPrice(ethers.utils.parseEther("1100"));
      expect((await treasury.getCurrentNav())._baseNav).to.eq(ethers.utils.parseEther("1100"));
      expect((await treasury.getCurrentNav())._fNav).to.eq(ethers.utils.parseEther("1.01"));
      expect((await treasury.getCurrentNav())._xNav).to.eq(ethers.utils.parseEther("1.19"));

      // redeem fToken
      expect(await fToken.balanceOf(deployer.address)).to.eq(ethers.utils.parseEther("500"));
      expect(await xToken.balanceOf(deployer.address)).to.eq(ethers.utils.parseEther("500"));
      expect(await treasury.totalBaseToken()).to.eq(ethers.utils.parseEther("1"));
      expect(await weth.balanceOf(market.address)).to.eq(constants.Zero);
      await treasury.connect(market).redeem(ethers.utils.parseEther("100"), constants.Zero, deployer.address);
      expect(await fToken.balanceOf(deployer.address)).to.eq(ethers.utils.parseEther("400"));
      expect(await xToken.balanceOf(deployer.address)).to.eq(ethers.utils.parseEther("500"));
      expect(await weth.balanceOf(market.address)).to.eq(ethers.utils.parseEther(".091818181818181818"));
      expect(await treasury.totalBaseToken()).to.eq(ethers.utils.parseEther(".908181818181818182"));
    });

    it("should succeed, mint both => price move up => redeem xToken", async () => {
      await oracle.setPrice(ethers.utils.parseEther("1000"));
      await treasury.initializePrice();
      await treasury.connect(market).mint(ethers.utils.parseEther("1"), deployer.address, 0);

      // 10% change
      await oracle.setPrice(ethers.utils.parseEther("1100"));
      expect((await treasury.getCurrentNav())._baseNav).to.eq(ethers.utils.parseEther("1100"));
      expect((await treasury.getCurrentNav())._fNav).to.eq(ethers.utils.parseEther("1.01"));
      expect((await treasury.getCurrentNav())._xNav).to.eq(ethers.utils.parseEther("1.19"));

      // redeem fToken
      expect(await fToken.balanceOf(deployer.address)).to.eq(ethers.utils.parseEther("500"));
      expect(await xToken.balanceOf(deployer.address)).to.eq(ethers.utils.parseEther("500"));
      expect(await treasury.totalBaseToken()).to.eq(ethers.utils.parseEther("1"));
      expect(await weth.balanceOf(market.address)).to.eq(constants.Zero);
      await treasury.connect(market).redeem(constants.Zero, ethers.utils.parseEther("100"), deployer.address);
      expect(await fToken.balanceOf(deployer.address)).to.eq(ethers.utils.parseEther("500"));
      expect(await xToken.balanceOf(deployer.address)).to.eq(ethers.utils.parseEther("400"));
      expect(await weth.balanceOf(market.address)).to.eq(ethers.utils.parseEther(".108181818181818181"));
      expect(await treasury.totalBaseToken()).to.eq(ethers.utils.parseEther(".891818181818181819"));
    });

    it("should compute #maxRedeemableFToken correctly", async () => {
      await oracle.setPrice(ethers.utils.parseEther("1000"));
      await treasury.initializePrice();
      await treasury.connect(market).mint(ethers.utils.parseEther("1"), deployer.address, 0);

      // 10% change
      await oracle.setPrice(ethers.utils.parseEther("1100"));
      expect((await treasury.getCurrentNav())._baseNav).to.eq(ethers.utils.parseEther("1100"));
      expect((await treasury.getCurrentNav())._fNav).to.eq(ethers.utils.parseEther("1.01"));
      expect((await treasury.getCurrentNav())._xNav).to.eq(ethers.utils.parseEther("1.19"));

      expect(await treasury.collateralRatio()).to.eq(ethers.utils.parseEther("2.178217821782178217"));

      // make collateral ratio to 150%
      let [maxBaseOut, maxXTokenRedeemable] = await treasury.maxRedeemableFToken(ethers.utils.parseEther("1.5"));
      expect(maxXTokenRedeemable).to.eq(constants.Zero);

      // make collateral ratio to 300%
      [maxBaseOut, maxXTokenRedeemable] = await treasury.maxRedeemableFToken(ethers.utils.parseEther("3"));
      expect(maxXTokenRedeemable).to.eq(ethers.utils.parseEther("205.445544554455445544"));

      await treasury.connect(market).redeem(maxXTokenRedeemable, constants.Zero, deployer.address);
      expect(await weth.balanceOf(market.address)).to.closeToBn(maxBaseOut, 10000);
      expect(await treasury.collateralRatio()).to.closeToBn(ethers.utils.parseEther("3"), 100);
    });

    it("should compute #maxRedeemableXToken correctly", async () => {
      await oracle.setPrice(ethers.utils.parseEther("1000"));
      await treasury.initializePrice();
      await treasury.connect(market).mint(ethers.utils.parseEther("1"), deployer.address, 0);

      // 10% change
      await oracle.setPrice(ethers.utils.parseEther("1100"));
      expect((await treasury.getCurrentNav())._baseNav).to.eq(ethers.utils.parseEther("1100"));
      expect((await treasury.getCurrentNav())._fNav).to.eq(ethers.utils.parseEther("1.01"));
      expect((await treasury.getCurrentNav())._xNav).to.eq(ethers.utils.parseEther("1.19"));

      expect(await treasury.collateralRatio()).to.eq(ethers.utils.parseEther("2.178217821782178217"));

      // make collateral ratio to 300%
      let [maxBaseOut, maxXTokenRedeemable] = await treasury.maxRedeemableXToken(ethers.utils.parseEther("3"));
      expect(maxXTokenRedeemable).to.eq(constants.Zero);

      // make collateral ratio to 150%
      [maxBaseOut, maxXTokenRedeemable] = await treasury.maxRedeemableXToken(ethers.utils.parseEther("1.5"));
      expect(maxXTokenRedeemable).to.eq(ethers.utils.parseEther("287.815126050420168067"));

      await treasury.connect(market).redeem(constants.Zero, maxXTokenRedeemable, deployer.address);
      expect(await weth.balanceOf(market.address)).to.closeToBn(maxBaseOut, 10000);
      expect(await treasury.collateralRatio()).to.closeToBn(ethers.utils.parseEther("1.5"), 100);
    });
  });

  context("#addBaseToken", async () => {
    it("should revert, when non-market call", async () => {
      await expect(treasury.addBaseToken(constants.Zero, constants.Zero, constants.AddressZero)).to.revertedWith(
        "Only market"
      );
    });

    it("should succeed, mint both => price move up => add base token, no incentive", async () => {
      await oracle.setPrice(ethers.utils.parseEther("1000"));
      await treasury.initializePrice();
      await treasury.connect(market).mint(ethers.utils.parseEther("1"), deployer.address, 0);

      // 10% change
      await oracle.setPrice(ethers.utils.parseEther("1100"));
      expect((await treasury.getCurrentNav())._baseNav).to.eq(ethers.utils.parseEther("1100"));
      expect((await treasury.getCurrentNav())._fNav).to.eq(ethers.utils.parseEther("1.01"));
      expect((await treasury.getCurrentNav())._xNav).to.eq(ethers.utils.parseEther("1.19"));

      // mint xToken
      await treasury.connect(market).addBaseToken(ethers.utils.parseEther("1"), constants.Zero, signer.address);
      expect(await treasury.totalBaseToken()).to.eq(ethers.utils.parseEther("2"));
      expect(await xToken.balanceOf(signer.address)).to.eq(ethers.utils.parseEther("924.369747899159663865"));
    });

    it("should succeed, mint both => price move up => add base token, 10% incentive", async () => {
      await oracle.setPrice(ethers.utils.parseEther("1000"));
      await treasury.initializePrice();
      await treasury.connect(market).mint(ethers.utils.parseEther("1"), deployer.address, 0);

      // 10% change
      await oracle.setPrice(ethers.utils.parseEther("1100"));
      expect((await treasury.getCurrentNav())._baseNav).to.eq(ethers.utils.parseEther("1100"));
      expect((await treasury.getCurrentNav())._fNav).to.eq(ethers.utils.parseEther("1.01"));
      expect((await treasury.getCurrentNav())._xNav).to.eq(ethers.utils.parseEther("1.19"));

      // mint xToken
      await treasury
        .connect(market)
        .addBaseToken(ethers.utils.parseEther("1"), ethers.utils.parseEther("0.1"), signer.address);
      expect(await treasury.totalBaseToken()).to.eq(ethers.utils.parseEther("2"));
      expect(await xToken.balanceOf(signer.address)).to.closeToBn(
        ethers.utils.parseEther("1016.806722689075630251"),
        100
      );
      expect(await fToken.nav()).to.closeToBn(ethers.utils.parseEther(".782178217821782180"), 100);
    });

    it("should compute #maxMintableXTokenWithIncentive correctly, no incentive", async () => {
      await oracle.setPrice(ethers.utils.parseEther("1000"));
      await treasury.initializePrice();
      await treasury.connect(market).mint(ethers.utils.parseEther("1"), deployer.address, 0);

      // 10% change
      await oracle.setPrice(ethers.utils.parseEther("1100"));
      expect((await treasury.getCurrentNav())._baseNav).to.eq(ethers.utils.parseEther("1100"));
      expect((await treasury.getCurrentNav())._fNav).to.eq(ethers.utils.parseEther("1.01"));
      expect((await treasury.getCurrentNav())._xNav).to.eq(ethers.utils.parseEther("1.19"));

      expect(await treasury.collateralRatio()).to.eq(ethers.utils.parseEther("2.178217821782178217"));

      // make collateral ratio to 150%, no incentive
      let [maxBaseIn, maxXTokenMintable] = await treasury.maxMintableXTokenWithIncentive(
        ethers.utils.parseEther("1.5"),
        constants.Zero
      );
      expect(maxBaseIn).to.eq(constants.Zero);

      // make collateral ratio to 300%, no incentive
      [maxBaseIn, maxXTokenMintable] = await treasury.maxMintableXTokenWithIncentive(
        ethers.utils.parseEther("3.0"),
        constants.Zero
      );
      expect(maxBaseIn).to.eq(ethers.utils.parseEther(".377272727272727272"));

      await treasury.connect(market).addBaseToken(maxBaseIn, constants.Zero, signer.address);
      expect(await xToken.balanceOf(signer.address)).to.closeToBn(maxXTokenMintable, 10000);
      expect(await treasury.collateralRatio()).to.closeToBn(ethers.utils.parseEther("3"), 100);
    });

    it("should compute #maxMintableXTokenWithIncentive correctly, 10% incentive", async () => {
      await oracle.setPrice(ethers.utils.parseEther("1000"));
      await treasury.initializePrice();
      await treasury.connect(market).mint(ethers.utils.parseEther("1"), deployer.address, 0);

      // 10% change
      await oracle.setPrice(ethers.utils.parseEther("1100"));
      expect((await treasury.getCurrentNav())._baseNav).to.eq(ethers.utils.parseEther("1100"));
      expect((await treasury.getCurrentNav())._fNav).to.eq(ethers.utils.parseEther("1.01"));
      expect((await treasury.getCurrentNav())._xNav).to.eq(ethers.utils.parseEther("1.19"));

      expect(await treasury.collateralRatio()).to.eq(ethers.utils.parseEther("2.178217821782178217"));

      // make collateral ratio to 150%, no incentive
      let [maxBaseIn, maxXTokenMintable] = await treasury.maxMintableXTokenWithIncentive(
        ethers.utils.parseEther("1.5"),
        ethers.utils.parseEther("0.1")
      );
      expect(maxBaseIn).to.eq(constants.Zero);

      // make collateral ratio to 300%, no incentive
      [maxBaseIn, maxXTokenMintable] = await treasury.maxMintableXTokenWithIncentive(
        ethers.utils.parseEther("3.0"),
        ethers.utils.parseEther("0.1")
      );
      expect(maxBaseIn).to.eq(ethers.utils.parseEther(".290209790209790209"));

      await treasury.connect(market).addBaseToken(maxBaseIn, ethers.utils.parseEther("0.1"), signer.address);
      expect(await xToken.balanceOf(signer.address)).to.closeToBn(maxXTokenMintable, 10000);
      expect(await treasury.collateralRatio()).to.closeToBn(ethers.utils.parseEther("3"), 100);
      expect(await fToken.nav()).to.eq(ethers.utils.parseEther("0.936785986290936787"));
    });
  });

  context("#liquidate", async () => {
    it("should revert, when non-market call", async () => {
      await expect(treasury.liquidate(constants.Zero, constants.Zero, constants.AddressZero)).to.revertedWith(
        "Only market"
      );
    });

    it("should succeed, mint both => price move up => liquidate fToken, no incentive", async () => {
      await oracle.setPrice(ethers.utils.parseEther("1000"));
      await treasury.initializePrice();
      await treasury.connect(market).mint(ethers.utils.parseEther("1"), deployer.address, 0);

      // 10% change
      await oracle.setPrice(ethers.utils.parseEther("1100"));
      expect((await treasury.getCurrentNav())._baseNav).to.eq(ethers.utils.parseEther("1100"));
      expect((await treasury.getCurrentNav())._fNav).to.eq(ethers.utils.parseEther("1.01"));
      expect((await treasury.getCurrentNav())._xNav).to.eq(ethers.utils.parseEther("1.19"));

      // redeem fToken
      expect(await fToken.balanceOf(deployer.address)).to.eq(ethers.utils.parseEther("500"));
      expect(await xToken.balanceOf(deployer.address)).to.eq(ethers.utils.parseEther("500"));
      expect(await treasury.totalBaseToken()).to.eq(ethers.utils.parseEther("1"));
      expect(await weth.balanceOf(market.address)).to.eq(constants.Zero);
      await treasury.connect(market).liquidate(ethers.utils.parseEther("100"), constants.Zero, deployer.address);
      expect(await fToken.balanceOf(deployer.address)).to.eq(ethers.utils.parseEther("400"));
      expect(await xToken.balanceOf(deployer.address)).to.eq(ethers.utils.parseEther("500"));
      expect(await weth.balanceOf(market.address)).to.eq(ethers.utils.parseEther(".091818181818181818"));
      expect(await treasury.totalBaseToken()).to.eq(ethers.utils.parseEther(".908181818181818182"));
    });

    it("should succeed, mint both => price move up => liquidate fToken, 10% incentive", async () => {
      await oracle.setPrice(ethers.utils.parseEther("1000"));
      await treasury.initializePrice();
      await treasury.connect(market).mint(ethers.utils.parseEther("1"), deployer.address, 0);

      // 10% change
      await oracle.setPrice(ethers.utils.parseEther("1100"));
      expect((await treasury.getCurrentNav())._baseNav).to.eq(ethers.utils.parseEther("1100"));
      expect((await treasury.getCurrentNav())._fNav).to.eq(ethers.utils.parseEther("1.01"));
      expect((await treasury.getCurrentNav())._xNav).to.eq(ethers.utils.parseEther("1.19"));

      // redeem fToken
      expect(await fToken.balanceOf(deployer.address)).to.eq(ethers.utils.parseEther("500"));
      expect(await xToken.balanceOf(deployer.address)).to.eq(ethers.utils.parseEther("500"));
      expect(await treasury.totalBaseToken()).to.eq(ethers.utils.parseEther("1"));
      expect(await weth.balanceOf(market.address)).to.eq(constants.Zero);
      await treasury
        .connect(market)
        .liquidate(ethers.utils.parseEther("100"), ethers.utils.parseEther("0.1"), deployer.address);
      expect(await fToken.balanceOf(deployer.address)).to.eq(ethers.utils.parseEther("400"));
      expect(await xToken.balanceOf(deployer.address)).to.eq(ethers.utils.parseEther("500"));
      expect(await weth.balanceOf(market.address)).to.eq(ethers.utils.parseEther(".101"));
      expect(await treasury.totalBaseToken()).to.eq(ethers.utils.parseEther(".899"));
      expect(await fToken.nav()).to.closeToBn(ethers.utils.parseEther("0.975"), 100);
    });

    it("should compute #maxLiquidatable correctly, no incentive", async () => {
      await oracle.setPrice(ethers.utils.parseEther("1000"));
      await treasury.initializePrice();
      await treasury.connect(market).mint(ethers.utils.parseEther("1"), deployer.address, 0);

      // 10% change
      await oracle.setPrice(ethers.utils.parseEther("1100"));
      expect((await treasury.getCurrentNav())._baseNav).to.eq(ethers.utils.parseEther("1100"));
      expect((await treasury.getCurrentNav())._fNav).to.eq(ethers.utils.parseEther("1.01"));
      expect((await treasury.getCurrentNav())._xNav).to.eq(ethers.utils.parseEther("1.19"));

      expect(await treasury.collateralRatio()).to.eq(ethers.utils.parseEther("2.178217821782178217"));

      // make collateral ratio to 150%
      let [maxBaseOut, maxFTokenLiquidatable] = await treasury.maxLiquidatable(
        ethers.utils.parseEther("1.5"),
        constants.Zero
      );
      expect(maxFTokenLiquidatable).to.eq(constants.Zero);

      // make collateral ratio to 300%
      [maxBaseOut, maxFTokenLiquidatable] = await treasury.maxLiquidatable(
        ethers.utils.parseEther("3"),
        constants.Zero
      );
      expect(maxFTokenLiquidatable).to.eq(ethers.utils.parseEther("205.445544554455445544"));

      await treasury.connect(market).liquidate(maxFTokenLiquidatable, constants.Zero, deployer.address);
      expect(await weth.balanceOf(market.address)).to.closeToBn(maxBaseOut, 10000);
      expect(await treasury.collateralRatio()).to.closeToBn(ethers.utils.parseEther("3"), 100);
    });

    it("should compute #maxLiquidatable correctly, 10% incentive", async () => {
      await oracle.setPrice(ethers.utils.parseEther("1000"));
      await treasury.initializePrice();
      await treasury.connect(market).mint(ethers.utils.parseEther("1"), deployer.address, 0);

      // 10% change
      await oracle.setPrice(ethers.utils.parseEther("1100"));
      expect((await treasury.getCurrentNav())._baseNav).to.eq(ethers.utils.parseEther("1100"));
      expect((await treasury.getCurrentNav())._fNav).to.eq(ethers.utils.parseEther("1.01"));
      expect((await treasury.getCurrentNav())._xNav).to.eq(ethers.utils.parseEther("1.19"));

      expect(await treasury.collateralRatio()).to.eq(ethers.utils.parseEther("2.178217821782178217"));

      // make collateral ratio to 150%
      let [maxBaseOut, maxFTokenLiquidatable] = await treasury.maxLiquidatable(
        ethers.utils.parseEther("1.5"),
        ethers.utils.parseEther("0.1")
      );
      expect(maxFTokenLiquidatable).to.eq(constants.Zero);

      // make collateral ratio to 300%
      [maxBaseOut, maxFTokenLiquidatable] = await treasury.maxLiquidatable(
        ethers.utils.parseEther("3"),
        ethers.utils.parseEther("0.1")
      );
      expect(maxFTokenLiquidatable).to.eq(ethers.utils.parseEther("186.768676867686768676"));

      await treasury.connect(market).liquidate(maxFTokenLiquidatable, ethers.utils.parseEther("0.1"), deployer.address);
      expect(await weth.balanceOf(market.address)).to.closeToBn(maxBaseOut, 10000);
      expect(await treasury.collateralRatio()).to.closeToBn(ethers.utils.parseEther("3"), 100);
      expect(await fToken.nav()).to.eq(ethers.utils.parseEther("0.940373563218390804"));
      expect((await treasury.getCurrentNav())._baseNav).to.eq(ethers.utils.parseEther("1100"));
      expect((await treasury.getCurrentNav())._fNav).to.eq(ethers.utils.parseEther("0.949777298850574712"));
      expect((await treasury.getCurrentNav())._xNav).to.closeToBn(ethers.utils.parseEther("1.19"), 100);
    });
  });

  context("#selfLiquidate", async () => {
    it("should revert, when non-market call", async () => {
      await expect(treasury.selfLiquidate(constants.Zero, constants.Zero, constants.AddressZero, "0x")).to.revertedWith(
        "Only market"
      );
    });
  });

  context("#protocolSettle", async () => {
    it("should revert, when non-whitelist call", async () => {
      await expect(treasury.protocolSettle()).to.revertedWith("only settle whitelist");
    });

    it("should succeed", async () => {
      await treasury.updateSettleWhitelist(deployer.address, true);
      await oracle.setPrice(ethers.utils.parseEther("1000"));
      await treasury.initializePrice();
      await treasury.connect(market).mint(ethers.utils.parseEther("1"), signer.address, 0);

      await oracle.setPrice(ethers.utils.parseEther("2000"));
      await expect(treasury.protocolSettle())
        .to.emit(treasury, "ProtocolSettle")
        .withArgs(ethers.utils.parseEther("2000"), ethers.utils.parseEther("1.1"));
      expect(await treasury.lastPermissionedPrice()).to.eq(ethers.utils.parseEther("2000"));
      expect(await fToken.nav()).to.eq(ethers.utils.parseEther("1.1"));
    });
  });
});
