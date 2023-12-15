import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { MaxUint256, ZeroAddress } from "ethers";
import { ethers, network } from "hardhat";

import {
  FractionalToken,
  LeveragedToken,
  Market,
  MockTokenWrapper,
  MockTwapOracle,
  RebalancePool,
  Treasury,
  WETH9,
} from "@/types/index";

describe("RebalancePool.spec", async () => {
  let deployer: HardhatEthersSigner;
  let signer: HardhatEthersSigner;
  let platform: HardhatEthersSigner;
  let liquidator: HardhatEthersSigner;
  let userA: HardhatEthersSigner;
  let userB: HardhatEthersSigner;

  let weth: WETH9;
  let oracle: MockTwapOracle;
  let fToken: FractionalToken;
  let xToken: LeveragedToken;
  let treasury: Treasury;
  let market: Market;
  let rebalancePool: RebalancePool;
  let wrapper: MockTokenWrapper;

  beforeEach(async () => {
    [deployer, signer, platform, liquidator, userA, userB] = await ethers.getSigners();

    const WETH9 = await ethers.getContractFactory("WETH9", deployer);
    weth = await WETH9.deploy();

    const MockTokenWrapper = await ethers.getContractFactory("MockTokenWrapper", deployer);
    wrapper = await MockTokenWrapper.deploy();

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

    const RebalancePool = await ethers.getContractFactory("RebalancePool", deployer);
    rebalancePool = await RebalancePool.deploy();

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
    await treasury.initializeV2(60 * 15);

    await market.initialize(treasury.getAddress(), platform.address);
    await market.updateMarketConfig(
      ethers.parseEther("1.3"),
      ethers.parseEther("1.2"),
      ethers.parseEther("1.14"),
      ethers.parseEther("1")
    );

    await rebalancePool.initialize(treasury.getAddress(), market.getAddress());
  });

  context("auth", async () => {
    it("should revert, when intialize again", async () => {
      await expect(rebalancePool.initialize(treasury.getAddress(), market.getAddress())).to.revertedWith(
        "Initializable: contract is already initialized"
      );
    });

    it("should initialize correctly", async () => {
      expect(await rebalancePool.treasury()).to.eq(await treasury.getAddress());
      expect(await rebalancePool.market()).to.eq(await market.getAddress());
      expect(await rebalancePool.asset()).to.eq(await fToken.getAddress());
      expect(await rebalancePool.wrapper()).to.eq(await rebalancePool.getAddress());
      expect(await rebalancePool.unlockDuration()).to.eq(86400 * 14);
    });

    context("#updateLiquidator", async () => {
      it("should revert, when non-owner call", async () => {
        await expect(rebalancePool.connect(signer).updateLiquidator(ZeroAddress)).to.revertedWith(
          "Ownable: caller is not the owner"
        );
      });

      it("should succeed", async () => {
        expect(await rebalancePool.liquidator()).to.eq(ZeroAddress);
        await expect(rebalancePool.updateLiquidator(liquidator.address))
          .to.emit(rebalancePool, "UpdateLiquidator")
          .withArgs(liquidator.address);
        expect(await rebalancePool.liquidator()).to.eq(liquidator.address);
      });
    });

    context("#updateWrapper", async () => {
      it("should revert, when non-owner call", async () => {
        await expect(rebalancePool.connect(signer).updateWrapper(ZeroAddress)).to.revertedWith(
          "Ownable: caller is not the owner"
        );
      });

      it("should revert, when src mismatch", async () => {
        await expect(rebalancePool.updateWrapper(wrapper.getAddress())).to.revertedWith("src mismatch");
      });

      it("should revert, when dst mismatch", async () => {
        await wrapper.set(weth.getAddress(), weth.getAddress());
        await rebalancePool.updateWrapper(wrapper.getAddress());

        const MockTokenWrapper = await ethers.getContractFactory("MockTokenWrapper", deployer);
        const newWrapper = await MockTokenWrapper.deploy();
        await newWrapper.set(weth.getAddress(), liquidator.address);

        await expect(rebalancePool.updateWrapper(newWrapper.getAddress())).to.revertedWith("dst mismatch");
      });

      it("should succeed", async () => {
        await wrapper.set(weth.getAddress(), weth.getAddress());
        expect(await rebalancePool.wrapper()).to.eq(await rebalancePool.getAddress());
        await expect(rebalancePool.updateWrapper(wrapper.getAddress()))
          .to.emit(rebalancePool, "UpdateWrapper")
          .withArgs(await wrapper.getAddress());
        expect(await rebalancePool.wrapper()).to.eq(await wrapper.getAddress());
      });
    });

    context("#updateLiquidatableCollateralRatio", async () => {
      it("should revert, when non-owner call", async () => {
        await expect(rebalancePool.connect(signer).updateLiquidatableCollateralRatio(0)).to.revertedWith(
          "Ownable: caller is not the owner"
        );
      });

      it("should succeed", async () => {
        expect(await rebalancePool.liquidatableCollateralRatio()).to.eq(0n);
        await expect(rebalancePool.updateLiquidatableCollateralRatio(1))
          .to.emit(rebalancePool, "UpdateLiquidatableCollateralRatio")
          .withArgs(1);
        expect(await rebalancePool.liquidatableCollateralRatio()).to.eq(1);
      });
    });

    context("#updateUnlockDuration", async () => {
      it("should revert, when non-owner call", async () => {
        await expect(rebalancePool.connect(signer).updateUnlockDuration(0)).to.revertedWith(
          "Ownable: caller is not the owner"
        );
      });

      it("should succeed", async () => {
        expect(await rebalancePool.unlockDuration()).to.eq(86400 * 14);
        await expect(rebalancePool.updateUnlockDuration(86401))
          .to.emit(rebalancePool, "UpdateUnlockDuration")
          .withArgs(86401);
        expect(await rebalancePool.unlockDuration()).to.eq(86401);
      });
    });

    context("#addReward", async () => {
      it("should revert, when non-owner call", async () => {
        await expect(rebalancePool.connect(signer).addReward(ZeroAddress, ZeroAddress, 0)).to.revertedWith(
          "Ownable: caller is not the owner"
        );
      });

      it("should revert, when duplicated reward token", async () => {
        await rebalancePool.addReward(weth.getAddress(), deployer.address, 10);
        await expect(rebalancePool.addReward(weth.getAddress(), deployer.address, 10)).to.revertedWith(
          "duplicated reward token"
        );
      });

      it("should revert, when zero manager address", async () => {
        await expect(rebalancePool.addReward(weth.getAddress(), ZeroAddress, 10)).to.revertedWith(
          "zero manager address"
        );
      });

      it("should revert, when zero period length", async () => {
        await expect(rebalancePool.addReward(weth.getAddress(), deployer.address, 0)).to.revertedWith(
          "zero period length"
        );
      });

      it("should succeed", async () => {
        await expect(rebalancePool.addReward(weth.getAddress(), deployer.address, 86400))
          .to.emit(rebalancePool, "AddRewardToken")
          .withArgs(await weth.getAddress(), deployer.address, 86400);
        expect(await rebalancePool.extraRewardsLength()).to.eq(1);
        expect(await rebalancePool.extraRewards(0)).to.eq(await weth.getAddress());
        expect(await rebalancePool.rewardManager(weth.getAddress())).to.eq(deployer.address);
        expect((await rebalancePool.extraRewardState(weth.getAddress())).periodLength).to.eq(86400);
      });
    });

    context("#updateReward", async () => {
      beforeEach(async () => {
        await expect(rebalancePool.addReward(weth.getAddress(), deployer.address, 86400))
          .to.emit(rebalancePool, "AddRewardToken")
          .withArgs(await weth.getAddress(), deployer.address, 86400);
      });

      it("should revert, when non-owner call", async () => {
        await expect(rebalancePool.connect(signer).updateReward(ZeroAddress, ZeroAddress, 0)).to.revertedWith(
          "Ownable: caller is not the owner"
        );
      });

      it("should revert, when no such reward token", async () => {
        await expect(rebalancePool.updateReward(ZeroAddress, deployer.address, 10)).to.revertedWith(
          "no such reward token"
        );
      });

      it("should revert, when zero manager address", async () => {
        await expect(rebalancePool.updateReward(weth.getAddress(), ZeroAddress, 10)).to.revertedWith(
          "zero manager address"
        );
      });

      it("should revert, when zero period length", async () => {
        await expect(rebalancePool.updateReward(weth.getAddress(), deployer.address, 0)).to.revertedWith(
          "zero period length"
        );
      });

      it("should succeed", async () => {
        await expect(rebalancePool.updateReward(weth.getAddress(), signer.address, 86401))
          .to.emit(rebalancePool, "UpdateRewardToken")
          .withArgs(await weth.getAddress(), signer.address, 86401);
        expect(await rebalancePool.rewardManager(weth.getAddress())).to.eq(signer.address);
        expect((await rebalancePool.extraRewardState(weth.getAddress())).periodLength).to.eq(86401);
      });
    });
  });

  context("deposit and claim", async () => {
    beforeEach(async () => {
      await oracle.setPrice(ethers.parseEther("1000"));
      await treasury.initializePrice();
      await weth.deposit({ value: ethers.parseEther("100") });

      await weth.approve(market.getAddress(), MaxUint256);
      await market.mint(ethers.parseEther("100"), deployer.address, 0, 0);
    });

    it("should revert, when deposit zero amount", async () => {
      await expect(rebalancePool.deposit(ZeroAddress, deployer.address)).to.revertedWith("deposit zero amount");
    });

    it("should succeed, when single deposit", async () => {
      await fToken.approve(rebalancePool.getAddress(), MaxUint256);
      const amountIn = ethers.parseEther("200");

      const balanceBefore = await fToken.balanceOf(deployer.address);
      await expect(rebalancePool.deposit(amountIn, signer.address))
        .to.emit(rebalancePool, "Deposit")
        .withArgs(deployer.address, signer.address, amountIn)
        .to.emit(rebalancePool, "UserDepositChange")
        .withArgs(signer.address, amountIn, 0);
      const balanceAfter = await fToken.balanceOf(deployer.address);

      expect(balanceBefore - balanceAfter).to.eq(amountIn);
      expect(await rebalancePool.totalSupply()).to.eq(amountIn);
      expect(await rebalancePool.balanceOf(signer.address)).to.eq(amountIn);
    });

    it("should succeed, when single deposit and liquidate", async () => {
      await fToken.approve(rebalancePool.getAddress(), MaxUint256);
      const amountIn = ethers.parseEther("10000");

      // deposit
      await rebalancePool.deposit(amountIn, signer.address);

      // current collateral ratio is 200%, make 300% as liquidatable
      await rebalancePool.updateLiquidatableCollateralRatio(ethers.parseEther("3"));
      await rebalancePool.updateLiquidator(liquidator.address);

      // liquidate
      await expect(rebalancePool.connect(liquidator).liquidate(ethers.parseEther("200"), 0))
        .to.emit(rebalancePool, "Liquidate")
        .withArgs(ethers.parseEther("200"), ethers.parseEther("0.2"));
      expect(await rebalancePool.totalSupply()).to.eq(amountIn - ethers.parseEther("200"));
      expect(await rebalancePool.balanceOf(signer.address)).to.closeTo(amountIn - ethers.parseEther("200"), 1e6);
      expect((await rebalancePool.epochState()).prod).to.closeTo(ethers.parseEther("0.98"), 100);
      expect((await rebalancePool.epochState()).epoch).to.eq(0);
      expect((await rebalancePool.epochState()).scale).to.eq(0);

      expect(await rebalancePool.claimable(signer.address, weth.getAddress())).to.closeTo(
        ethers.parseEther("0.2"),
        1000000
      );

      // deposit again
      await expect(rebalancePool.deposit(ethers.parseEther("100"), signer.address)).to.emit(
        rebalancePool,
        "UserDepositChange"
      );
      expect(await rebalancePool.totalSupply()).to.eq(amountIn - ethers.parseEther("100"));
      expect(await rebalancePool.balanceOf(signer.address)).to.closeTo(amountIn - ethers.parseEther("100"), 1e6);
      expect(await rebalancePool.claimable(signer.address, weth.getAddress())).to.closeTo(
        ethers.parseEther("0.2"),
        1000000
      );

      // claim
      await expect(rebalancePool.connect(signer)["claim(address,bool)"](weth.getAddress(), false)).to.emit(
        rebalancePool,
        "Claim"
      );
      expect(await weth.balanceOf(signer.address)).to.closeTo(ethers.parseEther("0.2"), 100000);
      expect(await rebalancePool.claimable(signer.address, weth.getAddress())).to.eq(0n);
    });

    it("should succed, when multiple deposit and liquidate", async () => {
      await fToken.approve(rebalancePool.getAddress(), MaxUint256);
      const amountIn1 = ethers.parseEther("10000");
      const amountIn2 = ethers.parseEther("1000");

      // deposit to signer
      await rebalancePool.deposit(amountIn1, signer.address);
      // deposit to self
      await rebalancePool.deposit(amountIn2, deployer.address);

      // current collateral ratio is 200%, make 300% as liquidatable
      await rebalancePool.updateLiquidatableCollateralRatio(ethers.parseEther("3"));
      await rebalancePool.updateLiquidator(liquidator.address);

      // liquidate
      await expect(rebalancePool.connect(liquidator).liquidate(ethers.parseEther("200"), 0))
        .to.emit(rebalancePool, "Liquidate")
        .withArgs(ethers.parseEther("200"), ethers.parseEther("0.2"));
      expect(await rebalancePool.totalSupply()).to.eq(amountIn1 + amountIn2 - ethers.parseEther("200"));
      expect(await rebalancePool.balanceOf(signer.address)).to.closeTo(
        amountIn1 - (ethers.parseEther("200") * amountIn1) / (amountIn1 + amountIn2),
        1e6
      );
      expect(await rebalancePool.balanceOf(deployer.address)).to.closeTo(
        amountIn2 - (ethers.parseEther("200") * amountIn2) / (amountIn1 + amountIn2),
        1e6
      );
      expect((await rebalancePool.epochState()).prod).to.closeTo(
        ethers.parseEther("0.981818181818181818"), // 108/110
        100
      );
      expect((await rebalancePool.epochState()).epoch).to.eq(0);
      expect((await rebalancePool.epochState()).scale).to.eq(0);

      expect(await rebalancePool.claimable(signer.address, weth.getAddress())).to.closeTo(
        (ethers.parseEther("0.2") * amountIn1) / (amountIn1 + amountIn2),
        1000000
      );
      expect(await rebalancePool.claimable(deployer.address, weth.getAddress())).to.closeTo(
        (ethers.parseEther("0.2") * amountIn2) / (amountIn1 + amountIn2),
        1000000
      );
    });
  });

  context("deposit, unlock and liquidate and withdraw", async () => {
    beforeEach(async () => {
      await oracle.setPrice(ethers.parseEther("1000"));
      await treasury.initializePrice();
      await weth.deposit({ value: ethers.parseEther("100") });

      await weth.approve(market.getAddress(), MaxUint256);
      await market.mint(ethers.parseEther("100"), deployer.address, 0, 0);
    });

    it("should succeed, when single deposit, unlock half, liquidate partial, withdraw", async () => {
      await fToken.approve(rebalancePool.getAddress(), MaxUint256);
      const amountIn = ethers.parseEther("10000");
      const unlockAmount = ethers.parseEther("2000");

      // deposit
      await rebalancePool.deposit(amountIn, signer.address);

      // unlock
      await rebalancePool.connect(signer).unlock(unlockAmount);
      const timestamp = (await ethers.provider.getBlock("latest"))!.timestamp;
      expect(await rebalancePool.balanceOf(signer.address)).to.eq(amountIn - unlockAmount);
      expect(await rebalancePool.unlockedBalanceOf(signer.address)).to.eq(0n);
      expect((await rebalancePool.unlockingBalanceOf(signer.address))._balance).to.eq(unlockAmount);
      expect((await rebalancePool.unlockingBalanceOf(signer.address))._unlockAt).to.eq(timestamp + 86400 * 14);
      expect(await rebalancePool.totalSupply()).to.eq(amountIn - unlockAmount);
      expect(await rebalancePool.totalUnlocking()).to.eq(unlockAmount);

      // 14 days later
      await network.provider.send("evm_setNextBlockTimestamp", [timestamp + 86400 * 14]);
      await network.provider.send("evm_mine", []);
      expect(await rebalancePool.unlockedBalanceOf(signer.address)).to.eq(unlockAmount);
      expect((await rebalancePool.unlockingBalanceOf(signer.address))._balance).to.eq(ZeroAddress);

      // current collateral ratio is 200%, make 300% as liquidatable
      await rebalancePool.updateLiquidatableCollateralRatio(ethers.parseEther("3"));
      await rebalancePool.updateLiquidator(liquidator.address);

      // liquidate
      await expect(rebalancePool.connect(liquidator).liquidate(ethers.parseEther("200"), 0))
        .to.emit(rebalancePool, "Liquidate")
        .withArgs(ethers.parseEther("200"), ethers.parseEther("0.2"));
      expect(await rebalancePool.totalSupply()).to.closeTo(((amountIn - unlockAmount) * 98n) / 100n, 1e6);
      expect(await rebalancePool.totalUnlocking()).to.closeTo((unlockAmount * 98n) / 100n, 1e6);
      expect(await rebalancePool.balanceOf(signer.address)).to.closeTo(((amountIn - unlockAmount) * 98n) / 100n, 1e6);
      expect(await rebalancePool.unlockedBalanceOf(signer.address)).to.closeTo((unlockAmount * 98n) / 100n, 1e6);
      expect((await rebalancePool.epochState()).prod).to.closeTo(ethers.parseEther("0.98"), 100);
      expect((await rebalancePool.epochState()).epoch).to.eq(0);
      expect((await rebalancePool.epochState()).scale).to.eq(0);

      expect(await rebalancePool.claimable(signer.address, weth.getAddress())).to.closeTo(
        ethers.parseEther("0.2"),
        1000000
      );

      // claim
      await expect(rebalancePool.connect(signer)["claim(address,bool)"](weth.getAddress(), false)).to.emit(
        rebalancePool,
        "Claim"
      );
      expect(await weth.balanceOf(signer.address)).to.closeTo(ethers.parseEther("0.2"), 100000);
      expect(await rebalancePool.claimable(signer.address, weth.getAddress())).to.eq(0n);

      // withdraw unlocked
      await expect(rebalancePool.connect(signer).withdrawUnlocked(false, false)).to.emit(
        rebalancePool,
        "WithdrawUnlocked"
      );
      expect(await fToken.balanceOf(signer.address)).to.closeTo((unlockAmount * 98n) / 100n, 1e6);
      expect(await rebalancePool.totalUnlocking()).to.closeTo(0n, 1e6);
      expect(await rebalancePool.unlockedBalanceOf(signer.address)).to.closeTo(0n, 1e6);
    });

    it("should succeed, when multiple deposit, unlock half, liquidate partial", async () => {
      await fToken.approve(rebalancePool.getAddress(), MaxUint256);
      const amountInA = ethers.parseEther("11000");
      const unlockAmountA = ethers.parseEther("2000");
      const amountInB = ethers.parseEther("9000");
      const unlockAmountB = ethers.parseEther("7000");

      // deposit
      await rebalancePool.deposit(amountInA, userA.address);
      await rebalancePool.deposit(amountInB, userB.address);

      // A unlock
      await rebalancePool.connect(userA).unlock(unlockAmountA);
      const timestampA = (await ethers.provider.getBlock("latest"))!.timestamp;
      expect(await rebalancePool.balanceOf(userA.address)).to.eq(amountInA - unlockAmountA);
      expect(await rebalancePool.unlockedBalanceOf(userA.address)).to.eq(0n);
      expect((await rebalancePool.unlockingBalanceOf(userA.address))._balance).to.eq(unlockAmountA);
      expect((await rebalancePool.unlockingBalanceOf(userA.address))._unlockAt).to.eq(timestampA + 86400 * 14);
      expect(await rebalancePool.totalSupply()).to.eq(amountInA + amountInB - unlockAmountA);
      expect(await rebalancePool.totalUnlocking()).to.eq(unlockAmountA);

      // B unlock
      await rebalancePool.connect(userB).unlock(unlockAmountB);
      const timestampB = (await ethers.provider.getBlock("latest"))!.timestamp;
      expect(await rebalancePool.balanceOf(userB.address)).to.eq(amountInB - unlockAmountB);
      expect(await rebalancePool.unlockedBalanceOf(userB.address)).to.eq(0n);
      expect((await rebalancePool.unlockingBalanceOf(userB.address))._balance).to.eq(unlockAmountB);
      expect((await rebalancePool.unlockingBalanceOf(userB.address))._unlockAt).to.eq(timestampB + 86400 * 14);
      expect(await rebalancePool.totalSupply()).to.eq(amountInA + amountInB - unlockAmountA - unlockAmountB);
      expect(await rebalancePool.totalUnlocking()).to.eq(unlockAmountA + unlockAmountB);

      // 14 days later
      await network.provider.send("evm_setNextBlockTimestamp", [timestampB + 86400 * 14]);
      await network.provider.send("evm_mine", []);
      expect(await rebalancePool.unlockedBalanceOf(userA.address)).to.eq(unlockAmountA);
      expect((await rebalancePool.unlockingBalanceOf(userA.address))._balance).to.eq(ZeroAddress);
      expect(await rebalancePool.unlockedBalanceOf(userB.address)).to.eq(unlockAmountB);
      expect((await rebalancePool.unlockingBalanceOf(userB.address))._balance).to.eq(ZeroAddress);

      // current collateral ratio is 200%, make 300% as liquidatable
      await rebalancePool.updateLiquidatableCollateralRatio(ethers.parseEther("3"));
      await rebalancePool.updateLiquidator(liquidator.address);

      // liquidate
      await expect(rebalancePool.connect(liquidator).liquidate(ethers.parseEther("200"), 0))
        .to.emit(rebalancePool, "Liquidate")
        .withArgs(ethers.parseEther("200"), ethers.parseEther("0.2"));
      expect(await rebalancePool.totalSupply()).to.closeTo(
        ((amountInA + amountInB - unlockAmountA - unlockAmountB) * 99n) / 100n,
        1e6
      );
      expect(await rebalancePool.totalUnlocking()).to.closeTo(((unlockAmountA + unlockAmountB) * 99n) / 100n, 1e6);
      expect(await rebalancePool.balanceOf(userA.address)).to.closeTo(((amountInA - unlockAmountA) * 99n) / 100n, 1e6);
      expect(await rebalancePool.balanceOf(userB.address)).to.closeTo(((amountInB - unlockAmountB) * 99n) / 100n, 1e6);
      expect(await rebalancePool.unlockedBalanceOf(userA.address)).to.closeTo((unlockAmountA * 99n) / 100n, 1e6);
      expect(await rebalancePool.unlockedBalanceOf(userB.address)).to.closeTo((unlockAmountB * 99n) / 100n, 1e6);
      expect((await rebalancePool.epochState()).prod).to.closeTo(ethers.parseEther("0.99"), 100);
      expect((await rebalancePool.epochState()).epoch).to.eq(0);
      expect((await rebalancePool.epochState()).scale).to.eq(0);

      expect(await rebalancePool.claimable(userA.address, weth.getAddress())).to.closeTo(
        (ethers.parseEther("0.2") * 11n) / 20n,
        1000000
      );
      expect(await rebalancePool.claimable(userB.address, weth.getAddress())).to.closeTo(
        (ethers.parseEther("0.2") * 9n) / 20n,
        1000000
      );
    });
  });
});
