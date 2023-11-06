import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";

import { FractionalToken, LeveragedToken, MockTwapOracle, Treasury, WETH9 } from "@/types/index";
import { ZeroAddress } from "ethers";

const PRECISION = 10n ** 18n;

describe("Treasury.spec", async () => {
  let deployer: HardhatEthersSigner;
  let market: HardhatEthersSigner;
  let signer: HardhatEthersSigner;

  let weth: WETH9;
  let oracle: MockTwapOracle;
  let fToken: FractionalToken;
  let xToken: LeveragedToken;
  let treasury: Treasury;

  beforeEach(async () => {
    [deployer, market, signer] = await ethers.getSigners();

    const WETH9 = await ethers.getContractFactory("WETH9", deployer);
    weth = await WETH9.deploy();

    const MockTwapOracle = await ethers.getContractFactory("MockTwapOracle", deployer);
    oracle = await MockTwapOracle.deploy();

    const FractionalToken = await ethers.getContractFactory("FractionalToken", deployer);
    fToken = await FractionalToken.deploy();

    const LeveragedToken = await ethers.getContractFactory("LeveragedToken", deployer);
    xToken = await LeveragedToken.deploy();

    const Treasury = await ethers.getContractFactory("Treasury", deployer);
    treasury = await Treasury.deploy(ethers.parseEther("0.5"));

    await fToken.initialize(treasury.getAddress(), "Fractional ETH", "fETH");
    await xToken.initialize(treasury.getAddress(), fToken.getAddress(), "Leveraged ETH", "xETH");

    await treasury.initialize(
      market.address,
      weth.getAddress(),
      fToken.getAddress(),
      xToken.getAddress(),
      oracle.getAddress(),
      ethers.parseEther("0.1"),
      ethers.parseEther("1000"),
      ZeroAddress
    );

    await weth.deposit({ value: ethers.parseEther("100") });
    await weth.transfer(treasury.getAddress(), ethers.parseEther("100"));
  });

  context("auth", async () => {
    it("should revert, when intialize again", async () => {
      await expect(
        treasury.initialize(
          market.address,
          weth.getAddress(),
          fToken.getAddress(),
          xToken.getAddress(),
          oracle.getAddress(),
          ethers.parseEther("0.1"),
          ethers.parseEther("1000"),
          ZeroAddress
        )
      ).to.revertedWith("Initializable: contract is already initialized");
    });

    it("should initialize correctly", async () => {
      expect(await treasury.market()).to.eq(await market.getAddress());
      expect(await treasury.fToken()).to.eq(await fToken.getAddress());
      expect(await treasury.xToken()).to.eq(await xToken.getAddress());
      expect(await treasury.baseToken()).to.eq(await weth.getAddress());
      expect(await treasury.priceOracle()).to.eq(await oracle.getAddress());
      expect(await treasury.beta()).to.eq(ethers.parseEther("0.1"));
      expect(await treasury.lastPermissionedPrice()).to.eq(0n);
      expect(await treasury.totalBaseToken()).to.eq(0n);
      expect(await treasury.strategy()).to.eq(ZeroAddress);
      expect(await treasury.strategyUnderlying()).to.eq(0n);
    });

    context("#initializePrice", async () => {
      it("should revert, when non-owner call", async () => {
        await expect(treasury.connect(signer).initializePrice()).to.revertedWith("Ownable: caller is not the owner");
      });

      it("should succeed", async () => {
        await oracle.setPrice(ethers.parseEther("1111.1111"));
        await expect(treasury.initializePrice())
          .to.emit(treasury, "ProtocolSettle")
          .withArgs(ethers.parseEther("1111.1111"), PRECISION);
        expect(await treasury.lastPermissionedPrice()).to.eq(ethers.parseEther("1111.1111"));
        expect(await fToken.nav()).to.eq(PRECISION);

        await expect(treasury.initializePrice()).to.revertedWith("only initialize price once");
      });
    });

    context("#updateStrategy", async () => {
      it("should revert, when non-owner call", async () => {
        await expect(treasury.connect(signer).updateStrategy(ZeroAddress)).to.revertedWith(
          "Ownable: caller is not the owner"
        );
      });

      it("should succeed", async () => {
        expect(await treasury.strategy()).to.eq(ZeroAddress);
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
        expect(await treasury.beta()).to.eq(ethers.parseEther("0.1"));
        await expect(treasury.updateBeta(2)).to.emit(treasury, "UpdateBeta").withArgs(2);
        expect(await treasury.beta()).to.eq(2);
      });
    });

    context("#updatePriceOracle", async () => {
      it("should revert, when non-owner call", async () => {
        await expect(treasury.connect(signer).updatePriceOracle(ZeroAddress)).to.revertedWith(
          "Ownable: caller is not the owner"
        );
      });

      it("should succeed", async () => {
        expect(await treasury.priceOracle()).to.eq(await oracle.getAddress());
        await expect(treasury.updatePriceOracle(deployer.address))
          .to.emit(treasury, "UpdatePriceOracle")
          .withArgs(deployer.address);
        expect(await treasury.priceOracle()).to.eq(deployer.address);
      });
    });

    context("#updateSettleWhitelist", async () => {
      it("should revert, when non-owner call", async () => {
        await expect(treasury.connect(signer).updateSettleWhitelist(ZeroAddress, false)).to.revertedWith(
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
      await expect(treasury.mint(0n, ZeroAddress, 0)).to.revertedWith("Only market");
      await expect(treasury.mint(0n, ZeroAddress, 1)).to.revertedWith("Only market");
      await expect(treasury.mint(0n, ZeroAddress, 2)).to.revertedWith("Only market");
    });

    it("should succeed when mint both", async () => {
      await oracle.setPrice(ethers.parseEther("1000"));
      await treasury.initializePrice();

      await treasury.connect(market).mint(ethers.parseEther("1"), signer.address, 0);
      expect(await treasury.totalBaseToken()).to.eq(ethers.parseEther("1"));
      expect(await fToken.balanceOf(signer.address)).to.eq(ethers.parseEther("500"));
      expect(await xToken.balanceOf(signer.address)).to.eq(ethers.parseEther("500"));
    });

    it("should succeed, when mint fToken", async () => {
      await oracle.setPrice(ethers.parseEther("1000"));
      await treasury.initializePrice();
      await treasury.connect(market).mint(ethers.parseEther("1"), deployer.address, 0);

      await treasury.connect(market).mint(ethers.parseEther("1"), signer.address, 1);
      expect(await treasury.totalBaseToken()).to.eq(ethers.parseEther("2"));
      expect(await fToken.balanceOf(signer.address)).to.eq(ethers.parseEther("1000"));
    });

    it("should succeed, when mint xToken", async () => {
      await oracle.setPrice(ethers.parseEther("1000"));
      await treasury.initializePrice();
      await treasury.connect(market).mint(ethers.parseEther("1"), deployer.address, 0);

      await treasury.connect(market).mint(ethers.parseEther("1"), signer.address, 2);
      expect(await treasury.totalBaseToken()).to.eq(ethers.parseEther("2"));
      expect(await xToken.balanceOf(signer.address)).to.eq(ethers.parseEther("1000"));
    });

    it("should succeed, mint both => price move up => mint fToken", async () => {
      await oracle.setPrice(ethers.parseEther("1000"));
      await treasury.initializePrice();
      await treasury.connect(market).mint(ethers.parseEther("1"), deployer.address, 0);

      // 10% change
      await oracle.setPrice(ethers.parseEther("1100"));
      expect((await treasury.getCurrentNav())._baseNav).to.eq(ethers.parseEther("1100"));
      expect((await treasury.getCurrentNav())._fNav).to.eq(ethers.parseEther("1.01"));
      expect((await treasury.getCurrentNav())._xNav).to.eq(ethers.parseEther("1.19"));

      // mint fToken
      await treasury.connect(market).mint(ethers.parseEther("1"), signer.address, 1);
      expect(await treasury.totalBaseToken()).to.eq(ethers.parseEther("2"));
      expect(await fToken.balanceOf(signer.address)).to.eq(ethers.parseEther("1089.108910891089108910"));
    });

    it("should succeed, mint both => price move up => mint xToken", async () => {
      await oracle.setPrice(ethers.parseEther("1000"));
      await treasury.initializePrice();
      await treasury.connect(market).mint(ethers.parseEther("1"), deployer.address, 0);

      // 10% change
      await oracle.setPrice(ethers.parseEther("1100"));
      expect((await treasury.getCurrentNav())._baseNav).to.eq(ethers.parseEther("1100"));
      expect((await treasury.getCurrentNav())._fNav).to.eq(ethers.parseEther("1.01"));
      expect((await treasury.getCurrentNav())._xNav).to.eq(ethers.parseEther("1.19"));

      // mint xToken
      await treasury.connect(market).mint(ethers.parseEther("1"), signer.address, 2);
      expect(await treasury.totalBaseToken()).to.eq(ethers.parseEther("2"));
      expect(await xToken.balanceOf(signer.address)).to.eq(ethers.parseEther("924.369747899159663865"));
    });

    it("should compute #maxMintableFToken correctly", async () => {
      await oracle.setPrice(ethers.parseEther("1000"));
      await treasury.initializePrice();
      await treasury.connect(market).mint(ethers.parseEther("1"), deployer.address, 0);

      // 10% change
      await oracle.setPrice(ethers.parseEther("1100"));
      expect((await treasury.getCurrentNav())._baseNav).to.eq(ethers.parseEther("1100"));
      expect((await treasury.getCurrentNav())._fNav).to.eq(ethers.parseEther("1.01"));
      expect((await treasury.getCurrentNav())._xNav).to.eq(ethers.parseEther("1.19"));

      expect(await treasury.collateralRatio()).to.eq(ethers.parseEther("2.178217821782178217"));

      // make collateral ratio to 300%
      let [maxBaseIn, maxFTokenMintable] = await treasury.maxMintableFToken(ethers.parseEther("3"));
      expect(maxBaseIn).to.eq(0n);

      // make collateral ratio to 150%
      [maxBaseIn, maxFTokenMintable] = await treasury.maxMintableFToken(ethers.parseEther("1.5"));
      expect(maxBaseIn).to.eq(ethers.parseEther(".622727272727272727"));
      await treasury.connect(market).mint(maxBaseIn, signer.address, 1);
      expect(await fToken.balanceOf(signer.address)).to.closeTo(maxFTokenMintable, 10000);
      expect(await treasury.collateralRatio()).to.eq(ethers.parseEther("1.5"));
    });

    it("should compute #maxMintableXToken correctly", async () => {
      await oracle.setPrice(ethers.parseEther("1000"));
      await treasury.initializePrice();
      await treasury.connect(market).mint(ethers.parseEther("1"), deployer.address, 0);

      // 10% change
      await oracle.setPrice(ethers.parseEther("1100"));
      expect((await treasury.getCurrentNav())._baseNav).to.eq(ethers.parseEther("1100"));
      expect((await treasury.getCurrentNav())._fNav).to.eq(ethers.parseEther("1.01"));
      expect((await treasury.getCurrentNav())._xNav).to.eq(ethers.parseEther("1.19"));

      expect(await treasury.collateralRatio()).to.eq(ethers.parseEther("2.178217821782178217"));

      // make collateral ratio to 150%
      let [maxBaseIn, maxXTokenMintable] = await treasury.maxMintableXToken(ethers.parseEther("1.5"));
      expect(maxBaseIn).to.eq(0n);

      // make collateral ratio to 300%
      [maxBaseIn, maxXTokenMintable] = await treasury.maxMintableXToken(ethers.parseEther("3.0"));
      expect(maxBaseIn).to.eq(ethers.parseEther(".377272727272727272"));

      await treasury.connect(market).mint(maxBaseIn, signer.address, 2);
      expect(await xToken.balanceOf(signer.address)).to.closeTo(maxXTokenMintable, 10000);
      expect(await treasury.collateralRatio()).to.closeTo(ethers.parseEther("3"), 100);
    });
  });

  context("#redeem", async () => {
    it("should revert, when non-market call", async () => {
      await expect(treasury.redeem(0n, 0n, ZeroAddress)).to.revertedWith("Only market");
    });

    it("should succeed, mint both => price move up => redeem fToken", async () => {
      await oracle.setPrice(ethers.parseEther("1000"));
      await treasury.initializePrice();
      await treasury.connect(market).mint(ethers.parseEther("1"), deployer.address, 0);

      // 10% change
      await oracle.setPrice(ethers.parseEther("1100"));
      expect((await treasury.getCurrentNav())._baseNav).to.eq(ethers.parseEther("1100"));
      expect((await treasury.getCurrentNav())._fNav).to.eq(ethers.parseEther("1.01"));
      expect((await treasury.getCurrentNav())._xNav).to.eq(ethers.parseEther("1.19"));

      // redeem fToken
      expect(await fToken.balanceOf(deployer.address)).to.eq(ethers.parseEther("500"));
      expect(await xToken.balanceOf(deployer.address)).to.eq(ethers.parseEther("500"));
      expect(await treasury.totalBaseToken()).to.eq(ethers.parseEther("1"));
      expect(await weth.balanceOf(market.address)).to.eq(0n);
      await treasury.connect(market).redeem(ethers.parseEther("100"), 0n, deployer.address);
      expect(await fToken.balanceOf(deployer.address)).to.eq(ethers.parseEther("400"));
      expect(await xToken.balanceOf(deployer.address)).to.eq(ethers.parseEther("500"));
      expect(await weth.balanceOf(market.address)).to.eq(ethers.parseEther(".091818181818181818"));
      expect(await treasury.totalBaseToken()).to.eq(ethers.parseEther(".908181818181818182"));
    });

    it("should succeed, mint both => price move up => redeem xToken", async () => {
      await oracle.setPrice(ethers.parseEther("1000"));
      await treasury.initializePrice();
      await treasury.connect(market).mint(ethers.parseEther("1"), deployer.address, 0);

      // 10% change
      await oracle.setPrice(ethers.parseEther("1100"));
      expect((await treasury.getCurrentNav())._baseNav).to.eq(ethers.parseEther("1100"));
      expect((await treasury.getCurrentNav())._fNav).to.eq(ethers.parseEther("1.01"));
      expect((await treasury.getCurrentNav())._xNav).to.eq(ethers.parseEther("1.19"));

      // redeem fToken
      expect(await fToken.balanceOf(deployer.address)).to.eq(ethers.parseEther("500"));
      expect(await xToken.balanceOf(deployer.address)).to.eq(ethers.parseEther("500"));
      expect(await treasury.totalBaseToken()).to.eq(ethers.parseEther("1"));
      expect(await weth.balanceOf(market.address)).to.eq(0n);
      await treasury.connect(market).redeem(0n, ethers.parseEther("100"), deployer.address);
      expect(await fToken.balanceOf(deployer.address)).to.eq(ethers.parseEther("500"));
      expect(await xToken.balanceOf(deployer.address)).to.eq(ethers.parseEther("400"));
      expect(await weth.balanceOf(market.address)).to.eq(ethers.parseEther(".108181818181818181"));
      expect(await treasury.totalBaseToken()).to.eq(ethers.parseEther(".891818181818181819"));
    });

    it("should compute #maxRedeemableFToken correctly", async () => {
      await oracle.setPrice(ethers.parseEther("1000"));
      await treasury.initializePrice();
      await treasury.connect(market).mint(ethers.parseEther("1"), deployer.address, 0);

      // 10% change
      await oracle.setPrice(ethers.parseEther("1100"));
      expect((await treasury.getCurrentNav())._baseNav).to.eq(ethers.parseEther("1100"));
      expect((await treasury.getCurrentNav())._fNav).to.eq(ethers.parseEther("1.01"));
      expect((await treasury.getCurrentNav())._xNav).to.eq(ethers.parseEther("1.19"));

      expect(await treasury.collateralRatio()).to.eq(ethers.parseEther("2.178217821782178217"));

      // make collateral ratio to 150%
      let [maxBaseOut, maxXTokenRedeemable] = await treasury.maxRedeemableFToken(ethers.parseEther("1.5"));
      expect(maxXTokenRedeemable).to.eq(0n);

      // make collateral ratio to 300%
      [maxBaseOut, maxXTokenRedeemable] = await treasury.maxRedeemableFToken(ethers.parseEther("3"));
      expect(maxXTokenRedeemable).to.eq(ethers.parseEther("205.445544554455445544"));

      await treasury.connect(market).redeem(maxXTokenRedeemable, 0n, deployer.address);
      expect(await weth.balanceOf(market.address)).to.closeTo(maxBaseOut, 10000);
      expect(await treasury.collateralRatio()).to.closeTo(ethers.parseEther("3"), 100);
    });

    it("should compute #maxRedeemableXToken correctly", async () => {
      await oracle.setPrice(ethers.parseEther("1000"));
      await treasury.initializePrice();
      await treasury.connect(market).mint(ethers.parseEther("1"), deployer.address, 0);

      // 10% change
      await oracle.setPrice(ethers.parseEther("1100"));
      expect((await treasury.getCurrentNav())._baseNav).to.eq(ethers.parseEther("1100"));
      expect((await treasury.getCurrentNav())._fNav).to.eq(ethers.parseEther("1.01"));
      expect((await treasury.getCurrentNav())._xNav).to.eq(ethers.parseEther("1.19"));

      expect(await treasury.collateralRatio()).to.eq(ethers.parseEther("2.178217821782178217"));

      // make collateral ratio to 300%
      let [maxBaseOut, maxXTokenRedeemable] = await treasury.maxRedeemableXToken(ethers.parseEther("3"));
      expect(maxXTokenRedeemable).to.eq(0n);

      // make collateral ratio to 150%
      [maxBaseOut, maxXTokenRedeemable] = await treasury.maxRedeemableXToken(ethers.parseEther("1.5"));
      expect(maxXTokenRedeemable).to.eq(ethers.parseEther("287.815126050420168067"));

      await treasury.connect(market).redeem(0n, maxXTokenRedeemable, deployer.address);
      expect(await weth.balanceOf(market.address)).to.closeTo(maxBaseOut, 10000);
      expect(await treasury.collateralRatio()).to.closeTo(ethers.parseEther("1.5"), 100);
    });
  });

  context("#addBaseToken", async () => {
    it("should revert, when non-market call", async () => {
      await expect(treasury.addBaseToken(0n, 0n, ZeroAddress)).to.revertedWith("Only market");
    });

    it("should succeed, mint both => price move up => add base token, no incentive", async () => {
      await oracle.setPrice(ethers.parseEther("1000"));
      await treasury.initializePrice();
      await treasury.connect(market).mint(ethers.parseEther("1"), deployer.address, 0);

      // 10% change
      await oracle.setPrice(ethers.parseEther("1100"));
      expect((await treasury.getCurrentNav())._baseNav).to.eq(ethers.parseEther("1100"));
      expect((await treasury.getCurrentNav())._fNav).to.eq(ethers.parseEther("1.01"));
      expect((await treasury.getCurrentNav())._xNav).to.eq(ethers.parseEther("1.19"));

      // mint xToken
      await treasury.connect(market).addBaseToken(ethers.parseEther("1"), 0n, signer.address);
      expect(await treasury.totalBaseToken()).to.eq(ethers.parseEther("2"));
      expect(await xToken.balanceOf(signer.address)).to.eq(ethers.parseEther("924.369747899159663865"));
    });

    it("should succeed, mint both => price move up => add base token, 10% incentive", async () => {
      await oracle.setPrice(ethers.parseEther("1000"));
      await treasury.initializePrice();
      await treasury.connect(market).mint(ethers.parseEther("1"), deployer.address, 0);

      // 10% change
      await oracle.setPrice(ethers.parseEther("1100"));
      expect((await treasury.getCurrentNav())._baseNav).to.eq(ethers.parseEther("1100"));
      expect((await treasury.getCurrentNav())._fNav).to.eq(ethers.parseEther("1.01"));
      expect((await treasury.getCurrentNav())._xNav).to.eq(ethers.parseEther("1.19"));

      // mint xToken
      await treasury.connect(market).addBaseToken(ethers.parseEther("1"), ethers.parseEther("0.1"), signer.address);
      expect(await treasury.totalBaseToken()).to.eq(ethers.parseEther("2"));
      expect(await xToken.balanceOf(signer.address)).to.closeTo(ethers.parseEther("1016.806722689075630251"), 100);
      expect(await fToken.nav()).to.closeTo(ethers.parseEther(".782178217821782180"), 100);
    });

    it("should compute #maxMintableXTokenWithIncentive correctly, no incentive", async () => {
      await oracle.setPrice(ethers.parseEther("1000"));
      await treasury.initializePrice();
      await treasury.connect(market).mint(ethers.parseEther("1"), deployer.address, 0);

      // 10% change
      await oracle.setPrice(ethers.parseEther("1100"));
      expect((await treasury.getCurrentNav())._baseNav).to.eq(ethers.parseEther("1100"));
      expect((await treasury.getCurrentNav())._fNav).to.eq(ethers.parseEther("1.01"));
      expect((await treasury.getCurrentNav())._xNav).to.eq(ethers.parseEther("1.19"));

      expect(await treasury.collateralRatio()).to.eq(ethers.parseEther("2.178217821782178217"));

      // make collateral ratio to 150%, no incentive
      let [maxBaseIn, maxXTokenMintable] = await treasury.maxMintableXTokenWithIncentive(ethers.parseEther("1.5"), 0n);
      expect(maxBaseIn).to.eq(0n);

      // make collateral ratio to 300%, no incentive
      [maxBaseIn, maxXTokenMintable] = await treasury.maxMintableXTokenWithIncentive(ethers.parseEther("3.0"), 0n);
      expect(maxBaseIn).to.eq(ethers.parseEther(".377272727272727272"));

      await treasury.connect(market).addBaseToken(maxBaseIn, 0n, signer.address);
      expect(await xToken.balanceOf(signer.address)).to.closeTo(maxXTokenMintable, 10000);
      expect(await treasury.collateralRatio()).to.closeTo(ethers.parseEther("3"), 100);
    });

    it("should compute #maxMintableXTokenWithIncentive correctly, 10% incentive", async () => {
      await oracle.setPrice(ethers.parseEther("1000"));
      await treasury.initializePrice();
      await treasury.connect(market).mint(ethers.parseEther("1"), deployer.address, 0);

      // 10% change
      await oracle.setPrice(ethers.parseEther("1100"));
      expect((await treasury.getCurrentNav())._baseNav).to.eq(ethers.parseEther("1100"));
      expect((await treasury.getCurrentNav())._fNav).to.eq(ethers.parseEther("1.01"));
      expect((await treasury.getCurrentNav())._xNav).to.eq(ethers.parseEther("1.19"));

      expect(await treasury.collateralRatio()).to.eq(ethers.parseEther("2.178217821782178217"));

      // make collateral ratio to 150%, no incentive
      let [maxBaseIn, maxXTokenMintable] = await treasury.maxMintableXTokenWithIncentive(
        ethers.parseEther("1.5"),
        ethers.parseEther("0.1")
      );
      expect(maxBaseIn).to.eq(0n);

      // make collateral ratio to 300%, no incentive
      [maxBaseIn, maxXTokenMintable] = await treasury.maxMintableXTokenWithIncentive(
        ethers.parseEther("3.0"),
        ethers.parseEther("0.1")
      );
      expect(maxBaseIn).to.eq(ethers.parseEther(".290209790209790209"));

      await treasury.connect(market).addBaseToken(maxBaseIn, ethers.parseEther("0.1"), signer.address);
      expect(await xToken.balanceOf(signer.address)).to.closeTo(maxXTokenMintable, 10000);
      expect(await treasury.collateralRatio()).to.closeTo(ethers.parseEther("3"), 100);
      expect(await fToken.nav()).to.eq(ethers.parseEther("0.936785986290936787"));
    });
  });

  context("#liquidate", async () => {
    it("should revert, when non-market call", async () => {
      await expect(treasury.liquidate(0n, 0n, ZeroAddress)).to.revertedWith("Only market");
    });

    it("should succeed, mint both => price move up => liquidate fToken, no incentive", async () => {
      await oracle.setPrice(ethers.parseEther("1000"));
      await treasury.initializePrice();
      await treasury.connect(market).mint(ethers.parseEther("1"), deployer.address, 0);

      // 10% change
      await oracle.setPrice(ethers.parseEther("1100"));
      expect((await treasury.getCurrentNav())._baseNav).to.eq(ethers.parseEther("1100"));
      expect((await treasury.getCurrentNav())._fNav).to.eq(ethers.parseEther("1.01"));
      expect((await treasury.getCurrentNav())._xNav).to.eq(ethers.parseEther("1.19"));

      // redeem fToken
      expect(await fToken.balanceOf(deployer.address)).to.eq(ethers.parseEther("500"));
      expect(await xToken.balanceOf(deployer.address)).to.eq(ethers.parseEther("500"));
      expect(await treasury.totalBaseToken()).to.eq(ethers.parseEther("1"));
      expect(await weth.balanceOf(market.address)).to.eq(0n);
      await treasury.connect(market).liquidate(ethers.parseEther("100"), 0n, deployer.address);
      expect(await fToken.balanceOf(deployer.address)).to.eq(ethers.parseEther("400"));
      expect(await xToken.balanceOf(deployer.address)).to.eq(ethers.parseEther("500"));
      expect(await weth.balanceOf(market.address)).to.eq(ethers.parseEther(".091818181818181818"));
      expect(await treasury.totalBaseToken()).to.eq(ethers.parseEther(".908181818181818182"));
    });

    it("should succeed, mint both => price move up => liquidate fToken, 10% incentive", async () => {
      await oracle.setPrice(ethers.parseEther("1000"));
      await treasury.initializePrice();
      await treasury.connect(market).mint(ethers.parseEther("1"), deployer.address, 0);

      // 10% change
      await oracle.setPrice(ethers.parseEther("1100"));
      expect((await treasury.getCurrentNav())._baseNav).to.eq(ethers.parseEther("1100"));
      expect((await treasury.getCurrentNav())._fNav).to.eq(ethers.parseEther("1.01"));
      expect((await treasury.getCurrentNav())._xNav).to.eq(ethers.parseEther("1.19"));

      // redeem fToken
      expect(await fToken.balanceOf(deployer.address)).to.eq(ethers.parseEther("500"));
      expect(await xToken.balanceOf(deployer.address)).to.eq(ethers.parseEther("500"));
      expect(await treasury.totalBaseToken()).to.eq(ethers.parseEther("1"));
      expect(await weth.balanceOf(market.address)).to.eq(0n);
      await treasury.connect(market).liquidate(ethers.parseEther("100"), ethers.parseEther("0.1"), deployer.address);
      expect(await fToken.balanceOf(deployer.address)).to.eq(ethers.parseEther("400"));
      expect(await xToken.balanceOf(deployer.address)).to.eq(ethers.parseEther("500"));
      expect(await weth.balanceOf(market.address)).to.eq(ethers.parseEther(".101"));
      expect(await treasury.totalBaseToken()).to.eq(ethers.parseEther(".899"));
      expect(await fToken.nav()).to.closeTo(ethers.parseEther("0.975"), 100);
    });

    it("should compute #maxLiquidatable correctly, no incentive", async () => {
      await oracle.setPrice(ethers.parseEther("1000"));
      await treasury.initializePrice();
      await treasury.connect(market).mint(ethers.parseEther("1"), deployer.address, 0);

      // 10% change
      await oracle.setPrice(ethers.parseEther("1100"));
      expect((await treasury.getCurrentNav())._baseNav).to.eq(ethers.parseEther("1100"));
      expect((await treasury.getCurrentNav())._fNav).to.eq(ethers.parseEther("1.01"));
      expect((await treasury.getCurrentNav())._xNav).to.eq(ethers.parseEther("1.19"));

      expect(await treasury.collateralRatio()).to.eq(ethers.parseEther("2.178217821782178217"));

      // make collateral ratio to 150%
      let [maxBaseOut, maxFTokenLiquidatable] = await treasury.maxLiquidatable(ethers.parseEther("1.5"), 0n);
      expect(maxFTokenLiquidatable).to.eq(0n);

      // make collateral ratio to 300%
      [maxBaseOut, maxFTokenLiquidatable] = await treasury.maxLiquidatable(ethers.parseEther("3"), 0n);
      expect(maxFTokenLiquidatable).to.eq(ethers.parseEther("205.445544554455445544"));

      await treasury.connect(market).liquidate(maxFTokenLiquidatable, 0n, deployer.address);
      expect(await weth.balanceOf(market.address)).to.closeTo(maxBaseOut, 10000);
      expect(await treasury.collateralRatio()).to.closeTo(ethers.parseEther("3"), 100);
    });

    it("should compute #maxLiquidatable correctly, 10% incentive", async () => {
      await oracle.setPrice(ethers.parseEther("1000"));
      await treasury.initializePrice();
      await treasury.connect(market).mint(ethers.parseEther("1"), deployer.address, 0);

      // 10% change
      await oracle.setPrice(ethers.parseEther("1100"));
      expect((await treasury.getCurrentNav())._baseNav).to.eq(ethers.parseEther("1100"));
      expect((await treasury.getCurrentNav())._fNav).to.eq(ethers.parseEther("1.01"));
      expect((await treasury.getCurrentNav())._xNav).to.eq(ethers.parseEther("1.19"));

      expect(await treasury.collateralRatio()).to.eq(ethers.parseEther("2.178217821782178217"));

      // make collateral ratio to 150%
      let [maxBaseOut, maxFTokenLiquidatable] = await treasury.maxLiquidatable(
        ethers.parseEther("1.5"),
        ethers.parseEther("0.1")
      );
      expect(maxFTokenLiquidatable).to.eq(0n);

      // make collateral ratio to 300%
      [maxBaseOut, maxFTokenLiquidatable] = await treasury.maxLiquidatable(
        ethers.parseEther("3"),
        ethers.parseEther("0.1")
      );
      expect(maxFTokenLiquidatable).to.eq(ethers.parseEther("186.768676867686768676"));

      await treasury.connect(market).liquidate(maxFTokenLiquidatable, ethers.parseEther("0.1"), deployer.address);
      expect(await weth.balanceOf(market.address)).to.closeTo(maxBaseOut, 10000);
      expect(await treasury.collateralRatio()).to.closeTo(ethers.parseEther("3"), 100);
      expect(await fToken.nav()).to.eq(ethers.parseEther("0.940373563218390804"));
      expect((await treasury.getCurrentNav())._baseNav).to.eq(ethers.parseEther("1100"));
      expect((await treasury.getCurrentNav())._fNav).to.eq(ethers.parseEther("0.949777298850574712"));
      expect((await treasury.getCurrentNav())._xNav).to.closeTo(ethers.parseEther("1.19"), 100);
    });
  });

  context("#protocolSettle", async () => {
    it("should revert, when non-whitelist call", async () => {
      await expect(treasury.protocolSettle()).to.revertedWith("only settle whitelist");
    });

    it("should succeed", async () => {
      await treasury.updateSettleWhitelist(deployer.address, true);
      await oracle.setPrice(ethers.parseEther("1000"));
      await treasury.initializePrice();
      await treasury.connect(market).mint(ethers.parseEther("1"), signer.address, 0);

      await oracle.setPrice(ethers.parseEther("2000"));
      await expect(treasury.protocolSettle())
        .to.emit(treasury, "ProtocolSettle")
        .withArgs(ethers.parseEther("2000"), ethers.parseEther("1.1"));
      expect(await treasury.lastPermissionedPrice()).to.eq(ethers.parseEther("2000"));
      expect(await fToken.nav()).to.eq(ethers.parseEther("1.1"));
    });
  });
});
