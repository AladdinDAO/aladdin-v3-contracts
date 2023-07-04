/* eslint-disable node/no-missing-import */
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";
import {
  LeveragedToken,
  FractionalToken,
  Treasury,
  WETH9,
  MockTwapOracle,
  Market,
  StabilityPool,
} from "../../typechain";
import "../utils";
import { constants } from "ethers";

describe("StabilityPool.spec", async () => {
  let deployer: SignerWithAddress;
  let signer: SignerWithAddress;
  let platform: SignerWithAddress;
  let liquidator: SignerWithAddress;

  let weth: WETH9;
  let oracle: MockTwapOracle;
  let fToken: FractionalToken;
  let xToken: LeveragedToken;
  let treasury: Treasury;
  let market: Market;
  let stabilityPool: StabilityPool;

  beforeEach(async () => {
    [deployer, signer, platform, liquidator] = await ethers.getSigners();

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

    const Market = await ethers.getContractFactory("Market", deployer);
    market = await Market.deploy();
    await market.deployed();

    const StabilityPool = await ethers.getContractFactory("StabilityPool", deployer);
    stabilityPool = await StabilityPool.deploy();
    await stabilityPool.deployed();

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

    await market.initialize(treasury.address, platform.address);
    await market.updateMarketConfig(
      ethers.utils.parseEther("1.3"),
      ethers.utils.parseEther("1.2"),
      ethers.utils.parseEther("1.14"),
      ethers.utils.parseEther("1")
    );

    await stabilityPool.initialize(treasury.address, market.address);
    await stabilityPool.addReward(weth.address, treasury.address, 86400 * 7);
  });

  /*
  context("auth", async () => {
    it("should revert, when intialize again", async () => {
      await expect(stabilityPool.initialize(treasury.address, market.address)).to.revertedWith(
        "Initializable: contract is already initialized"
      );
    });

    it("should initialize correctly", async () => {
      expect(await stabilityPool.treasury()).to.eq(treasury.address);
      expect(await stabilityPool.market()).to.eq(market.address);
      expect(await stabilityPool.asset()).to.eq(fToken.address);
      expect(await stabilityPool.wrapper()).to.eq(stabilityPool.address);
      expect(await stabilityPool.unlockDuration()).to.eq(86400 * 14);
    });

    context("#updateLiquidator", async () => {
      it("should revert, when non-owner call", async () => {
        await expect(stabilityPool.connect(signer).updateLiquidator(constants.AddressZero)).to.revertedWith(
          "Ownable: caller is not the owner"
        );
      });

      it("should succeed", async () => {
        expect(await stabilityPool.liquidator()).to.eq(constants.AddressZero);
        await expect(stabilityPool.updateLiquidator(liquidator.address))
          .to.emit(stabilityPool, "UpdateLiquidator")
          .withArgs(liquidator.address);
        expect(await stabilityPool.liquidator()).to.eq(liquidator.address);
      });
    });

    context("#updateWrapper", async () => {
      it("should revert, when non-owner call", async () => {
        await expect(stabilityPool.connect(signer).updateWrapper(constants.AddressZero)).to.revertedWith(
          "Ownable: caller is not the owner"
        );
      });

      it("should succeed", async () => {
        expect(await stabilityPool.wrapper()).to.eq(stabilityPool.address);
        await expect(stabilityPool.updateWrapper(liquidator.address))
          .to.emit(stabilityPool, "UpdateWrapper")
          .withArgs(liquidator.address);
        expect(await stabilityPool.wrapper()).to.eq(liquidator.address);
      });
    });

    context("#updateLiquidatableCollateralRatio", async () => {
      it("should revert, when non-owner call", async () => {
        await expect(stabilityPool.connect(signer).updateLiquidatableCollateralRatio(0)).to.revertedWith(
          "Ownable: caller is not the owner"
        );
      });

      it("should succeed", async () => {
        expect(await stabilityPool.liquidatableCollateralRatio()).to.eq(constants.Zero);
        await expect(stabilityPool.updateLiquidatableCollateralRatio(1))
          .to.emit(stabilityPool, "UpdateLiquidatableCollateralRatio")
          .withArgs(1);
        expect(await stabilityPool.liquidatableCollateralRatio()).to.eq(1);
      });
    });

    context("#updateUnlockDuration", async () => {
      it("should revert, when non-owner call", async () => {
        await expect(stabilityPool.connect(signer).updateUnlockDuration(0)).to.revertedWith(
          "Ownable: caller is not the owner"
        );
      });

      it("should revert, when unlockDuration too small", async () => {
        await expect(stabilityPool.updateUnlockDuration(86400 - 1)).to.revertedWith("unlock duration too small");
      });

      it("should succeed", async () => {
        expect(await stabilityPool.unlockDuration()).to.eq(86400 * 14);
        await expect(stabilityPool.updateUnlockDuration(86401))
          .to.emit(stabilityPool, "UpdateUnlockDuration")
          .withArgs(86401);
        expect(await stabilityPool.unlockDuration()).to.eq(86401);
      });
    });

    context("#addReward", async () => {
      it("should revert, when non-owner call", async () => {
        await expect(
          stabilityPool.connect(signer).addReward(constants.AddressZero, constants.AddressZero, 0)
        ).to.revertedWith("Ownable: caller is not the owner");
      });

      it("should revert, when duplicated reward token", async () => {
        await stabilityPool.addReward(weth.address, deployer.address, 10);
        await expect(stabilityPool.addReward(weth.address, deployer.address, 10)).to.revertedWith(
          "duplicated reward token"
        );
      });

      it("should revert, when zero manager address", async () => {
        await expect(stabilityPool.addReward(weth.address, constants.AddressZero, 10)).to.revertedWith(
          "zero manager address"
        );
      });

      it("should revert, when zero period length", async () => {
        await expect(stabilityPool.addReward(weth.address, deployer.address, 0)).to.revertedWith("zero period length");
      });

      it("should succeed", async () => {
        await expect(stabilityPool.addReward(weth.address, deployer.address, 86400))
          .to.emit(stabilityPool, "AddRewardToken")
          .withArgs(weth.address, deployer.address, 86400);
        expect(await stabilityPool.rewardsLength()).to.eq(1);
        expect(await stabilityPool.rewards(0)).to.eq(weth.address);
        expect(await stabilityPool.rewardManager(weth.address)).to.eq(deployer.address);
        expect((await stabilityPool.rewardState(weth.address)).periodLength).to.eq(86400);
      });
    });

    context("#updateReward", async () => {
      beforeEach(async () => {
        await expect(stabilityPool.addReward(weth.address, deployer.address, 86400))
          .to.emit(stabilityPool, "AddRewardToken")
          .withArgs(weth.address, deployer.address, 86400);
      });

      it("should revert, when non-owner call", async () => {
        await expect(
          stabilityPool.connect(signer).updateReward(constants.AddressZero, constants.AddressZero, 0)
        ).to.revertedWith("Ownable: caller is not the owner");
      });

      it("should revert, when no such reward token", async () => {
        await expect(stabilityPool.updateReward(constants.AddressZero, deployer.address, 10)).to.revertedWith(
          "no such reward token"
        );
      });

      it("should revert, when zero manager address", async () => {
        await expect(stabilityPool.updateReward(weth.address, constants.AddressZero, 10)).to.revertedWith(
          "zero manager address"
        );
      });

      it("should revert, when zero period length", async () => {
        await expect(stabilityPool.updateReward(weth.address, deployer.address, 0)).to.revertedWith(
          "zero period length"
        );
      });

      it("should succeed", async () => {
        await expect(stabilityPool.updateReward(weth.address, signer.address, 86401))
          .to.emit(stabilityPool, "UpdateRewardToken")
          .withArgs(weth.address, signer.address, 86401);
        expect(await stabilityPool.rewardManager(weth.address)).to.eq(signer.address);
        expect((await stabilityPool.rewardState(weth.address)).periodLength).to.eq(86401);
      });
    });
  });
  */

  context("deposit and claim", async () => {
    beforeEach(async () => {
      await oracle.setPrice(ethers.utils.parseEther("1000"));
      await treasury.initializePrice();
      await weth.deposit({ value: ethers.utils.parseEther("100") });

      await weth.approve(market.address, constants.MaxUint256);
      await market.mint(ethers.utils.parseEther("100"), deployer.address, 0, 0);
    });

    it("should revert, when deposit zero amount", async () => {
      await expect(stabilityPool.deposit(constants.AddressZero, deployer.address)).to.revertedWith(
        "deposit zero amount"
      );
    });

    it("should succeed, when single deposit", async () => {
      await fToken.approve(stabilityPool.address, constants.MaxUint256);
      const amountIn = ethers.utils.parseEther("200");

      const balanceBefore = await fToken.balanceOf(deployer.address);
      await expect(stabilityPool.deposit(amountIn, signer.address))
        .to.emit(stabilityPool, "Deposit")
        .withArgs(deployer.address, signer.address, amountIn)
        .to.emit(stabilityPool, "UserDepositChange")
        .withArgs(signer.address, amountIn, 0);
      const balanceAfter = await fToken.balanceOf(deployer.address);

      expect(balanceBefore.sub(balanceAfter)).to.eq(amountIn);
      expect(await stabilityPool.totalSupply()).to.eq(amountIn);
      expect(await stabilityPool.balanceOf(signer.address)).to.eq(amountIn);
    });

    it("should succeed, when single deposit and liquidate", async () => {
      await fToken.approve(stabilityPool.address, constants.MaxUint256);
      const amountIn = ethers.utils.parseEther("10000");

      // deposit
      await stabilityPool.deposit(amountIn, signer.address);

      // current collateral ratio is 200%, make 300% as liquidatable
      await stabilityPool.updateLiquidatableCollateralRatio(ethers.utils.parseEther("3"));
      await stabilityPool.updateLiquidator(liquidator.address);

      // liquidate
      await expect(stabilityPool.connect(liquidator).liquidate(ethers.utils.parseEther("200"), 0))
        .to.emit(stabilityPool, "Liquidate")
        .withArgs(ethers.utils.parseEther("200"), ethers.utils.parseEther("0.2"));
      expect(await stabilityPool.totalSupply()).to.eq(amountIn.sub(ethers.utils.parseEther("200")));
      expect(await stabilityPool.balanceOf(signer.address)).to.closeToBn(
        amountIn.sub(ethers.utils.parseEther("200")),
        1e6
      );
      expect((await stabilityPool.epochState()).prod).to.closeToBn(ethers.utils.parseEther("0.98"), 100);
      expect((await stabilityPool.epochState()).epoch).to.eq(0);
      expect((await stabilityPool.epochState()).scale).to.eq(0);

      expect(await stabilityPool.claimable(signer.address, weth.address)).to.closeToBn(
        ethers.utils.parseEther("0.2"),
        1000000
      );

      // deposit again
      await expect(stabilityPool.deposit(ethers.utils.parseEther("100"), signer.address)).to.emit(
        stabilityPool,
        "UserDepositChange"
      );
      expect(await stabilityPool.totalSupply()).to.eq(amountIn.sub(ethers.utils.parseEther("100")));
      expect(await stabilityPool.balanceOf(signer.address)).to.closeToBn(
        amountIn.sub(ethers.utils.parseEther("100")),
        1e6
      );
      expect(await stabilityPool.claimable(signer.address, weth.address)).to.closeToBn(
        ethers.utils.parseEther("0.2"),
        1000000
      );

      // claim
      await expect(stabilityPool.connect(signer)["claim(address,bool)"](weth.address, false)).to.emit(
        stabilityPool,
        "Claim"
      );
      expect(await weth.balanceOf(signer.address)).to.closeToBn(ethers.utils.parseEther("0.2"), 100000);
      expect(await stabilityPool.claimable(signer.address, weth.address)).to.eq(constants.Zero);
    });

    it("should succed, when multiple deposit and liquidate", async () => {
      await fToken.approve(stabilityPool.address, constants.MaxUint256);
      const amountIn1 = ethers.utils.parseEther("10000");
      const amountIn2 = ethers.utils.parseEther("1000");

      // deposit to signer
      await stabilityPool.deposit(amountIn1, signer.address);
      // deposit to self
      await stabilityPool.deposit(amountIn2, deployer.address);

      // current collateral ratio is 200%, make 300% as liquidatable
      await stabilityPool.updateLiquidatableCollateralRatio(ethers.utils.parseEther("3"));
      await stabilityPool.updateLiquidator(liquidator.address);

      // liquidate
      await expect(stabilityPool.connect(liquidator).liquidate(ethers.utils.parseEther("200"), 0))
        .to.emit(stabilityPool, "Liquidate")
        .withArgs(ethers.utils.parseEther("200"), ethers.utils.parseEther("0.2"));
      expect(await stabilityPool.totalSupply()).to.eq(amountIn1.add(amountIn2).sub(ethers.utils.parseEther("200")));
      expect(await stabilityPool.balanceOf(signer.address)).to.closeToBn(
        amountIn1.sub(ethers.utils.parseEther("200").mul(amountIn1).div(amountIn1.add(amountIn2))),
        1e6
      );
      expect(await stabilityPool.balanceOf(deployer.address)).to.closeToBn(
        amountIn2.sub(ethers.utils.parseEther("200").mul(amountIn2).div(amountIn1.add(amountIn2))),
        1e6
      );
      expect((await stabilityPool.epochState()).prod).to.closeToBn(
        ethers.utils.parseEther("0.981818181818181818"), // 108/110
        100
      );
      expect((await stabilityPool.epochState()).epoch).to.eq(0);
      expect((await stabilityPool.epochState()).scale).to.eq(0);

      expect(await stabilityPool.claimable(signer.address, weth.address)).to.closeToBn(
        ethers.utils.parseEther("0.2").mul(amountIn1).div(amountIn1.add(amountIn2)),
        1000000
      );
      expect(await stabilityPool.claimable(deployer.address, weth.address)).to.closeToBn(
        ethers.utils.parseEther("0.2").mul(amountIn2).div(amountIn1.add(amountIn2)),
        1000000
      );
    });
  });

  context("deposit unlock and liquidate and withdraw", async () => {});
});
