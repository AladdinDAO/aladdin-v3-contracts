import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";

import { FractionalToken, LeveragedToken, Market, MockTwapOracle, Treasury, WETH9 } from "@/types/index";
import { MaxUint256, ZeroAddress } from "ethers";

const PRECISION = 10n ** 18n;

describe("Market.spec", async () => {
  let deployer: HardhatEthersSigner;
  let signer: HardhatEthersSigner;
  let platform: HardhatEthersSigner;

  let weth: WETH9;
  let oracle: MockTwapOracle;
  let fToken: FractionalToken;
  let xToken: LeveragedToken;
  let treasury: Treasury;
  let market: Market;

  beforeEach(async () => {
    [deployer, signer, platform] = await ethers.getSigners();

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

    const Market = await ethers.getContractFactory("Market", deployer);
    market = await Market.deploy();

    await fToken.initialize(treasury.getAddress(), "Fractional ETH", "fETH");
    await xToken.initialize(treasury.getAddress(), fToken.getAddress(), "Leveraged ETH", "xETH");

    await treasury.initialize(
      market.getAddress(),
      weth.getAddress(),
      fToken.getAddress(),
      xToken.getAddress(),
      oracle.getAddress(),
      ethers.parseEther("0.1"),
      MaxUint256,
      ZeroAddress
    );

    await market.initialize(treasury.getAddress(), platform.address);
    await market.updateMarketConfig(
      ethers.parseEther("1.3"),
      ethers.parseEther("1.2"),
      ethers.parseEther("1.14"),
      ethers.parseEther("1")
    );
  });

  context("auth", async () => {
    it("should revert, when intialize again", async () => {
      await expect(market.initialize(treasury.getAddress(), platform.address)).to.revertedWith(
        "Initializable: contract is already initialized"
      );
    });

    it("should initialize correctly", async () => {
      expect(await market.treasury()).to.eq(await treasury.getAddress());
      expect(await market.platform()).to.eq(platform.address);
      expect(await market.fToken()).to.eq(await fToken.getAddress());
      expect(await market.xToken()).to.eq(await xToken.getAddress());
      expect(await market.baseToken()).to.eq(await weth.getAddress());
    });

    context("#updateRedeemFeeRatio", async () => {
      it("should revert, when non-owner call", async () => {
        await expect(market.connect(signer).updateRedeemFeeRatio(0, 0, false)).to.revertedWith("only Admin");
        await expect(market.connect(signer).updateRedeemFeeRatio(0, 0, true)).to.revertedWith("only Admin");
      });

      it("should revert, when default fee too large", async () => {
        await expect(market.updateRedeemFeeRatio(PRECISION + 1n, 0, false)).to.revertedWith(
          "default fee ratio too large"
        );
        await expect(market.updateRedeemFeeRatio(PRECISION + 1n, 0, true)).to.revertedWith(
          "default fee ratio too large"
        );
      });

      it("should revert, when delta fee too small", async () => {
        await expect(market.updateRedeemFeeRatio(2, -3, false)).to.revertedWith("delta fee too small");
        await expect(market.updateRedeemFeeRatio(2, -3, true)).to.revertedWith("delta fee too small");
      });

      it("should revert, when total fee too large", async () => {
        await expect(market.updateRedeemFeeRatio(PRECISION, 1, false)).to.revertedWith("total fee too large");
        await expect(market.updateRedeemFeeRatio(PRECISION, 1, true)).to.revertedWith("total fee too large");
      });

      it("should succeed when update for fToken", async () => {
        await expect(market.updateRedeemFeeRatio(1, 2, true))
          .to.emit(market, "UpdateRedeemFeeRatioFToken")
          .withArgs(1, 2);

        expect((await market.fTokenRedeemFeeRatio()).defaultFeeRatio).to.eq(1);
        expect((await market.fTokenRedeemFeeRatio()).extraFeeRatio).to.eq(2);
        expect((await market.xTokenRedeemFeeRatio()).defaultFeeRatio).to.eq(0n);
        expect((await market.xTokenRedeemFeeRatio()).extraFeeRatio).to.eq(0n);
      });

      it("should succeed when update for xToken", async () => {
        await expect(market.updateRedeemFeeRatio(1, 2, false))
          .to.emit(market, "UpdateRedeemFeeRatioXToken")
          .withArgs(1, 2);

        expect((await market.fTokenRedeemFeeRatio()).defaultFeeRatio).to.eq(0n);
        expect((await market.fTokenRedeemFeeRatio()).extraFeeRatio).to.eq(0n);
        expect((await market.xTokenRedeemFeeRatio()).defaultFeeRatio).to.eq(1);
        expect((await market.xTokenRedeemFeeRatio()).extraFeeRatio).to.eq(2);
      });
    });

    context("#updateMintFeeRatio", async () => {
      it("should revert, when non-owner call", async () => {
        await expect(market.connect(signer).updateMintFeeRatio(0, 0, false)).to.revertedWith("only Admin");
        await expect(market.connect(signer).updateMintFeeRatio(0, 0, true)).to.revertedWith("only Admin");
      });

      it("should revert, when default fee too large", async () => {
        await expect(market.updateMintFeeRatio(PRECISION + 1n, 0, false)).to.revertedWith(
          "default fee ratio too large"
        );
        await expect(market.updateMintFeeRatio(PRECISION + 1n, 0, true)).to.revertedWith("default fee ratio too large");
      });

      it("should revert, when delta fee too small", async () => {
        await expect(market.updateMintFeeRatio(2, -3, false)).to.revertedWith("delta fee too small");
        await expect(market.updateMintFeeRatio(2, -3, true)).to.revertedWith("delta fee too small");
      });

      it("should revert, when total fee too large", async () => {
        await expect(market.updateMintFeeRatio(PRECISION, 1, false)).to.revertedWith("total fee too large");
        await expect(market.updateMintFeeRatio(PRECISION, 1, true)).to.revertedWith("total fee too large");
      });

      it("should succeed when update for fToken", async () => {
        await expect(market.updateMintFeeRatio(1, 2, true)).to.emit(market, "UpdateMintFeeRatioFToken").withArgs(1, 2);

        expect((await market.fTokenMintFeeRatio()).defaultFeeRatio).to.eq(1);
        expect((await market.fTokenMintFeeRatio()).extraFeeRatio).to.eq(2);
        expect((await market.xTokenMintFeeRatio()).defaultFeeRatio).to.eq(0n);
        expect((await market.xTokenMintFeeRatio()).extraFeeRatio).to.eq(0n);
      });

      it("should succeed when update for xToken", async () => {
        await expect(market.updateMintFeeRatio(1, 2, false)).to.emit(market, "UpdateMintFeeRatioXToken").withArgs(1, 2);

        expect((await market.fTokenMintFeeRatio()).defaultFeeRatio).to.eq(0n);
        expect((await market.fTokenMintFeeRatio()).extraFeeRatio).to.eq(0n);
        expect((await market.xTokenMintFeeRatio()).defaultFeeRatio).to.eq(1);
        expect((await market.xTokenMintFeeRatio()).extraFeeRatio).to.eq(2);
      });
    });

    context("#updateMarketConfig", async () => {
      it("should revert, when non-owner call", async () => {
        await expect(market.connect(signer).updateMarketConfig(1, 2, 3, 4)).to.revertedWith("only Admin");
      });

      it("should revert, when invalid param", async () => {
        await expect(market.updateMarketConfig(1, 2, 3, 4)).to.revertedWith("invalid market config");
        await expect(market.updateMarketConfig(1000, 2, 3, 4)).to.revertedWith("invalid market config");
        await expect(market.updateMarketConfig(9000, 8000, 3, 4)).to.revertedWith("invalid market config");
        await expect(market.updateMarketConfig(9000, 8000, 7000, 4)).to.revertedWith("invalid market config");
        await expect(market.updateMarketConfig(9000, 8000, 7000, 6000)).to.revertedWith("invalid market config");
      });

      it("should succeed", async () => {
        expect((await market.marketConfig()).stabilityRatio).to.eq(ethers.parseEther("1.3"));
        expect((await market.marketConfig()).liquidationRatio).to.eq(ethers.parseEther("1.2"));
        expect((await market.marketConfig()).selfLiquidationRatio).to.eq(ethers.parseEther("1.14"));
        expect((await market.marketConfig()).recapRatio).to.eq(ethers.parseEther("1"));
        await expect(
          market.updateMarketConfig(
            ethers.parseEther("1.5"),
            ethers.parseEther("1.4"),
            ethers.parseEther("1.3"),
            ethers.parseEther("1.2")
          )
        )
          .to.emit(market, "UpdateMarketConfig")
          .withArgs(
            ethers.parseEther("1.5"),
            ethers.parseEther("1.4"),
            ethers.parseEther("1.3"),
            ethers.parseEther("1.2")
          );
        expect((await market.marketConfig()).stabilityRatio).to.eq(ethers.parseEther("1.5"));
        expect((await market.marketConfig()).liquidationRatio).to.eq(ethers.parseEther("1.4"));
        expect((await market.marketConfig()).selfLiquidationRatio).to.eq(ethers.parseEther("1.3"));
        expect((await market.marketConfig()).recapRatio).to.eq(ethers.parseEther("1.2"));
      });
    });

    context("#updateIncentiveConfig", async () => {
      it("should revert, when non-owner call", async () => {
        await expect(market.connect(signer).updateIncentiveConfig(1, 2, 3)).to.revertedWith("only Admin");
      });

      it("should revert, when incentive too small", async () => {
        await expect(market.updateIncentiveConfig(0, 1, 2)).to.revertedWith("incentive too small");
        await expect(market.updateIncentiveConfig(1, 1, 0)).to.revertedWith("incentive too small");
      });

      it("should revert, when invalid incentive config", async () => {
        await expect(market.updateIncentiveConfig(1000, 2, 3)).to.revertedWith("invalid incentive config");
      });

      it("should succeed", async () => {
        expect((await market.incentiveConfig()).stabilityIncentiveRatio).to.eq(0n);
        expect((await market.incentiveConfig()).liquidationIncentiveRatio).to.eq(0n);
        expect((await market.incentiveConfig()).selfLiquidationIncentiveRatio).to.eq(0n);
        await expect(
          market.updateIncentiveConfig(ethers.parseEther("0.3"), ethers.parseEther("0.2"), ethers.parseEther("0.1"))
        )
          .to.emit(market, "UpdateIncentiveConfig")
          .withArgs(ethers.parseEther("0.3"), ethers.parseEther("0.2"), ethers.parseEther("0.1"));
        expect((await market.incentiveConfig()).stabilityIncentiveRatio).to.eq(ethers.parseEther("0.3"));
        expect((await market.incentiveConfig()).liquidationIncentiveRatio).to.eq(ethers.parseEther("0.2"));
        expect((await market.incentiveConfig()).selfLiquidationIncentiveRatio).to.eq(ethers.parseEther("0.1"));
      });
    });

    context("#updatePlatform", async () => {
      it("should revert, when non-owner call", async () => {
        await expect(market.connect(signer).updatePlatform(ZeroAddress)).to.revertedWith("only Admin");
      });

      it("should succeed", async () => {
        expect(await market.platform()).to.eq(platform.address);
        await expect(market.updatePlatform(deployer.address))
          .to.emit(market, "UpdatePlatform")
          .withArgs(deployer.address);
        expect(await market.platform()).to.eq(deployer.address);
      });
    });

    context("#updateLiquidationWhitelist", async () => {
      it("should revert, when non-owner call", async () => {
        await expect(market.connect(signer).updateLiquidationWhitelist(ZeroAddress, false)).to.revertedWith(
          "only Admin"
        );
      });

      it("should succeed", async () => {
        expect(await market.liquidationWhitelist(deployer.address)).to.eq(false);
        await expect(market.updateLiquidationWhitelist(deployer.address, true))
          .to.emit(market, "UpdateLiquidationWhitelist")
          .withArgs(deployer.address, true);
        expect(await market.liquidationWhitelist(deployer.address)).to.eq(true);
        await expect(market.updateLiquidationWhitelist(deployer.address, false))
          .to.emit(market, "UpdateLiquidationWhitelist")
          .withArgs(deployer.address, false);
        expect(await market.liquidationWhitelist(deployer.address)).to.eq(false);
      });
    });

    context("#pauseMint", async () => {
      it("should revert, when non-owner call", async () => {
        await expect(market.connect(signer).pauseMint(false)).to.revertedWith("only Emergency DAO");
        await expect(market.connect(signer).pauseMint(true)).to.revertedWith("only Emergency DAO");
      });

      it("should succeed", async () => {
        await market.grantRole(await market.EMERGENCY_DAO_ROLE(), deployer.address);

        expect(await market.mintPaused()).to.eq(false);
        await expect(market.pauseMint(true)).to.emit(market, "PauseMint").withArgs(true);
        expect(await market.mintPaused()).to.eq(true);
        await expect(market.pauseMint(false)).to.emit(market, "PauseMint").withArgs(false);
        expect(await market.mintPaused()).to.eq(false);
      });
    });

    context("#pauseRedeem", async () => {
      it("should revert, when non-owner call", async () => {
        await expect(market.connect(signer).pauseRedeem(false)).to.revertedWith("only Emergency DAO");
        await expect(market.connect(signer).pauseRedeem(true)).to.revertedWith("only Emergency DAO");
      });

      it("should succeed", async () => {
        await market.grantRole(await market.EMERGENCY_DAO_ROLE(), deployer.address);

        expect(await market.redeemPaused()).to.eq(false);
        await expect(market.pauseRedeem(true)).to.emit(market, "PauseRedeem").withArgs(true);
        expect(await market.redeemPaused()).to.eq(true);
        await expect(market.pauseRedeem(false)).to.emit(market, "PauseRedeem").withArgs(false);
        expect(await market.redeemPaused()).to.eq(false);
      });
    });

    context("#pauseFTokenMintInSystemStabilityMode", async () => {
      it("should revert, when non-owner call", async () => {
        await expect(market.connect(signer).pauseFTokenMintInSystemStabilityMode(false)).to.revertedWith(
          "only Emergency DAO"
        );
        await expect(market.connect(signer).pauseFTokenMintInSystemStabilityMode(true)).to.revertedWith(
          "only Emergency DAO"
        );
      });

      it("should succeed", async () => {
        await market.grantRole(await market.EMERGENCY_DAO_ROLE(), deployer.address);

        expect(await market.fTokenMintInSystemStabilityModePaused()).to.eq(false);
        await expect(market.pauseFTokenMintInSystemStabilityMode(true))
          .to.emit(market, "PauseFTokenMintInSystemStabilityMode")
          .withArgs(true);
        expect(await market.fTokenMintInSystemStabilityModePaused()).to.eq(true);
        await expect(market.pauseFTokenMintInSystemStabilityMode(false))
          .to.emit(market, "PauseFTokenMintInSystemStabilityMode")
          .withArgs(false);
        expect(await market.fTokenMintInSystemStabilityModePaused()).to.eq(false);
      });
    });

    context("#pauseXTokenRedeemInSystemStabilityMode", async () => {
      it("should revert, when non-owner call", async () => {
        await expect(market.connect(signer).pauseXTokenRedeemInSystemStabilityMode(false)).to.revertedWith(
          "only Emergency DAO"
        );
        await expect(market.connect(signer).pauseXTokenRedeemInSystemStabilityMode(true)).to.revertedWith(
          "only Emergency DAO"
        );
      });

      it("should succeed", async () => {
        await market.grantRole(await market.EMERGENCY_DAO_ROLE(), deployer.address);

        expect(await market.xTokenRedeemInSystemStabilityModePaused()).to.eq(false);
        await expect(market.pauseXTokenRedeemInSystemStabilityMode(true))
          .to.emit(market, "PauseXTokenRedeemInSystemStabilityMode")
          .withArgs(true);
        expect(await market.xTokenRedeemInSystemStabilityModePaused()).to.eq(true);
        await expect(market.pauseXTokenRedeemInSystemStabilityMode(false))
          .to.emit(market, "PauseXTokenRedeemInSystemStabilityMode")
          .withArgs(false);
        expect(await market.xTokenRedeemInSystemStabilityModePaused()).to.eq(false);
      });
    });
  });

  context("mint both", async () => {
    beforeEach(async () => {
      await oracle.setPrice(ethers.parseEther("1000"));
      await treasury.initializePrice();
      await weth.deposit({ value: ethers.parseEther("10") });

      await weth.approve(market.getAddress(), MaxUint256);
    });

    it("should revert, when mint zero amount", async () => {
      await expect(market.mint(ZeroAddress, signer.address, 0, 0)).to.revertedWith("mint zero amount");
    });

    it("should revert, when initialize multiple times", async () => {
      await market.mint(ethers.parseEther("1"), signer.address, 0, 0);

      await expect(market.mint(ethers.parseEther("1"), signer.address, 0, 0)).to.revertedWith("only initialize once");
    });

    it("should succeed", async () => {
      await expect(market.mint(ethers.parseEther("1"), signer.address, 0, 0))
        .to.emit(market, "Mint")
        .withArgs(
          deployer.address,
          signer.address,
          ethers.parseEther("1"),
          ethers.parseEther("500"),
          ethers.parseEther("500"),
          0n
        );
      expect(await treasury.totalBaseToken()).to.eq(ethers.parseEther("1"));
      expect(await weth.balanceOf(treasury.getAddress())).to.eq(ethers.parseEther("1"));
    });
  });

  context("mint fToken", async () => {
    beforeEach(async () => {
      await oracle.setPrice(ethers.parseEther("1000"));
      await treasury.initializePrice();
      await weth.deposit({ value: ethers.parseEther("10") });

      await weth.approve(market.getAddress(), MaxUint256);
      await market.mint(ethers.parseEther("1"), deployer.address, 0, 0);
    });

    it("should revert, when mint zero amount", async () => {
      await expect(market.mintFToken(ZeroAddress, signer.address, 0)).to.revertedWith("mint zero amount");
    });

    it("should revert, when mint paused", async () => {
      await market.grantRole(await market.EMERGENCY_DAO_ROLE(), deployer.address);
      await market.pauseMint(true);
      await expect(market.mintFToken(1, signer.address, 0)).to.revertedWith("mint is paused");
    });

    it("should succeed", async () => {
      await expect(market.mintFToken(ethers.parseEther("1"), signer.address, 0))
        .to.emit(market, "Mint")
        .withArgs(deployer.address, signer.address, ethers.parseEther("1"), ethers.parseEther("1000"), 0n, 0n);
      expect(await fToken.balanceOf(signer.address)).to.eq(ethers.parseEther("1000"));
    });
  });

  context("mint xToken", async () => {
    beforeEach(async () => {
      await oracle.setPrice(ethers.parseEther("1000"));
      await treasury.initializePrice();
      await weth.deposit({ value: ethers.parseEther("10") });

      await weth.approve(market.getAddress(), MaxUint256);
      await market.mint(ethers.parseEther("1"), deployer.address, 0, 0);
    });

    it("should revert, when mint zero amount", async () => {
      await expect(market.mintXToken(ZeroAddress, signer.address, 0)).to.revertedWith("mint zero amount");
    });

    it("should revert, when mint paused", async () => {
      await market.grantRole(await market.EMERGENCY_DAO_ROLE(), deployer.address);
      await market.pauseMint(true);
      await expect(market.mintXToken(1, signer.address, 0)).to.revertedWith("mint is paused");
    });

    it("should succeed", async () => {
      await expect(market.mintXToken(ethers.parseEther("1"), signer.address, 0))
        .to.emit(market, "Mint")
        .withArgs(deployer.address, signer.address, ethers.parseEther("1"), 0n, ethers.parseEther("1000"), 0n);
      expect(await xToken.balanceOf(signer.address)).to.eq(ethers.parseEther("1000"));
    });
  });
});
