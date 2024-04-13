import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { MaxUint256, ZeroAddress, ZeroHash, id } from "ethers";
import { ethers } from "hardhat";

import {
  FractionalTokenV2,
  MockTwapOracle,
  MockERC20,
  LeveragedTokenV2,
  RebalancePoolSplitter,
  ReservePoolV2,
  RebalancePoolRegistry,
  MarketWithFundingCost,
  TreasuryWithFundingCost,
} from "@/types/index";

const PRECISION = ethers.parseEther("1");

describe("MarketWithFundingCost.spec", async () => {
  let deployer: HardhatEthersSigner;
  let platform: HardhatEthersSigner;
  let signer: HardhatEthersSigner;
  let admin: HardhatEthersSigner;

  let baseToken: MockERC20;
  let market: MarketWithFundingCost;
  let reservePool: ReservePoolV2;
  let registry: RebalancePoolRegistry;
  let treasury: TreasuryWithFundingCost;
  let oracle: MockTwapOracle;
  let splitter: RebalancePoolSplitter;
  let fToken: FractionalTokenV2;
  let xToken: LeveragedTokenV2;

  beforeEach(async () => {
    [deployer, signer, admin, platform] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20", deployer);
    baseToken = await MockERC20.deploy("x", "x", 18);

    const MockTwapOracle = await ethers.getContractFactory("MockTwapOracle", deployer);
    oracle = await MockTwapOracle.deploy();

    const RebalancePoolSplitter = await ethers.getContractFactory("RebalancePoolSplitter", deployer);
    splitter = await RebalancePoolSplitter.deploy();

    const EmptyContract = await ethers.getContractFactory("EmptyContract", deployer);
    const placeholder = await EmptyContract.deploy();
    const TransparentUpgradeableProxy = await ethers.getContractFactory("TransparentUpgradeableProxy", deployer);
    const treasuryProxy = await TransparentUpgradeableProxy.deploy(placeholder.getAddress(), admin.address, "0x");
    treasury = await ethers.getContractAt("TreasuryWithFundingCost", await treasuryProxy.getAddress(), deployer);
    const marketProxy = await TransparentUpgradeableProxy.deploy(placeholder.getAddress(), admin.address, "0x");
    market = await ethers.getContractAt("MarketWithFundingCost", await marketProxy.getAddress(), deployer);
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

    const MarketWithFundingCost = await ethers.getContractFactory("MarketWithFundingCost", deployer);
    const marketImpl = await MarketWithFundingCost.deploy(treasuryProxy.getAddress());
    await marketProxy.connect(admin).upgradeTo(marketImpl.getAddress());

    const FractionalTokenV2 = await ethers.getContractFactory("FractionalTokenV2", deployer);
    const fTokenImpl = await FractionalTokenV2.deploy(treasury.getAddress());
    await fTokenProxy.connect(admin).upgradeTo(fTokenImpl.getAddress());

    const LeveragedTokenV2 = await ethers.getContractFactory("LeveragedTokenV2", deployer);
    const xTokenImpl = await LeveragedTokenV2.deploy(treasury.getAddress(), fToken.getAddress());
    await xTokenProxy.connect(admin).upgradeTo(xTokenImpl.getAddress());

    const ReservePoolV2 = await ethers.getContractFactory("ReservePoolV2", deployer);
    reservePool = await ReservePoolV2.deploy();

    const RebalancePoolRegistry = await ethers.getContractFactory("RebalancePoolRegistry", deployer);
    registry = await RebalancePoolRegistry.deploy();

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
    await market.initialize(platform.address, reservePool.getAddress(), registry.getAddress());
    await treasury.grantRole(id("FX_MARKET_ROLE"), market.getAddress());
    await reservePool.grantRole(id("MARKET_ROLE"), market.getAddress());
    await oracle.set_rate_mul(ethers.parseEther("1.0"));
    await splitter.setSplitter(baseToken.getAddress(), treasury.getAddress());
  });

  context("constructor", async () => {
    it("should initialize correctly", async () => {
      expect(await market.treasury()).to.eq(await treasury.getAddress());
      expect(await market.baseToken()).to.eq(await baseToken.getAddress());
      expect(await market.fToken()).to.eq(await fToken.getAddress());
      expect(await market.xToken()).to.eq(await xToken.getAddress());
      expect(await market.platform()).to.eq(await platform.getAddress());
      expect(await market.reservePool()).to.eq(await reservePool.getAddress());
      expect(await market.registry()).to.eq(await registry.getAddress());
      expect(await market.fxUSD()).to.eq(ZeroAddress);
      expect(await market.mintPaused()).to.eq(false);
      expect(await market.redeemPaused()).to.eq(false);
      expect(await market.fTokenMintPausedInStabilityMode()).to.eq(false);
      expect(await market.xTokenRedeemPausedInStabilityMode()).to.eq(false);
      expect(await market.stabilityRatio()).to.eq(0n);
      expect(await market.fTokenMintFeeRatio()).to.deep.eq([0n, 0n]);
      expect(await market.xTokenMintFeeRatio()).to.deep.eq([0n, 0n]);
      expect(await market.fTokenRedeemFeeRatio()).to.deep.eq([0n, 0n]);
      expect(await market.xTokenRedeemFeeRatio()).to.deep.eq([0n, 0n]);

      await expect(
        market.initialize(platform.address, reservePool.getAddress(), registry.getAddress())
      ).to.revertedWith("Initializable: contract is already initialized");
    });
  });

  context("auth", async () => {
    context("#updateRedeemFeeRatio", async () => {
      it("should revert, when non-owner call", async () => {
        await expect(market.connect(signer).updateRedeemFeeRatio(0, 0, false)).to.revertedWith(
          "AccessControl: account " + signer.address.toLowerCase() + " is missing role " + ZeroHash
        );
        await expect(market.connect(signer).updateRedeemFeeRatio(0, 0, true)).to.revertedWith(
          "AccessControl: account " + signer.address.toLowerCase() + " is missing role " + ZeroHash
        );
      });

      it("should revert, when default fee too large", async () => {
        await expect(market.updateRedeemFeeRatio(PRECISION + 1n, 0, false)).to.revertedWithCustomError(
          market,
          "ErrorDefaultFeeTooLarge"
        );
        await expect(market.updateRedeemFeeRatio(PRECISION + 1n, 0, true)).to.revertedWithCustomError(
          market,
          "ErrorDefaultFeeTooLarge"
        );
      });

      it("should revert, when delta fee too small", async () => {
        await expect(market.updateRedeemFeeRatio(2, -3, false)).to.revertedWithCustomError(
          market,
          "ErrorDeltaFeeTooSmall"
        );
        await expect(market.updateRedeemFeeRatio(2, -3, true)).to.revertedWithCustomError(
          market,
          "ErrorDeltaFeeTooSmall"
        );
      });

      it("should revert, when total fee too large", async () => {
        await expect(market.updateRedeemFeeRatio(PRECISION, 1, false)).to.revertedWithCustomError(
          market,
          "ErrorTotalFeeTooLarge"
        );
        await expect(market.updateRedeemFeeRatio(PRECISION, 1, true)).to.revertedWithCustomError(
          market,
          "ErrorTotalFeeTooLarge"
        );
      });

      it("should succeed when update for fToken", async () => {
        await expect(market.updateRedeemFeeRatio(1, 2, true))
          .to.emit(market, "UpdateRedeemFeeRatioFToken")
          .withArgs(1, 2);

        expect((await market.fTokenRedeemFeeRatio()).defaultFee).to.eq(1);
        expect((await market.fTokenRedeemFeeRatio()).deltaFee).to.eq(2);
        expect((await market.xTokenRedeemFeeRatio()).defaultFee).to.eq(0n);
        expect((await market.xTokenRedeemFeeRatio()).deltaFee).to.eq(0n);
      });

      it("should succeed when update for xToken", async () => {
        await expect(market.updateRedeemFeeRatio(1, 2, false))
          .to.emit(market, "UpdateRedeemFeeRatioXToken")
          .withArgs(1, 2);

        expect((await market.fTokenRedeemFeeRatio()).defaultFee).to.eq(0n);
        expect((await market.fTokenRedeemFeeRatio()).deltaFee).to.eq(0n);
        expect((await market.xTokenRedeemFeeRatio()).defaultFee).to.eq(1);
        expect((await market.xTokenRedeemFeeRatio()).deltaFee).to.eq(2);
      });
    });

    context("#updateMintFeeRatio", async () => {
      it("should revert, when non-owner call", async () => {
        await expect(market.connect(signer).updateMintFeeRatio(0, 0, false)).to.revertedWith(
          "AccessControl: account " + signer.address.toLowerCase() + " is missing role " + ZeroHash
        );
        await expect(market.connect(signer).updateMintFeeRatio(0, 0, true)).to.revertedWith(
          "AccessControl: account " + signer.address.toLowerCase() + " is missing role " + ZeroHash
        );
      });

      it("should revert, when default fee too large", async () => {
        await expect(market.updateMintFeeRatio(PRECISION + 1n, 0, false)).to.revertedWithCustomError(
          market,
          "ErrorDefaultFeeTooLarge"
        );
        await expect(market.updateMintFeeRatio(PRECISION + 1n, 0, true)).to.revertedWithCustomError(
          market,
          "ErrorDefaultFeeTooLarge"
        );
      });

      it("should revert, when delta fee too small", async () => {
        await expect(market.updateMintFeeRatio(2, -3, false)).to.revertedWithCustomError(
          market,
          "ErrorDeltaFeeTooSmall"
        );
        await expect(market.updateMintFeeRatio(2, -3, true)).to.revertedWithCustomError(
          market,
          "ErrorDeltaFeeTooSmall"
        );
      });

      it("should revert, when total fee too large", async () => {
        await expect(market.updateMintFeeRatio(PRECISION, 1, false)).to.revertedWithCustomError(
          market,
          "ErrorTotalFeeTooLarge"
        );
        await expect(market.updateMintFeeRatio(PRECISION, 1, true)).to.revertedWithCustomError(
          market,
          "ErrorTotalFeeTooLarge"
        );
      });

      it("should succeed when update for fToken", async () => {
        await expect(market.updateMintFeeRatio(1, 2, true)).to.emit(market, "UpdateMintFeeRatioFToken").withArgs(1, 2);

        expect((await market.fTokenMintFeeRatio()).defaultFee).to.eq(1);
        expect((await market.fTokenMintFeeRatio()).deltaFee).to.eq(2);
        expect((await market.xTokenMintFeeRatio()).defaultFee).to.eq(0n);
        expect((await market.xTokenMintFeeRatio()).deltaFee).to.eq(0n);
      });

      it("should succeed when update for xToken", async () => {
        await expect(market.updateMintFeeRatio(1, 2, false)).to.emit(market, "UpdateMintFeeRatioXToken").withArgs(1, 2);

        expect((await market.fTokenMintFeeRatio()).defaultFee).to.eq(0n);
        expect((await market.fTokenMintFeeRatio()).deltaFee).to.eq(0n);
        expect((await market.xTokenMintFeeRatio()).defaultFee).to.eq(1);
        expect((await market.xTokenMintFeeRatio()).deltaFee).to.eq(2);
      });
    });

    context("#updateStabilityRatio", async () => {
      it("should revert when caller is not admin", async () => {
        await expect(market.connect(signer).updateStabilityRatio(0n)).to.revertedWith(
          "AccessControl: account " + signer.address.toLowerCase() + " is missing role " + ZeroHash
        );
      });

      it("should succeed", async () => {
        expect(await market.stabilityRatio()).to.eq(0n);
        await expect(market.updateStabilityRatio(ethers.parseEther("1.3")))
          .to.emit(market, "UpdateStabilityRatio")
          .withArgs(0n, ethers.parseEther("1.3"));
        expect(await market.stabilityRatio()).to.eq(ethers.parseEther("1.3"));
      });
    });

    context("#updateMintStatus", async () => {
      it("should revert, when non-owner call", async () => {
        await expect(market.connect(signer).updateMintStatus(false)).to.revertedWith(
          "AccessControl: account " + signer.address.toLowerCase() + " is missing role " + id("EMERGENCY_DAO_ROLE")
        );
        await expect(market.connect(signer).updateMintStatus(true)).to.revertedWith(
          "AccessControl: account " + signer.address.toLowerCase() + " is missing role " + id("EMERGENCY_DAO_ROLE")
        );
      });

      it("should succeed", async () => {
        await market.grantRole(id("EMERGENCY_DAO_ROLE"), deployer.address);

        expect(await market.mintPaused()).to.eq(false);
        await expect(market.updateMintStatus(true)).to.emit(market, "UpdateMintStatus").withArgs(false, true);
        expect(await market.mintPaused()).to.eq(true);
        await expect(market.updateMintStatus(false)).to.emit(market, "UpdateMintStatus").withArgs(true, false);
        expect(await market.mintPaused()).to.eq(false);
      });
    });

    context("#updateRedeemStatus", async () => {
      it("should revert, when non-owner call", async () => {
        await expect(market.connect(signer).updateRedeemStatus(false)).to.revertedWith(
          "AccessControl: account " + signer.address.toLowerCase() + " is missing role " + id("EMERGENCY_DAO_ROLE")
        );
        await expect(market.connect(signer).updateRedeemStatus(true)).to.revertedWith(
          "AccessControl: account " + signer.address.toLowerCase() + " is missing role " + id("EMERGENCY_DAO_ROLE")
        );
      });

      it("should succeed", async () => {
        await market.grantRole(id("EMERGENCY_DAO_ROLE"), deployer.address);

        expect(await market.redeemPaused()).to.eq(false);
        await expect(market.updateRedeemStatus(true)).to.emit(market, "UpdateRedeemStatus").withArgs(false, true);
        expect(await market.redeemPaused()).to.eq(true);
        await expect(market.updateRedeemStatus(false)).to.emit(market, "UpdateRedeemStatus").withArgs(true, false);
        expect(await market.redeemPaused()).to.eq(false);
      });
    });

    context("#updateFTokenMintStatusInStabilityMode", async () => {
      it("should revert, when non-owner call", async () => {
        await expect(market.connect(signer).updateFTokenMintStatusInStabilityMode(false)).to.revertedWith(
          "AccessControl: account " + signer.address.toLowerCase() + " is missing role " + id("EMERGENCY_DAO_ROLE")
        );
        await expect(market.connect(signer).updateFTokenMintStatusInStabilityMode(true)).to.revertedWith(
          "AccessControl: account " + signer.address.toLowerCase() + " is missing role " + id("EMERGENCY_DAO_ROLE")
        );
      });

      it("should succeed", async () => {
        await market.grantRole(id("EMERGENCY_DAO_ROLE"), deployer.address);
        expect(await market.fTokenMintPausedInStabilityMode()).to.eq(false);
        await expect(market.updateFTokenMintStatusInStabilityMode(true))
          .to.emit(market, "UpdateFTokenMintStatusInStabilityMode")
          .withArgs(false, true);
        expect(await market.fTokenMintPausedInStabilityMode()).to.eq(true);
        await expect(market.updateFTokenMintStatusInStabilityMode(false))
          .to.emit(market, "UpdateFTokenMintStatusInStabilityMode")
          .withArgs(true, false);
        expect(await market.fTokenMintPausedInStabilityMode()).to.eq(false);
      });
    });

    context("#updateXTokenRedeemStatusInStabilityMode", async () => {
      it("should revert, when non-owner call", async () => {
        await expect(market.connect(signer).updateXTokenRedeemStatusInStabilityMode(false)).to.revertedWith(
          "AccessControl: account " + signer.address.toLowerCase() + " is missing role " + id("EMERGENCY_DAO_ROLE")
        );
        await expect(market.connect(signer).updateXTokenRedeemStatusInStabilityMode(true)).to.revertedWith(
          "AccessControl: account " + signer.address.toLowerCase() + " is missing role " + id("EMERGENCY_DAO_ROLE")
        );
      });

      it("should succeed", async () => {
        await market.grantRole(id("EMERGENCY_DAO_ROLE"), deployer.address);
        expect(await market.xTokenRedeemPausedInStabilityMode()).to.eq(false);
        await expect(market.updateXTokenRedeemStatusInStabilityMode(true))
          .to.emit(market, "UpdateXTokenRedeemStatusInStabilityMode")
          .withArgs(false, true);
        expect(await market.xTokenRedeemPausedInStabilityMode()).to.eq(true);
        await expect(market.updateXTokenRedeemStatusInStabilityMode(false))
          .to.emit(market, "UpdateXTokenRedeemStatusInStabilityMode")
          .withArgs(true, false);
        expect(await market.xTokenRedeemPausedInStabilityMode()).to.eq(false);
      });
    });

    context("#updatePlatform", async () => {
      it("should revert when caller is not admin", async () => {
        await expect(market.connect(signer).updatePlatform(ZeroAddress)).to.revertedWith(
          "AccessControl: account " + signer.address.toLowerCase() + " is missing role " + ZeroHash
        );
      });

      it("should revert when address is zero", async () => {
        await expect(market.updatePlatform(ZeroAddress)).to.revertedWithCustomError(market, "ErrorZeroAddress");
      });

      it("should succeed", async () => {
        expect(await market.platform()).to.eq(platform.address);
        await expect(market.updatePlatform(deployer.address))
          .to.emit(market, "UpdatePlatform")
          .withArgs(platform.address, deployer.address);
        expect(await market.platform()).to.eq(deployer.address);
      });
    });

    context("#updateReservePool", async () => {
      it("should revert when caller is not admin", async () => {
        await expect(market.connect(signer).updateReservePool(ZeroAddress)).to.revertedWith(
          "AccessControl: account " + signer.address.toLowerCase() + " is missing role " + ZeroHash
        );
      });

      it("should revert when address is zero", async () => {
        await expect(market.updateReservePool(ZeroAddress)).to.revertedWithCustomError(market, "ErrorZeroAddress");
      });

      it("should succeed", async () => {
        expect(await market.reservePool()).to.eq(await reservePool.getAddress());
        await expect(market.updateReservePool(deployer.address))
          .to.emit(market, "UpdateReservePool")
          .withArgs(await reservePool.getAddress(), deployer.address);
        expect(await market.reservePool()).to.eq(deployer.address);
      });
    });

    context("#updateRebalancePoolRegistry", async () => {
      it("should revert when caller is not admin", async () => {
        await expect(market.connect(signer).updateRebalancePoolRegistry(ZeroAddress)).to.revertedWith(
          "AccessControl: account " + signer.address.toLowerCase() + " is missing role " + ZeroHash
        );
      });

      it("should revert when address is zero", async () => {
        await expect(market.updateRebalancePoolRegistry(ZeroAddress)).to.revertedWithCustomError(
          market,
          "ErrorZeroAddress"
        );
      });

      it("should succeed", async () => {
        expect(await market.registry()).to.eq(await registry.getAddress());
        await expect(market.updateRebalancePoolRegistry(deployer.address))
          .to.emit(market, "UpdateRebalancePoolRegistry")
          .withArgs(await registry.getAddress(), deployer.address);
        expect(await market.registry()).to.eq(deployer.address);
      });
    });

    context("#enableFxUSD", async () => {
      it("should revert when caller is not admin", async () => {
        await expect(market.connect(signer).enableFxUSD(ZeroAddress)).to.revertedWith(
          "AccessControl: account " + signer.address.toLowerCase() + " is missing role " + ZeroHash
        );
      });

      it("should revert when address is zero", async () => {
        await expect(market.enableFxUSD(ZeroAddress)).to.revertedWithCustomError(market, "ErrorZeroAddress");
      });

      it("should succeed", async () => {
        await market.enableFxUSD(signer.address);
        expect(await market.fxUSD()).to.eq(signer.address);
        await expect(market.mintFToken(0n, deployer.address, 0n)).to.revertedWithCustomError(
          market,
          "ErrorCallerNotFUSD"
        );
      });
    });
  });

  context("mint and redeem", async () => {
    beforeEach(async () => {
      await oracle.setPrice(ethers.parseEther("2020"));
      await oracle.setIsValid(true);
      await baseToken.mint(treasury.getAddress(), ethers.parseEther("100"));
      await treasury.grantRole(id("PROTOCOL_INITIALIZER_ROLE"), signer.address);
      await expect(treasury.connect(signer).initializeProtocol(ethers.parseEther("100")))
        .to.emit(treasury, "Settle")
        .withArgs(0n, ethers.parseEther("2020"));
      expect(await treasury.referenceBaseTokenPrice()).to.eq(ethers.parseEther("2020"));
      expect(await treasury.collateralRatio()).to.eq(PRECISION * 2n);
      expect((await treasury.emaLeverageRatio()).lastValue).to.eq(PRECISION * 2n);
      expect((await treasury.emaLeverageRatio()).lastEmaValue).to.eq(PRECISION * 2n);
      expect(await fToken.balanceOf(signer.address)).to.eq(ethers.parseEther("101000"));
      expect(await xToken.balanceOf(signer.address)).to.eq(ethers.parseEther("101000"));

      await market.updateStabilityRatio(ethers.parseEther("1.3"));
      await market.grantRole(id("EMERGENCY_DAO_ROLE"), deployer.address);
      await market.updateMintFeeRatio(ethers.parseEther("0.0025"), ethers.parseEther("0.08"), true);
      await market.updateMintFeeRatio(ethers.parseEther("0.01"), ethers.parseEther("0"), false);
      await market.updateRedeemFeeRatio(ethers.parseEther("0.0025"), ethers.parseEther("0"), true);
      await market.updateRedeemFeeRatio(ethers.parseEther("0.01"), ethers.parseEther("0.08"), false);
    });

    context("zero funding cost", async () => {
      context("mintFToken", async () => {
        it("should revert when mint paused", async () => {
          await market.updateMintStatus(true);
          await expect(market.mintFToken(0n, ZeroAddress, 0n)).to.revertedWithCustomError(market, "ErrorMintPaused");
        });

        it("should revert when mint zero", async () => {
          await expect(market.mintFToken(0n, deployer.address, 0n)).to.revertedWithCustomError(
            market,
            "ErrorMintZeroAmount"
          );
        });

        it("should succeed", async () => {
          await baseToken.mint(deployer.address, ethers.parseEther("1"));
          await baseToken.approve(market.getAddress(), MaxUint256);

          const expected = await market.mintFToken.staticCall(ethers.parseEther("1"), deployer.address, 0n);
          expect(expected).to.eq(ethers.parseEther("2014.95"));
          await expect(
            market.mintFToken(ethers.parseEther("1"), deployer.address, expected + 1n)
          ).to.revertedWithCustomError(market, "ErrorInsufficientFTokenOutput");

          await expect(market.mintFToken(ethers.parseEther("1"), deployer.address, expected))
            .to.emit(market, "MintFToken")
            .withArgs(
              deployer.address,
              deployer.address,
              ethers.parseEther("1"),
              expected,
              ethers.parseEther("0.0025")
            );
          expect(await baseToken.balanceOf(treasury.getAddress())).to.eq(ethers.parseEther("100.9975"));
          expect(await baseToken.balanceOf(platform.address)).to.eq(ethers.parseEther("0.0025"));
          expect(await fToken.balanceOf(deployer.address)).to.eq(expected);
          expect(await treasury.totalBaseToken()).to.eq(ethers.parseEther("100.9975"));
        });
      });

      context("mintXToken", async () => {
        it("should revert when mint paused", async () => {
          await market.updateMintStatus(true);
          await expect(market.mintXToken(0n, ZeroAddress, 0n)).to.revertedWithCustomError(market, "ErrorMintPaused");
        });

        it("should revert when mint zero", async () => {
          await expect(market.mintXToken(0n, deployer.address, 0n)).to.revertedWithCustomError(
            market,
            "ErrorMintZeroAmount"
          );
        });

        it("should succeed", async () => {
          await baseToken.mint(deployer.address, ethers.parseEther("1"));
          await baseToken.approve(market.getAddress(), MaxUint256);

          const [expected, expectedBonus] = await market.mintXToken.staticCall(
            ethers.parseEther("1"),
            deployer.address,
            0n
          );
          expect(expected).to.eq(ethers.parseEther("1999.8"));
          expect(expectedBonus).to.eq(0n);
          await expect(
            market.mintXToken(ethers.parseEther("1"), deployer.address, expected + 1n)
          ).to.revertedWithCustomError(market, "ErrorInsufficientXTokenOutput");

          await expect(market.mintXToken(ethers.parseEther("1"), deployer.address, expected))
            .to.emit(market, "MintXToken")
            .withArgs(
              deployer.address,
              deployer.address,
              ethers.parseEther("1"),
              expected,
              expectedBonus,
              ethers.parseEther("0.01")
            );
          expect(await baseToken.balanceOf(treasury.getAddress())).to.eq(ethers.parseEther("100.99"));
          expect(await baseToken.balanceOf(platform.address)).to.eq(ethers.parseEther("0.01"));
          expect(await xToken.balanceOf(deployer.address)).to.eq(expected);
          expect(await treasury.totalBaseToken()).to.eq(ethers.parseEther("100.99"));
        });
      });

      context("redeemFToken", async () => {
        it("should revert when redeem paused", async () => {
          await market.updateRedeemStatus(true);
          await expect(market.redeemFToken(0n, ZeroAddress, 0n)).to.revertedWithCustomError(
            market,
            "ErrorRedeemPaused"
          );
        });

        it("should revert when redeem zero", async () => {
          await expect(market.redeemFToken(0n, deployer.address, 0n)).to.revertedWithCustomError(
            market,
            "ErrorRedeemZeroAmount"
          );
        });

        it("should succeed", async () => {
          const [expected, expecedBonus] = await market
            .connect(signer)
            .redeemFToken.staticCall(ethers.parseEther("1"), deployer.address, 0n);
          expect(expected).to.eq(ethers.parseEther("0.000493811881188119"));
          expect(expecedBonus).to.eq(0n);

          await expect(market.connect(signer).redeemFToken(ethers.parseEther("1"), deployer.address, 0n))
            .to.emit(market, "RedeemFToken")
            .withArgs(
              signer.address,
              deployer.address,
              ethers.parseEther("1"),
              expected,
              expecedBonus,
              ethers.parseEther("0.000001237623762376")
            );
          expect(await baseToken.balanceOf(deployer.address)).to.eq(expected);
          expect(await baseToken.balanceOf(treasury.getAddress())).to.eq(ethers.parseEther("99.999504950495049505"));
          expect(await fToken.balanceOf(signer.address)).to.eq(ethers.parseEther("100999"));
          expect(await treasury.totalBaseToken()).to.eq(ethers.parseEther("99.999504950495049505"));
        });
      });

      context("redeemXToken", async () => {
        it("should revert when mint paused", async () => {
          await market.updateRedeemStatus(true);
          await expect(market.redeemXToken(0n, ZeroAddress, 0n)).to.revertedWithCustomError(
            market,
            "ErrorRedeemPaused"
          );
        });

        it("should revert when redeem zero", async () => {
          await expect(market.redeemXToken(0n, deployer.address, 0n)).to.revertedWithCustomError(
            market,
            "ErrorRedeemZeroAmount"
          );
        });

        it("should succeed", async () => {
          const expected = await market
            .connect(signer)
            .redeemXToken.staticCall(ethers.parseEther("1"), deployer.address, 0n);
          expect(expected).to.eq(ethers.parseEther("0.000490099009900991"));

          await expect(market.connect(signer).redeemXToken(ethers.parseEther("1"), deployer.address, 0n))
            .to.emit(market, "RedeemXToken")
            .withArgs(
              signer.address,
              deployer.address,
              ethers.parseEther("1"),
              expected,
              ethers.parseEther("0.000004950495049504")
            );
          expect(await baseToken.balanceOf(deployer.address)).to.eq(expected);
          expect(await baseToken.balanceOf(treasury.getAddress())).to.eq(ethers.parseEther("99.999504950495049505"));
          expect(await xToken.balanceOf(signer.address)).to.eq(ethers.parseEther("100999"));
          expect(await treasury.totalBaseToken()).to.eq(ethers.parseEther("99.999504950495049505"));
        });
      });
    });

    context("10% funding cost", async () => {
      beforeEach(async () => {
        // funding costs = 5.0
        await oracle.set_rate_mul(ethers.parseEther("1.2"));
        await treasury.updateHarvesterRatio(1e8); // 10%
        await treasury.updateRebalancePoolRatio(5e8); // 50%
      });

      context("mintFToken", async () => {
        it("should revert when mint paused", async () => {
          await market.updateMintStatus(true);
          await expect(market.mintFToken(0n, ZeroAddress, 0n)).to.revertedWithCustomError(market, "ErrorMintPaused");
        });

        it("should revert when mint zero", async () => {
          await expect(market.mintFToken(0n, deployer.address, 0n)).to.revertedWithCustomError(
            market,
            "ErrorMintZeroAmount"
          );
        });

        it("should succeed", async () => {
          await baseToken.mint(deployer.address, ethers.parseEther("1"));
          await baseToken.approve(market.getAddress(), MaxUint256);

          const expected = await market.mintFToken.staticCall(ethers.parseEther("1"), deployer.address, 0n);
          expect(expected).to.eq(ethers.parseEther("2014.95"));
          await expect(
            market.mintFToken(ethers.parseEther("1"), deployer.address, expected + 1n)
          ).to.revertedWithCustomError(market, "ErrorInsufficientFTokenOutput");

          const baseBefore = await baseToken.balanceOf(platform.address);
          await expect(market.mintFToken(ethers.parseEther("1"), deployer.address, expected))
            .to.emit(market, "MintFToken")
            .withArgs(
              deployer.address,
              deployer.address,
              ethers.parseEther("1"),
              expected,
              ethers.parseEther("0.0025")
            );
          const baseAfter = await baseToken.balanceOf(platform.address);
          expect(baseAfter - baseBefore).to.eq(ethers.parseEther("1.2525"));
          expect(await baseToken.balanceOf(splitter.getAddress())).to.eq(ethers.parseEther("1.25"));
          expect(await baseToken.balanceOf(treasury.getAddress())).to.eq(ethers.parseEther("98.4975"));
          expect(await fToken.balanceOf(deployer.address)).to.eq(expected);
          expect(await treasury.totalBaseToken()).to.eq(ethers.parseEther("98.4975"));
        });
      });

      context("mintXToken", async () => {
        it("should revert when mint paused", async () => {
          await market.updateMintStatus(true);
          await expect(market.mintXToken(0n, ZeroAddress, 0n)).to.revertedWithCustomError(market, "ErrorMintPaused");
        });

        it("should revert when mint zero", async () => {
          await expect(market.mintXToken(0n, deployer.address, 0n)).to.revertedWithCustomError(
            market,
            "ErrorMintZeroAmount"
          );
        });

        it("should succeed", async () => {
          await baseToken.mint(deployer.address, ethers.parseEther("1"));
          await baseToken.approve(market.getAddress(), MaxUint256);

          const [expected, expectedBonus] = await market.mintXToken.staticCall(
            ethers.parseEther("1"),
            deployer.address,
            0n
          );
          expect(expected).to.eq(ethers.parseEther("2105.052631578947368421"));
          expect(expectedBonus).to.eq(0n);
          await expect(
            market.mintXToken(ethers.parseEther("1"), deployer.address, expected + 1n)
          ).to.revertedWithCustomError(market, "ErrorInsufficientXTokenOutput");

          const baseBefore = await baseToken.balanceOf(platform.address);
          await expect(market.mintXToken(ethers.parseEther("1"), deployer.address, expected))
            .to.emit(market, "MintXToken")
            .withArgs(
              deployer.address,
              deployer.address,
              ethers.parseEther("1"),
              expected,
              expectedBonus,
              ethers.parseEther("0.01")
            );
          const baseAfter = await baseToken.balanceOf(platform.address);
          expect(baseAfter - baseBefore).to.eq(ethers.parseEther("1.26"));
          expect(await baseToken.balanceOf(splitter.getAddress())).to.eq(ethers.parseEther("1.25"));
          expect(await baseToken.balanceOf(treasury.getAddress())).to.eq(ethers.parseEther("98.49"));
          expect(await xToken.balanceOf(deployer.address)).to.eq(expected);
          expect(await treasury.totalBaseToken()).to.eq(ethers.parseEther("98.49"));
        });
      });

      context("redeemFToken", async () => {
        it("should revert when redeem paused", async () => {
          await market.updateRedeemStatus(true);
          await expect(market.redeemFToken(0n, ZeroAddress, 0n)).to.revertedWithCustomError(
            market,
            "ErrorRedeemPaused"
          );
        });

        it("should revert when redeem zero", async () => {
          await expect(market.redeemFToken(0n, deployer.address, 0n)).to.revertedWithCustomError(
            market,
            "ErrorRedeemZeroAmount"
          );
        });

        it("should succeed", async () => {
          const [expected, expecedBonus] = await market
            .connect(signer)
            .redeemFToken.staticCall(ethers.parseEther("1"), deployer.address, 0n);
          expect(expected).to.eq(ethers.parseEther("0.000493811881188119"));
          expect(expecedBonus).to.eq(0n);

          const before = await baseToken.balanceOf(platform.address);
          await expect(market.connect(signer).redeemFToken(ethers.parseEther("1"), deployer.address, 0n))
            .to.emit(market, "RedeemFToken")
            .withArgs(
              signer.address,
              deployer.address,
              ethers.parseEther("1"),
              expected,
              expecedBonus,
              ethers.parseEther("0.000001237623762376")
            );
          const after = await baseToken.balanceOf(platform.address);
          expect(after - before).to.eq(ethers.parseEther("1.250001237623762376"));
          expect(await baseToken.balanceOf(deployer.address)).to.eq(expected);
          expect(await baseToken.balanceOf(splitter.getAddress())).to.eq(ethers.parseEther("1.25"));
          expect(await baseToken.balanceOf(treasury.getAddress())).to.eq(ethers.parseEther("97.499504950495049505"));
          expect(await fToken.balanceOf(signer.address)).to.eq(ethers.parseEther("100999"));
          expect(await treasury.totalBaseToken()).to.eq(ethers.parseEther("97.499504950495049505"));
        });
      });

      context("redeemXToken", async () => {
        it("should revert when mint paused", async () => {
          await market.updateRedeemStatus(true);
          await expect(market.redeemXToken(0n, ZeroAddress, 0n)).to.revertedWithCustomError(
            market,
            "ErrorRedeemPaused"
          );
        });

        it("should revert when redeem zero", async () => {
          await expect(market.redeemXToken(0n, deployer.address, 0n)).to.revertedWithCustomError(
            market,
            "ErrorRedeemZeroAmount"
          );
        });

        it("should succeed", async () => {
          const expected = await market
            .connect(signer)
            .redeemXToken.staticCall(ethers.parseEther("1"), deployer.address, 0n);
          expect(expected).to.eq(ethers.parseEther("0.000465594059405941"));

          const before = await baseToken.balanceOf(platform.address);
          await expect(market.connect(signer).redeemXToken(ethers.parseEther("1"), deployer.address, 0n))
            .to.emit(market, "RedeemXToken")
            .withArgs(
              signer.address,
              deployer.address,
              ethers.parseEther("1"),
              expected,
              ethers.parseEther("0.000004702970297029")
            );
          const after = await baseToken.balanceOf(platform.address);
          expect(after - before).to.eq(ethers.parseEther("1.250004702970297029"));
          expect(await baseToken.balanceOf(deployer.address)).to.eq(expected);
          expect(await baseToken.balanceOf(splitter.getAddress())).to.eq(ethers.parseEther("1.25"));
          expect(await baseToken.balanceOf(treasury.getAddress())).to.eq(ethers.parseEther("97.499529702970297030"));
          expect(await xToken.balanceOf(signer.address)).to.eq(ethers.parseEther("100999"));
          expect(await treasury.totalBaseToken()).to.eq(ethers.parseEther("97.499529702970297030"));
        });
      });
    });
  });
});
