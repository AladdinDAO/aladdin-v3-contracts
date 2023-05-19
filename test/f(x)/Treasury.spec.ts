/* eslint-disable node/no-missing-import */
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { LeveragedToken, FractionalToken, Treasury, WETH9, MockTwapOracle } from "../../typechain";
import { BigNumber, constants } from "ethers";

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
  });

  context("#redeem", async () => {
    it("should revert, when non-market call", async () => {
      await expect(treasury.redeem(constants.Zero, constants.Zero, constants.AddressZero)).to.revertedWith(
        "Only market"
      );
    });
  });

  context("#addBaseToken", async () => {
    it("should revert, when non-market call", async () => {
      await expect(treasury.addBaseToken(constants.Zero, constants.Zero, constants.AddressZero)).to.revertedWith(
        "Only market"
      );
    });
  });

  context("#liquidate", async () => {
    it("should revert, when non-market call", async () => {
      await expect(treasury.liquidate(constants.Zero, constants.Zero, constants.AddressZero)).to.revertedWith(
        "Only market"
      );
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
