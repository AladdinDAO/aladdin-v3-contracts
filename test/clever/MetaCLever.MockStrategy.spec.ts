/* eslint-disable camelcase */
/* eslint-disable node/no-missing-import */
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import {
  CLeverToken,
  MockERC20,
  MetaCLever,
  MockYieldToken,
  MockYieldStrategyForCLever,
  MockFurnace,
  CLeverConfiguration,
} from "../../typechain";
import { ethers } from "hardhat";
import { expect } from "chai";
import { BigNumber, constants } from "ethers";
import "../utils";

describe("MetaCLever.MockStrategy.spec", async () => {
  let admin: SignerWithAddress;
  let deployer: SignerWithAddress;
  let platform: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let clevToken: CLeverToken;
  let underlyingToken18: MockERC20;
  let underlyingToken06: MockERC20;
  let yieldToken06: MockYieldToken;
  let yieldToken18: MockYieldToken;
  let rewardToken18: MockERC20;
  let rewardToken12: MockERC20;
  let strategy06: MockYieldStrategyForCLever;
  let strategy18: MockYieldStrategyForCLever;
  let config: CLeverConfiguration;
  let furnace: MockFurnace;
  let clever: MetaCLever;

  beforeEach(async () => {
    [admin, deployer, platform, alice, bob] = await ethers.getSigners();

    const CLeverToken = await ethers.getContractFactory("CLeverToken", deployer);
    clevToken = await CLeverToken.deploy("clevX", "clevX");
    await clevToken.deployed();

    const CLeverConfiguration = await ethers.getContractFactory("CLeverConfiguration", deployer);
    config = await CLeverConfiguration.deploy();
    await config.deployed();
    await config.initialize();

    const MockFurnace = await ethers.getContractFactory("MockFurnace", deployer);
    furnace = await MockFurnace.deploy(clevToken.address);
    await furnace.deployed();

    const MetaCLever = await ethers.getContractFactory("MetaCLever", deployer);
    clever = await MetaCLever.deploy();
    await clever.initialize(clevToken.address, furnace.address);

    const MockERC20 = await ethers.getContractFactory("MockERC20", deployer);
    underlyingToken06 = await MockERC20.deploy("U06", "U06", 6);
    await underlyingToken06.deployed();
    underlyingToken18 = await MockERC20.deploy("U18", "U18", 18);
    await underlyingToken18.deployed();
    rewardToken18 = await MockERC20.deploy("R1", "R1", 18);
    await rewardToken18.deployed();
    rewardToken12 = await MockERC20.deploy("R2", "R2", 12);
    await rewardToken12.deployed();

    const MockYieldToken = await ethers.getContractFactory("MockYieldToken", deployer);
    yieldToken06 = await MockYieldToken.deploy(underlyingToken06.address, "Y06", "Y06");
    await yieldToken06.deployed();
    yieldToken18 = await MockYieldToken.deploy(underlyingToken18.address, "Y18", "Y18");
    await yieldToken18.deployed();

    const MockYieldStrategyForCLever = await ethers.getContractFactory("MockYieldStrategyForCLever", deployer);
    strategy06 = await MockYieldStrategyForCLever.deploy(
      yieldToken06.address,
      underlyingToken06.address,
      clever.address,
      [rewardToken12.address, rewardToken18.address]
    );
    await strategy06.deployed();
    strategy18 = await MockYieldStrategyForCLever.deploy(
      yieldToken18.address,
      underlyingToken18.address,
      clever.address,
      [rewardToken12.address, rewardToken18.address]
    );
    await strategy18.deployed();

    await clever.transferOwnership(admin.address);
    await clever.connect(admin).addYieldStrategy(strategy06.address, [rewardToken12.address, rewardToken18.address]);
    await clever.connect(admin).addYieldStrategy(strategy18.address, [rewardToken12.address, rewardToken18.address]);
    await clever.connect(admin).updateFeeInfo(platform.address, 1e8, 1e7, 5e7);
    await clever.connect(admin).updateCLeverConfiguration(config.address);

    await config.transferOwnership(admin.address);
    await config.connect(admin).updateBurnRatio(underlyingToken06.address, "1000000000");
    await config.connect(admin).updateBurnRatio(underlyingToken18.address, "1000000000");

    await clevToken.updateMinters([clever.address], true);
    await clevToken.updateCeiling(clever.address, ethers.utils.parseEther("100000"));
  });

  context("initialized", async () => {
    it("should revert, when initialize again", async () => {
      await expect(clever.initialize(constants.AddressZero, constants.AddressZero)).to.revertedWith(
        "Initializable: contract is already initialized"
      );
    });

    it("should initialize correctly", async () => {
      expect(await clever.owner()).to.eq(admin.address);
      expect(await clever.debtToken()).to.eq(clevToken.address);
      expect(await clever.furnace()).to.eq(furnace.address);
      expect(await clever.yieldStrategyIndex()).to.eq(2);
      expect(await clever.reserveRate()).to.eq(5e8);
      expect((await clever.feeInfo()).platform).to.eq(platform.address);
      expect((await clever.feeInfo()).platformPercentage).to.eq(1e8);
      expect((await clever.feeInfo()).bountyPercentage).to.eq(1e7);
      expect((await clever.feeInfo()).repayPercentage).to.eq(5e7);
    });
  });

  context("authentication", async () => {
    it("should revert, when non-owner call updateFeeInfo", async () => {
      await expect(clever.updateFeeInfo(constants.AddressZero, 0, 0, 0)).to.revertedWith(
        "Ownable: caller is not the owner"
      );
    });

    it("should revert, when non-owner call addYieldStrategy", async () => {
      await expect(clever.addYieldStrategy(constants.AddressZero, [])).to.revertedWith(
        "Ownable: caller is not the owner"
      );
    });

    it("should revert, when non-owner call setIsActive", async () => {
      await expect(clever.setIsActive(0, false)).to.revertedWith("Ownable: caller is not the owner");
    });

    it("should revert, when non-owner call migrateYieldStrategy", async () => {
      await expect(clever.migrateYieldStrategy(0, constants.AddressZero)).to.revertedWith(
        "Ownable: caller is not the owner"
      );
    });

    it("should revert, when non-owner call updateReserveRate", async () => {
      await expect(clever.updateReserveRate(0)).to.revertedWith("Ownable: caller is not the owner");
    });

    context("updateFeeInfo", async () => {
      it("should revert, when zero platform", async () => {
        await expect(clever.connect(admin).updateFeeInfo(constants.AddressZero, 0, 0, 0)).to.revertedWith(
          "CLever: zero address"
        );
      });

      it("should revert, when fee too large", async () => {
        await expect(clever.connect(admin).updateFeeInfo(platform.address, 2e8 + 1, 0, 0)).to.revertedWith(
          "CLever: platform fee too large"
        );
        await expect(clever.connect(admin).updateFeeInfo(platform.address, 2e8, 1e8 + 1, 0)).to.revertedWith(
          "CLever: bounty fee too large"
        );
        await expect(clever.connect(admin).updateFeeInfo(platform.address, 2e8, 1e8, 1e8 + 1)).to.revertedWith(
          "CLever: repay fee too large"
        );
      });

      it("should succeed", async () => {
        await expect(clever.connect(admin).updateFeeInfo(deployer.address, 1, 2, 3))
          .to.emit(clever, "UpdateFeeInfo")
          .withArgs(deployer.address, 1, 2, 3);
        expect((await clever.feeInfo()).platform).to.eq(deployer.address);
        expect((await clever.feeInfo()).platformPercentage).to.eq(1);
        expect((await clever.feeInfo()).bountyPercentage).to.eq(2);
        expect((await clever.feeInfo()).repayPercentage).to.eq(3);
      });
    });

    context("addYieldStrategy", async () => {
      let strategy: MockYieldStrategyForCLever;
      let strategy20: MockYieldStrategyForCLever;

      beforeEach(async () => {
        const MockERC20 = await ethers.getContractFactory("MockERC20", deployer);
        const underlyingToken20 = await MockERC20.deploy("U20", "U20", 20);
        await underlyingToken20.deployed();

        const MockYieldStrategyForCLever = await ethers.getContractFactory("MockYieldStrategyForCLever", deployer);
        strategy = await MockYieldStrategyForCLever.deploy(
          yieldToken06.address,
          underlyingToken06.address,
          clever.address,
          [rewardToken12.address, rewardToken18.address]
        );
        await strategy.deployed();

        strategy20 = await MockYieldStrategyForCLever.deploy(
          yieldToken06.address,
          underlyingToken20.address,
          clever.address,
          [rewardToken12.address, rewardToken18.address]
        );
        await strategy20.deployed();
      });

      it("should revert, when empty strategy", async () => {
        await expect(clever.connect(admin).addYieldStrategy(constants.AddressZero, [])).to.revertedWith(
          "CLever: add empty strategy"
        );
      });

      it("should revert, when duplicated strategy", async () => {
        await expect(clever.connect(admin).addYieldStrategy(strategy06.address, [])).to.revertedWith(
          "CLever: add duplicated strategy"
        );
      });

      it("should revert, when underlying decimal too large", async () => {
        await expect(clever.connect(admin).addYieldStrategy(strategy20.address, [])).to.revertedWith(
          "CLever: decimals too large"
        );
      });

      it("should succeed", async () => {
        await expect(clever.connect(admin).addYieldStrategy(strategy.address, []))
          .to.emit(clever, "AddYieldStrategy")
          .withArgs(2, strategy.address);
        expect((await clever.yieldStrategies(2)).strategy).to.eq(strategy.address);
        expect((await clever.yieldStrategies(2)).yieldToken).to.eq(yieldToken06.address);
        expect((await clever.yieldStrategies(2)).underlyingToken).to.eq(underlyingToken06.address);
        expect((await clever.yieldStrategies(2)).isActive).to.eq(true);
        expect(await clever.yieldStrategyIndex()).to.eq(3);
      });
    });

    context("setIsActive", async () => {
      it("should revert, when invalid index", async () => {
        await expect(clever.connect(admin).setIsActive(2, false)).to.revertedWith("CLever: strategy not exist");
      });

      it("should succeed", async () => {
        expect((await clever.getActiveYieldStrategies())._indices.length).to.eq(2);
        expect((await clever.getActiveYieldStrategies())._indices[0]).to.eq(BigNumber.from(0));
        expect((await clever.getActiveYieldStrategies())._indices[1]).to.eq(BigNumber.from(1));
        expect((await clever.yieldStrategies(0)).isActive).to.eq(true);
        await expect(clever.connect(admin).setIsActive(0, false))
          .to.emit(clever, "SetStrategyActive")
          .withArgs(0, false);
        expect((await clever.yieldStrategies(0)).isActive).to.eq(false);
        expect((await clever.getActiveYieldStrategies())._indices.length).to.deep.eq(1);
        expect((await clever.getActiveYieldStrategies())._indices[0]).to.deep.eq(BigNumber.from(1));
      });
    });

    context("migrateYieldStrategy", async () => {
      let newStrategy06: MockYieldStrategyForCLever;
      let strategyInvalidYield: MockYieldStrategyForCLever;
      let strategyInvalidUnderlying: MockYieldStrategyForCLever;

      beforeEach(async () => {
        const MockYieldStrategyForCLever = await ethers.getContractFactory("MockYieldStrategyForCLever", deployer);
        newStrategy06 = await MockYieldStrategyForCLever.deploy(
          yieldToken06.address,
          underlyingToken06.address,
          clever.address,
          [rewardToken12.address, rewardToken18.address]
        );
        await newStrategy06.deployed();
        strategyInvalidYield = await MockYieldStrategyForCLever.deploy(
          yieldToken18.address,
          underlyingToken06.address,
          clever.address,
          [rewardToken12.address, rewardToken18.address]
        );
        await strategyInvalidYield.deployed();
        strategyInvalidUnderlying = await MockYieldStrategyForCLever.deploy(
          yieldToken06.address,
          underlyingToken18.address,
          clever.address,
          [rewardToken12.address, rewardToken18.address]
        );
        await strategyInvalidUnderlying.deployed();
      });

      it("should revert, when invalid index", async () => {
        await expect(clever.connect(admin).migrateYieldStrategy(2, newStrategy06.address)).to.revertedWith(
          "CLever: strategy not exist"
        );
      });

      it("should revert, when migrate to same strategy", async () => {
        await expect(clever.connect(admin).migrateYieldStrategy(0, strategy06.address)).to.revertedWith(
          "CLever: migrate to same strategy"
        );
      });

      it("should revert, when yield token mismatch", async () => {
        await expect(clever.connect(admin).migrateYieldStrategy(0, strategyInvalidYield.address)).to.revertedWith(
          "CLever: yield token mismatch"
        );
      });

      it("should revert, when underlying token mismatch", async () => {
        await expect(clever.connect(admin).migrateYieldStrategy(0, strategyInvalidUnderlying.address)).to.revertedWith(
          "CLever: underlying token mismatch"
        );
      });

      it("should succeed", async () => {
        expect((await clever.yieldStrategies(0)).strategy).to.eq(strategy06.address);
        await expect(clever.connect(admin).migrateYieldStrategy(0, newStrategy06.address))
          .to.emit(clever, "MigrateYieldStrategy")
          .withArgs(0, strategy06.address, newStrategy06.address);
        expect((await clever.yieldStrategies(0)).strategy).to.eq(newStrategy06.address);
      });
    });

    context("updateReserveRate", async () => {
      it("should revert, when rate too large", async () => {
        await expect(clever.connect(admin).updateReserveRate(1e9 + 1)).to.revertedWith("CLever: invalid reserve rate");
      });

      it("should succeed", async () => {
        expect(await clever.reserveRate()).to.eq(5e8);
        await expect(clever.connect(admin).updateReserveRate(1e8)).to.emit(clever, "UpdateReserveRate").withArgs(1e8);
        expect(await clever.reserveRate()).to.eq(1e8);
      });
    });
  });

  context("getActiveYieldStrategies", async () => {
    it("should succeed", async () => {
      const [indices, strategies, underlyingTokens, yieldTokens] = await clever.getActiveYieldStrategies();
      expect(indices.length).to.eq(2);
      expect(indices[0]).to.eq(BigNumber.from(0));
      expect(indices[1]).to.eq(BigNumber.from(1));
      expect(strategies).to.deep.eq([strategy06.address, strategy18.address]);
      expect(underlyingTokens).to.deep.eq([underlyingToken06.address, underlyingToken18.address]);
      expect(yieldTokens).to.deep.eq([yieldToken06.address, yieldToken18.address]);
    });

    it("should succeed, when disable 0", async () => {
      await clever.connect(admin).setIsActive(0, false);
      const [indices, strategies, underlyingTokens, yieldTokens] = await clever.getActiveYieldStrategies();
      expect(indices.length).to.eq(1);
      expect(indices[0]).to.eq(BigNumber.from(1));
      expect(strategies).to.deep.eq([strategy18.address]);
      expect(underlyingTokens).to.deep.eq([underlyingToken18.address]);
      expect(yieldTokens).to.deep.eq([yieldToken18.address]);
    });

    it("should succeed, when disable 1", async () => {
      await clever.connect(admin).setIsActive(1, false);
      const [indices, strategies, underlyingTokens, yieldTokens] = await clever.getActiveYieldStrategies();
      expect(indices.length).to.eq(1);
      expect(indices[0]).to.eq(BigNumber.from(0));
      expect(strategies).to.deep.eq([strategy06.address]);
      expect(underlyingTokens).to.deep.eq([underlyingToken06.address]);
      expect(yieldTokens).to.deep.eq([yieldToken06.address]);
    });

    it("should succeed, when disable 0 & 1", async () => {
      await clever.connect(admin).setIsActive(0, false);
      await clever.connect(admin).setIsActive(1, false);
      const [indices, strategies, underlyingTokens, yieldTokens] = await clever.getActiveYieldStrategies();
      expect(indices.length).to.eq(0);
      expect(strategies).to.deep.eq([]);
      expect(underlyingTokens).to.deep.eq([]);
      expect(yieldTokens).to.deep.eq([]);
    });
  });

  context("updateReward", async () => {
    const delta = BigNumber.from("100");
    const deposit06 = ethers.utils.parseUnits("10000", 6);
    const deposit18 = ethers.utils.parseUnits("10000", 18);
    const profit06 = ethers.utils.parseUnits("500", 6);
    const profit18 = ethers.utils.parseUnits("1000", 18);
    const platformFee06 = profit06.mul(1e8).div(1e9);
    const platformFee18 = profit18.mul(1e8).div(1e9);
    const harvestBounty06 = profit06.sub(platformFee06).mul(1e7).div(1e9);
    const harvestBounty18 = profit18.sub(platformFee18).mul(1e7).div(1e9);
    const harvest06 = profit06.sub(harvestBounty06).sub(platformFee06);
    const harvest18 = profit18.sub(harvestBounty18).sub(platformFee18);

    beforeEach(async () => {
      await underlyingToken06.mint(deployer.address, deposit06);
      await underlyingToken18.mint(deployer.address, deposit18);
      await underlyingToken18.approve(yieldToken18.address, deposit18);
      await yieldToken18.deposit(deposit18);

      await underlyingToken06.approve(clever.address, deposit06);
      await clever.deposit(0, alice.address, deposit06, 0, true);
      await yieldToken18.approve(clever.address, deposit18);
      await clever.deposit(1, alice.address, deposit18, 0, false);

      await underlyingToken18.mint(yieldToken18.address, profit18);
    });

    it("decreases the debt when yield is earned", async () => {
      const { _totalDebt: debtBefore } = await clever.getUserInfo(alice.address);

      await clever.harvest(1, deployer.address, 0);
      expect(await underlyingToken18.balanceOf(furnace.address)).to.closeToBn(harvest18, delta);
      expect(await underlyingToken18.balanceOf(platform.address)).to.closeToBn(platformFee18, delta);
      expect(await underlyingToken18.balanceOf(deployer.address)).to.closeToBn(harvestBounty18, delta);

      const { _totalDebt: debtAfterWithoutUpdate } = await clever.getUserInfo(alice.address);
      await clever.updateReward(alice.address);
      const { _totalDebt: debtAfter } = await clever.getUserInfo(alice.address);
      const repaidDebt = debtBefore.sub(debtAfter);
      console.log("before:", debtBefore.toString(), "after:", debtAfter.toString());
      expect(debtAfter).to.eq(debtAfterWithoutUpdate);
      expect(repaidDebt).closeToBn(harvest18, delta);
    });

    it("decreases the debt when yield is earned (2 unique-decimal collaterals)", async () => {
      await underlyingToken06.mint(yieldToken06.address, profit06);

      const { _totalDebt: debtBefore } = await clever.getUserInfo(alice.address);
      await clever.harvest(0, deployer.address, 0);
      expect(await underlyingToken06.balanceOf(furnace.address)).to.closeToBn(harvest06, delta);
      expect(await underlyingToken06.balanceOf(deployer.address)).to.closeToBn(harvestBounty06, delta);
      expect(await underlyingToken06.balanceOf(platform.address)).to.closeToBn(platformFee06, delta);

      await clever.harvest(1, deployer.address, 0);
      expect(await underlyingToken18.balanceOf(furnace.address)).to.closeToBn(harvest18, delta);
      expect(await underlyingToken18.balanceOf(platform.address)).to.closeToBn(platformFee18, delta);
      expect(await underlyingToken18.balanceOf(deployer.address)).to.closeToBn(harvestBounty18, delta);

      const { _totalDebt: debtAfterWithoutUpdate } = await clever.getUserInfo(alice.address);
      await clever.updateReward(alice.address);
      const { _totalDebt: debtAfter } = await clever.getUserInfo(alice.address);
      const repaidDebt = debtBefore.sub(debtAfter);
      expect(debtAfter).to.eq(debtAfterWithoutUpdate);
      expect(repaidDebt).closeToBn(harvest18.add(harvest06.mul(1e12)), delta);
    });

    it("preharvests any tokens that have earned yield", async () => {
      await clever.updateReward(alice.address);

      const strategy = await clever.yieldStrategies(1);
      const price = await strategy18.underlyingPrice();
      const expectedHarvestable = profit18.mul(ethers.utils.parseEther("1")).div(price);

      expect(strategy.harvestableYieldTokenAmount).equal(expectedHarvestable);
      expect(strategy.activeYieldTokenAmount).equal(deposit18.sub(expectedHarvestable));
    });

    it("does NOT preharvest any tokens that have NOT earned yield", async () => {
      await clever.updateReward(alice.address);

      const strategy = await clever.yieldStrategies(0);
      expect(strategy.harvestableYieldTokenAmount).equal(0);
      expect(strategy.activeYieldTokenAmount).equal(deposit06.mul(1e12));
    });
  });

  context("harvest", async () => {
    const delta = BigNumber.from("100");
    const deposit06 = ethers.utils.parseUnits("10000", 6);
    const deposit18 = ethers.utils.parseUnits("10000", 18);
    const profit06 = ethers.utils.parseUnits("50", 6);
    const profit18 = ethers.utils.parseUnits("100", 18);
    const platformFee06 = profit06.mul(1e8).div(1e9);
    const platformFee18 = profit18.mul(1e8).div(1e9);
    const harvestBounty06 = profit06.sub(platformFee06).mul(1e7).div(1e9);
    const harvestBounty18 = profit18.sub(platformFee18).mul(1e7).div(1e9);
    const harvest06 = profit06.sub(harvestBounty06).sub(platformFee06);
    const harvest18 = profit18.sub(harvestBounty18).sub(platformFee18);
    const reward12 = ethers.utils.parseUnits("1000", 12);
    const reward18 = ethers.utils.parseUnits("2000", 18);

    const mintAmount = ethers.utils.parseUnits("400", 18);

    beforeEach(async () => {
      await underlyingToken18.mint(deployer.address, deposit18);
      await underlyingToken18.approve(yieldToken18.address, deposit18);
      await yieldToken18.deposit(deposit18);
      await yieldToken18.approve(clever.address, deposit18);
      await clever.deposit(1, alice.address, deposit18, 0, false);

      await underlyingToken06.mint(deployer.address, deposit06);
      await underlyingToken06.approve(clever.address, deposit06);
      await clever.deposit(0, alice.address, deposit06, 0, true);

      await clever.connect(alice).mint(alice.address, mintAmount, false);
    });

    it("should revert, when strategy not active", async () => {
      await expect(clever.connect(admin).harvest(2, deployer.address, constants.Zero)).to.revertedWith(
        "CLever: strategy not active"
      );
    });

    it("should revert, when insufficient harvested amount", async () => {
      await underlyingToken18.mint(strategy18.address, profit18);
      await expect(clever.harvest(1, deployer.address, profit18.add(1))).to.revertedWith(
        "CLever: insufficient harvested amount"
      );
    });

    it("should succeed, when harvest from yield token", async () => {
      const { _totalDebt: debtBefore } = await clever.getUserInfo(alice.address);

      await underlyingToken18.mint(yieldToken18.address, profit18);
      await underlyingToken06.mint(yieldToken06.address, profit06);

      const totalSupply = await yieldToken18.totalSupply();
      const minAmtOut = profit18.mul(deposit18).div(totalSupply).mul(1).div(10000); // 1bps slippage allowed

      // emit event
      await expect(clever.harvest(1, deployer.address, minAmtOut))
        .emit(clever, "Harvest")
        .withArgs(1, harvest18, platformFee18.sub(1), harvestBounty18); // some precision fix

      // send fee to fee receiver
      expect(await underlyingToken18.balanceOf(platform.address)).to.closeToBn(platformFee18, delta);
      expect(await underlyingToken18.balanceOf(deployer.address)).to.closeToBn(harvestBounty18, delta);

      // send rewards to furnace
      expect(await underlyingToken18.balanceOf(furnace.address)).to.closeToBn(harvest18, delta);

      // pay debt correctly
      await clever.harvest(0, deployer.address, 0);
      const { _totalDebt: debtAfter } = await clever.getUserInfo(alice.address);
      expect(debtAfter).to.closeToBn(debtBefore.sub(harvest18).sub(harvest06.mul(1e12)), delta);

      // set harvestableBalance to zero
      expect((await clever.yieldStrategies(0)).harvestableYieldTokenAmount).to.eq(constants.Zero);
      expect((await clever.yieldStrategies(1)).harvestableYieldTokenAmount).to.eq(constants.Zero);
    });

    it("should succeed, when harvest from extra rewards", async () => {
      const { _totalDebt: debtBefore } = await clever.getUserInfo(alice.address);

      await underlyingToken18.mint(strategy18.address, profit18);
      await underlyingToken06.mint(strategy06.address, profit06);
      await rewardToken12.mint(strategy06.address, reward12);
      await rewardToken18.mint(strategy18.address, reward18);

      expect((await clever.yieldStrategies(0)).harvestableYieldTokenAmount).to.eq(constants.Zero);
      expect((await clever.yieldStrategies(1)).harvestableYieldTokenAmount).to.eq(constants.Zero);

      // emit event
      await expect(clever.harvest(1, deployer.address, 0))
        .emit(clever, "Harvest")
        .withArgs(1, harvest18, platformFee18, harvestBounty18);

      // send fee to fee receiver
      expect(await underlyingToken18.balanceOf(platform.address)).to.closeToBn(platformFee18, delta);
      expect(await underlyingToken18.balanceOf(deployer.address)).to.closeToBn(harvestBounty18, delta);

      // send rewards to furnace
      expect(await underlyingToken18.balanceOf(furnace.address)).to.closeToBn(harvest18, delta);

      // pay debt correctly
      await clever.harvest(0, deployer.address, 0);
      const { _totalDebt: debtAfter } = await clever.getUserInfo(alice.address);
      expect(debtAfter).to.closeToBn(debtBefore.sub(harvest18).sub(harvest06.mul(1e12)), delta);

      // set harvestableBalance to zero
      expect((await clever.yieldStrategies(0)).harvestableYieldTokenAmount).to.eq(constants.Zero);
      expect((await clever.yieldStrategies(1)).harvestableYieldTokenAmount).to.eq(constants.Zero);

      // has correct extra reward balance
      expect(await rewardToken12.balanceOf(clever.address)).to.eq(reward12);
      expect(await rewardToken18.balanceOf(clever.address)).to.eq(reward18);

      // has correct pending rewads
      expect(await clever.getUserPendingExtraReward(0, alice.address, rewardToken12.address)).to.eq(reward12);
      expect(await clever.getUserPendingExtraReward(1, alice.address, rewardToken18.address)).to.eq(reward18);

      // should claim
      await clever.connect(alice).claimAll(deployer.address);
      expect(await rewardToken12.balanceOf(deployer.address)).to.eq(reward12);
      expect(await rewardToken18.balanceOf(deployer.address)).to.eq(reward18);
    });
  });

  context("deposit", async () => {
    it("should revert, when strategy inactive", async () => {
      await expect(clever.deposit(2, alice.address, constants.Zero, constants.Zero, false)).to.revertedWith(
        "CLever: strategy not active"
      );
    });

    it("should revert, when deposit zero amount", async () => {
      await expect(clever.deposit(0, alice.address, constants.Zero, constants.Zero, false)).to.revertedWith(
        "CLever: deposit zero amount"
      );
    });

    const run = async (strategyIndex: number) => {
      context(`do deposit with strategyIndex[${strategyIndex}]`, async () => {
        let underlyingToken: MockERC20;
        let yieldToken: MockYieldToken;
        let strategy: MockYieldStrategyForCLever;
        let decimals: number;

        beforeEach(async () => {
          if (strategyIndex === 0) {
            underlyingToken = underlyingToken06;
            yieldToken = yieldToken06;
            strategy = strategy06;
            decimals = 6;
          } else {
            underlyingToken = underlyingToken18;
            yieldToken = yieldToken18;
            strategy = strategy18;
            decimals = 18;
          }
        });

        it("should revert, when insufficient shares", async () => {
          const depositAmount = ethers.utils.parseUnits("500", decimals);
          await underlyingToken.mint(deployer.address, depositAmount);
          await underlyingToken.approve(yieldToken.address, depositAmount);
          await yieldToken.deposit(depositAmount);
          const yieldAmount = await yieldToken.balanceOf(deployer.address);
          await yieldToken.approve(clever.address, yieldAmount);
          await expect(
            clever.deposit(strategyIndex, alice.address, yieldAmount, yieldAmount.add(1), false)
          ).to.revertedWith("CLever: insufficient shares");
        });

        it("should succeed, when deposit one time", async () => {
          // turn underlying to yield token
          const underlyingAmount = ethers.utils.parseUnits("500", decimals);
          await underlyingToken.mint(deployer.address, underlyingAmount);
          await underlyingToken.approve(yieldToken.address, underlyingAmount);
          await yieldToken.deposit(underlyingAmount);
          const yieldAmount = await yieldToken.balanceOf(deployer.address);

          const balanceBefore = await yieldToken.balanceOf(deployer.address);
          const strategyBalanceBefore = await yieldToken.balanceOf(strategy.address);
          const infoBefore = await clever.getUserStrategyInfo(alice.address, strategyIndex);
          const { _indices: depositedStrategyBefore } = await clever.getUserInfo(alice.address);

          // emit event
          await yieldToken.approve(clever.address, yieldAmount);
          await expect(clever.deposit(strategyIndex, alice.address, yieldAmount, 0, false))
            .to.emit(clever, "Deposit")
            .withArgs(strategyIndex, alice.address, yieldAmount, yieldAmount);
          const balanceAfter = await yieldToken.balanceOf(deployer.address);
          const strategyBalanceAfter = await yieldToken.balanceOf(strategy.address);
          const infoAfter = await clever.getUserStrategyInfo(alice.address, strategyIndex);
          const { _indices: depositedStrategyAfter } = await clever.getUserInfo(alice.address);

          // transfer from caller
          expect(balanceBefore.sub(balanceAfter)).equals(yieldAmount);
          // transfer to strategy
          expect(strategyBalanceAfter.sub(strategyBalanceBefore)).equals(yieldAmount);
          // issue shares to recipient
          expect(infoAfter._share.sub(infoBefore._share)).to.eq(yieldAmount);
          // have correct amount
          expect(infoAfter._underlyingTokenAmount.sub(infoBefore._underlyingTokenAmount)).to.eq(underlyingAmount);
          expect(infoAfter._yieldTokenAmount.sub(infoBefore._yieldTokenAmount)).to.eq(yieldAmount);
          // add to deposited mask
          expect(depositedStrategyBefore.map((v) => v.toNumber())).does.not.include(strategyIndex);
          expect(depositedStrategyAfter.map((v) => v.toNumber())).include(strategyIndex);
        });

        it("should succeed, when deposit after harvest", async () => {
          // turn underlying to yield token
          const underlyingAmount = ethers.utils.parseUnits("500", decimals);
          await underlyingToken.mint(deployer.address, underlyingAmount);
          await underlyingToken.approve(yieldToken.address, underlyingAmount);
          await yieldToken.deposit(underlyingAmount);
          const yieldAmount = await yieldToken.balanceOf(deployer.address);
          // now deployer have 2 * yieldAmount YieldToken
          await underlyingToken.mint(deployer.address, underlyingAmount);
          await underlyingToken.approve(yieldToken.address, underlyingAmount);
          await yieldToken.deposit(underlyingAmount);

          await yieldToken.approve(clever.address, yieldAmount);
          await clever.deposit(strategyIndex, alice.address, yieldAmount, 0, false);

          const profit = ethers.utils.parseUnits("100", decimals);
          await underlyingToken.mint(yieldToken.address, profit);

          await clever.harvest(strategyIndex, deployer.address, 0);

          const price = await clever.getYieldTokenPerShare(strategyIndex);

          const infoBefore = await clever.getUserStrategyInfo(alice.address, strategyIndex);
          await yieldToken.approve(clever.address, yieldAmount);
          const issuedShare = await clever.callStatic.deposit(strategyIndex, alice.address, yieldAmount, 0, false);
          await clever.deposit(strategyIndex, alice.address, yieldAmount, 0, false);
          const infoAfter = await clever.getUserStrategyInfo(alice.address, strategyIndex);

          expect(infoAfter._share.sub(infoBefore._share)).to.eq(issuedShare);
          expect(infoAfter._share.sub(infoBefore._share)).to.closeToBn(
            yieldAmount.mul(ethers.utils.parseEther("1")).div(price),
            1000
          );
        });

        it("should succeed, when multiple users deposit", async () => {
          const underlyingAmountAlice = ethers.utils.parseUnits("500", decimals);
          const underlyingAmountBob = ethers.utils.parseUnits("600", decimals);
          await underlyingToken.mint(alice.address, underlyingAmountAlice);
          await underlyingToken.mint(bob.address, underlyingAmountBob);
          await underlyingToken.connect(alice).approve(yieldToken.address, underlyingAmountAlice);
          await underlyingToken.connect(bob).approve(yieldToken.address, underlyingAmountBob);
          await yieldToken.connect(alice).deposit(underlyingAmountAlice);
          await yieldToken.connect(bob).deposit(underlyingAmountBob);
          const yieldAmountAlice = await yieldToken.balanceOf(alice.address);
          const yieldAmountBob = await yieldToken.balanceOf(bob.address);

          const infoBeforeAlice = await clever.getUserStrategyInfo(alice.address, strategyIndex);
          const infoBeforeBob = await clever.getUserStrategyInfo(bob.address, strategyIndex);

          // alice deposit
          await yieldToken.connect(alice).approve(clever.address, yieldAmountAlice);
          const actualShareAlice = await clever
            .connect(alice)
            .callStatic.deposit(strategyIndex, alice.address, yieldAmountAlice, 0, false);
          await clever.connect(alice).deposit(strategyIndex, alice.address, yieldAmountAlice, 0, false);

          const profit = ethers.utils.parseUnits("10", decimals);
          await underlyingToken.mint(yieldToken.address, profit);
          await clever.harvest(strategyIndex, deployer.address, 0);

          const infoAfterAlice = await clever.getUserStrategyInfo(alice.address, strategyIndex);

          const strategyInfo = await clever.yieldStrategies(strategyIndex);
          const expectedShareBob = yieldAmountBob.mul(strategyInfo.totalShare).div(strategyInfo.activeYieldTokenAmount);

          // bob deposit
          await yieldToken.connect(bob).approve(clever.address, yieldAmountBob);
          const actualShareBob = await clever
            .connect(bob)
            .callStatic.deposit(strategyIndex, bob.address, yieldAmountBob, 0, false);
          await clever.connect(bob).deposit(strategyIndex, bob.address, yieldAmountBob, 0, false);

          const infoAfterBob = await clever.getUserStrategyInfo(bob.address, strategyIndex);
          expect(infoAfterAlice._share.sub(infoBeforeAlice._share)).to.closeToBn(yieldAmountAlice, 1000);
          expect(infoAfterAlice._share.sub(infoBeforeAlice._share)).to.eq(actualShareAlice);
          expect(infoAfterBob._share.sub(infoBeforeBob._share)).to.closeToBn(expectedShareBob, 1000);
          expect(infoAfterBob._share.sub(infoBeforeBob._share)).to.eq(actualShareBob);
        });
      });
    };

    run(0);
    run(1);
  });

  context("depositUnderlying", async () => {
    it("should revert, when strategy inactive", async () => {
      await expect(clever.deposit(2, alice.address, constants.Zero, constants.Zero, true)).to.revertedWith(
        "CLever: strategy not active"
      );
    });

    it("should revert, when deposit zero amount", async () => {
      await expect(clever.deposit(0, alice.address, constants.Zero, constants.Zero, true)).to.revertedWith(
        "CLever: deposit zero amount"
      );
    });

    const run = async (strategyIndex: number) => {
      context(`do deposit with strategyIndex[${strategyIndex}]`, async () => {
        let underlyingToken: MockERC20;
        let yieldToken: MockYieldToken;
        let strategy: MockYieldStrategyForCLever;
        let decimals: number;

        beforeEach(async () => {
          if (strategyIndex === 0) {
            underlyingToken = underlyingToken06;
            yieldToken = yieldToken06;
            strategy = strategy06;
            decimals = 6;
          } else {
            underlyingToken = underlyingToken18;
            yieldToken = yieldToken18;
            strategy = strategy18;
            decimals = 18;
          }
        });

        it("should revert, when insufficient shares", async () => {
          const underlyingAmount = ethers.utils.parseUnits("500", decimals);
          await underlyingToken.mint(deployer.address, underlyingAmount);
          await underlyingToken.approve(yieldToken.address, underlyingAmount);
          const yieldAmount = await yieldToken.callStatic.deposit(underlyingAmount);
          await underlyingToken.approve(clever.address, underlyingAmount);
          await expect(
            clever.deposit(strategyIndex, alice.address, underlyingAmount, yieldAmount.add(1), true)
          ).to.revertedWith("CLever: insufficient shares");
        });

        it("should succeed, when deposit one time", async () => {
          // turn underlying to yield token
          const underlyingAmount = ethers.utils.parseUnits("500", decimals);
          await underlyingToken.mint(deployer.address, underlyingAmount);
          await underlyingToken.approve(yieldToken.address, underlyingAmount);
          const yieldAmount = await yieldToken.callStatic.deposit(underlyingAmount);

          const balanceBefore = await underlyingToken.balanceOf(deployer.address);
          const strategyBalanceBefore = await yieldToken.balanceOf(strategy.address);
          const infoBefore = await clever.getUserStrategyInfo(alice.address, strategyIndex);
          const { _indices: depositedStrategyBefore } = await clever.getUserInfo(alice.address);

          // emit event
          await underlyingToken.approve(clever.address, underlyingAmount);
          await expect(clever.deposit(strategyIndex, alice.address, underlyingAmount, 0, true))
            .to.emit(clever, "Deposit")
            .withArgs(strategyIndex, alice.address, yieldAmount, yieldAmount);
          const balanceAfter = await underlyingToken.balanceOf(deployer.address);
          const strategyBalanceAfter = await yieldToken.balanceOf(strategy.address);
          const infoAfter = await clever.getUserStrategyInfo(alice.address, strategyIndex);
          const { _indices: depositedStrategyAfter } = await clever.getUserInfo(alice.address);

          // transfer from caller
          expect(balanceBefore.sub(balanceAfter)).equals(underlyingAmount);
          // transfer to strategy
          expect(strategyBalanceAfter.sub(strategyBalanceBefore)).equals(yieldAmount);
          // issue shares to recipient
          expect(infoAfter._share.sub(infoBefore._share)).to.eq(yieldAmount);
          // have correct amount
          expect(infoAfter._underlyingTokenAmount.sub(infoBefore._underlyingTokenAmount)).to.eq(underlyingAmount);
          expect(infoAfter._yieldTokenAmount.sub(infoBefore._yieldTokenAmount)).to.eq(yieldAmount);
          // add to deposited mask
          expect(depositedStrategyBefore.map((v) => v.toNumber())).does.not.include(strategyIndex);
          expect(depositedStrategyAfter.map((v) => v.toNumber())).include(strategyIndex);
        });

        it("should succeed, when deposit after harvest", async () => {
          const underlyingAmount = ethers.utils.parseUnits("500", decimals);
          await underlyingToken.mint(alice.address, underlyingAmount);
          await underlyingToken.connect(alice).approve(yieldToken.address, underlyingAmount);
          const yieldAmount = await yieldToken.connect(alice).callStatic.deposit(underlyingAmount);

          await underlyingToken.connect(alice).approve(clever.address, underlyingAmount);
          await clever.connect(alice).deposit(strategyIndex, alice.address, underlyingAmount, yieldAmount, true);

          const infoBefore = await clever.getUserStrategyInfo(alice.address, strategyIndex);

          const profit = ethers.utils.parseUnits("100", decimals);
          await underlyingToken.mint(yieldToken.address, profit);
          await clever.harvest(strategyIndex, deployer.address, 0);

          const price = await clever.getUnderlyingTokenPerShare(strategyIndex);
          const expectedIssued = underlyingAmount.mul(ethers.utils.parseEther("1")).div(price);
          await underlyingToken.mint(alice.address, underlyingAmount);
          await underlyingToken.connect(alice).approve(clever.address, underlyingAmount);
          await clever
            .connect(alice)
            .deposit(strategyIndex, alice.address, underlyingAmount, expectedIssued.mul(9999).div(10000), true);

          const infoAfter = await clever.getUserStrategyInfo(alice.address, strategyIndex);
          expect(infoAfter._share.sub(infoBefore._share)).to.closeToBn(
            expectedIssued,
            BigNumber.from(10)
              .pow(18 - decimals)
              .mul(10)
          );
        });

        it("should succeed, when multiple users deposit", async () => {
          const underlyingAmountAlice = ethers.utils.parseUnits("500", decimals);
          const underlyingAmountBob = ethers.utils.parseUnits("600", decimals);
          await underlyingToken.mint(alice.address, underlyingAmountAlice);
          await underlyingToken.mint(bob.address, underlyingAmountBob);
          await underlyingToken.connect(alice).approve(yieldToken.address, underlyingAmountAlice);
          await underlyingToken.connect(bob).approve(yieldToken.address, underlyingAmountBob);
          const yieldAmountAlice = await yieldToken.connect(alice).callStatic.deposit(underlyingAmountAlice);

          const infoBeforeAlice = await clever.getUserStrategyInfo(alice.address, strategyIndex);
          const infoBeforeBob = await clever.getUserStrategyInfo(bob.address, strategyIndex);

          // alice deposit
          await underlyingToken.connect(alice).approve(clever.address, underlyingAmountAlice);
          const actualShareAlice = await clever
            .connect(alice)
            .callStatic.deposit(strategyIndex, alice.address, underlyingAmountAlice, 0, true);
          await clever.connect(alice).deposit(strategyIndex, alice.address, underlyingAmountAlice, 0, true);

          const profit = ethers.utils.parseUnits("10", decimals);
          await underlyingToken.mint(yieldToken.address, profit);
          await clever.harvest(strategyIndex, deployer.address, 0);

          const infoAfterAlice = await clever.getUserStrategyInfo(alice.address, strategyIndex);

          const strategyInfo = await clever.yieldStrategies(strategyIndex);
          const yieldAmountBob = await yieldToken.connect(bob).callStatic.deposit(underlyingAmountBob);
          const expectedShareBob = yieldAmountBob.mul(strategyInfo.totalShare).div(strategyInfo.activeYieldTokenAmount);

          // bob deposit
          await underlyingToken.connect(bob).approve(clever.address, underlyingAmountBob);
          const actualShareBob = await clever
            .connect(bob)
            .callStatic.deposit(strategyIndex, bob.address, underlyingAmountBob, 0, true);
          await clever.connect(bob).deposit(strategyIndex, bob.address, underlyingAmountBob, 0, true);

          const infoAfterBob = await clever.getUserStrategyInfo(bob.address, strategyIndex);
          expect(infoAfterAlice._share.sub(infoBeforeAlice._share)).to.closeToBn(yieldAmountAlice, 1000);
          expect(infoAfterAlice._share.sub(infoBeforeAlice._share)).to.eq(actualShareAlice);
          expect(infoAfterBob._share.sub(infoBeforeBob._share)).to.closeToBn(expectedShareBob, 1000);
          expect(infoAfterBob._share.sub(infoBeforeBob._share)).to.eq(actualShareBob);
        });
      });
    };

    run(0);
    run(1);
  });

  context("withdraw", async () => {
    it("should revert, when strategy inactive", async () => {
      await expect(clever.withdraw(2, alice.address, constants.Zero, constants.Zero, true)).to.revertedWith(
        "CLever: strategy not active"
      );
    });

    it("should revert, when withdraw zero share", async () => {
      await expect(clever.withdraw(0, alice.address, constants.Zero, constants.Zero, true)).to.revertedWith(
        "CLever: withdraw zero share"
      );
    });

    const run = async (strategyIndex: number, asUnderlying: boolean) => {
      context(`do withdraw with strategyIndex[${strategyIndex}] and asUnderlying[${asUnderlying}]`, async () => {
        let underlyingToken: MockERC20;
        let yieldToken: MockYieldToken;
        let strategy: MockYieldStrategyForCLever;
        let decimals: number;

        beforeEach(async () => {
          if (strategyIndex === 0) {
            underlyingToken = underlyingToken06;
            yieldToken = yieldToken06;
            strategy = strategy06;
            decimals = 6;
          } else {
            underlyingToken = underlyingToken18;
            yieldToken = yieldToken18;
            strategy = strategy18;
            decimals = 18;
          }
        });

        it("should revert, when withdraw exceed balance", async () => {
          // turn underlying to yield token
          const underlyingAmount = ethers.utils.parseUnits("500", decimals);
          await underlyingToken.mint(deployer.address, underlyingAmount);
          await underlyingToken.approve(yieldToken.address, underlyingAmount);
          await yieldToken.deposit(underlyingAmount);
          const yieldAmount = await yieldToken.balanceOf(deployer.address);

          // deposit
          await yieldToken.approve(clever.address, yieldAmount);
          await clever.deposit(strategyIndex, alice.address, yieldAmount, 0, false);

          // withdraw
          await expect(
            clever.connect(alice).withdraw(strategyIndex, alice.address, yieldAmount.add(1), 0, asUnderlying)
          ).to.revertedWith("CLever: withdraw exceed balance");
        });

        it("should revert, when insufficient output", async () => {
          // turn underlying to yield token
          const underlyingAmount = ethers.utils.parseUnits("500", decimals);
          await underlyingToken.mint(deployer.address, underlyingAmount);
          await underlyingToken.approve(yieldToken.address, underlyingAmount);
          await yieldToken.deposit(underlyingAmount);
          const yieldAmount = await yieldToken.balanceOf(deployer.address);

          // deposit
          await yieldToken.approve(clever.address, yieldAmount);
          await clever.deposit(strategyIndex, alice.address, yieldAmount, 0, false);

          // withdraw
          await expect(
            clever
              .connect(alice)
              .withdraw(
                strategyIndex,
                alice.address,
                yieldAmount,
                (asUnderlying ? underlyingAmount : yieldAmount).add(1),
                asUnderlying
              )
          ).to.revertedWith("CLever: insufficient output");
        });

        it("should revert, when account undercollateralized", async () => {
          // turn underlying to yield token
          const underlyingAmount = ethers.utils.parseUnits("500", decimals);
          await underlyingToken.mint(deployer.address, underlyingAmount);
          await underlyingToken.approve(yieldToken.address, underlyingAmount);
          await yieldToken.deposit(underlyingAmount);
          const yieldAmount = await yieldToken.balanceOf(deployer.address);

          // deposit
          await yieldToken.approve(clever.address, yieldAmount);
          await clever.deposit(strategyIndex, alice.address, yieldAmount, 0, false);

          // mint 25%
          await clever.connect(alice).mint(alice.address, ethers.utils.parseUnits("125", 18), false);

          // withdraw 50% + epsilon
          await expect(
            clever.connect(alice).withdraw(strategyIndex, alice.address, yieldAmount.div(2).add(1), 0, asUnderlying)
          ).to.revertedWith("CLever: account undercollateralized");
        });

        it("should succeed, when withdraw half right after deposit", async () => {
          // turn underlying to yield token
          const underlyingAmount = ethers.utils.parseUnits("500", decimals);
          await underlyingToken.mint(deployer.address, underlyingAmount);
          await underlyingToken.approve(yieldToken.address, underlyingAmount);
          await yieldToken.deposit(underlyingAmount);
          const yieldAmount = await yieldToken.balanceOf(deployer.address);
          const withdrawAmount = yieldAmount.div(2);

          // deposit
          await yieldToken.approve(clever.address, yieldAmount);
          await clever.deposit(strategyIndex, alice.address, yieldAmount, 0, false);

          const balanceBefore = await (asUnderlying ? underlyingToken : yieldToken).balanceOf(alice.address);
          const infoBefore = await clever.getUserStrategyInfo(alice.address, strategyIndex);
          // withdraw, emit event
          await expect(clever.connect(alice).withdraw(strategyIndex, alice.address, withdrawAmount, 0, asUnderlying))
            .to.emit(clever, "Withdraw")
            .withArgs(
              strategyIndex,
              alice.address,
              withdrawAmount,
              asUnderlying ? underlyingAmount.div(2) : withdrawAmount
            );
          const balanceAfter = await (asUnderlying ? underlyingToken : yieldToken).balanceOf(alice.address);
          const infoAfter = await clever.getUserStrategyInfo(alice.address, strategyIndex);

          // token transfer to recipient
          expect(balanceAfter.sub(balanceBefore)).to.eq(asUnderlying ? underlyingAmount.div(2) : withdrawAmount);

          // share burned
          expect(infoBefore._share.sub(infoAfter._share)).to.eq(withdrawAmount);
          expect(infoBefore._underlyingTokenAmount.sub(infoAfter._underlyingTokenAmount)).to.eq(
            withdrawAmount.mul(underlyingAmount).div(yieldAmount)
          );
          expect(infoBefore._yieldTokenAmount.sub(infoAfter._yieldTokenAmount)).to.eq(withdrawAmount);
        });

        it("should succeed, when withdraw after yield token price up", async () => {
          // turn underlying to yield token
          const underlyingAmount = ethers.utils.parseUnits("500", decimals);
          await underlyingToken.mint(deployer.address, underlyingAmount);
          await underlyingToken.approve(yieldToken.address, underlyingAmount);
          await yieldToken.deposit(underlyingAmount);
          const yieldAmount = await yieldToken.balanceOf(deployer.address);
          const withdrawAmount = yieldAmount.div(2);

          // deposit
          await yieldToken.approve(clever.address, yieldAmount);
          await clever.deposit(strategyIndex, alice.address, yieldAmount, 0, false);

          const { harvestableYieldTokenAmount: harvestedBefore } = await clever.yieldStrategies(strategyIndex);

          // add profit
          const profit = ethers.utils.parseUnits("100", decimals);
          await underlyingToken.mint(yieldToken.address, profit);

          // withdraw
          await clever.connect(alice).withdraw(strategyIndex, alice.address, withdrawAmount, 0, asUnderlying);

          const {
            harvestableYieldTokenAmount: harvestedAfter,
            expectedUnderlyingTokenAmount,
            activeYieldTokenAmount,
          } = await clever.yieldStrategies(strategyIndex);

          const price = await strategy.underlyingPrice();
          const underlyingLeftAmount = yieldAmount.sub(withdrawAmount).mul(underlyingAmount).div(yieldAmount);
          expect(harvestedAfter.sub(harvestedBefore)).to.eq(profit.mul(ethers.utils.parseEther("1")).div(price));
          expect(expectedUnderlyingTokenAmount).to.closeToBn(underlyingLeftAmount, 1000);
          expect(activeYieldTokenAmount).to.closeToBn(
            underlyingLeftAmount.mul(ethers.utils.parseEther("1")).div(price),
            1000
          );
        });

        it("should succeed, when withdraw all right after deposit", async () => {
          // turn underlying to yield token
          const underlyingAmount = ethers.utils.parseUnits("500", decimals);
          await underlyingToken.mint(deployer.address, underlyingAmount);
          await underlyingToken.approve(yieldToken.address, underlyingAmount);
          await yieldToken.deposit(underlyingAmount);
          const yieldAmount = await yieldToken.balanceOf(deployer.address);
          const withdrawAmount = yieldAmount;

          // deposit
          await yieldToken.approve(clever.address, yieldAmount);
          await clever.deposit(strategyIndex, alice.address, yieldAmount, 0, false);

          const { _indices: depositedStrategyBefore } = await clever.getUserInfo(alice.address);
          expect(depositedStrategyBefore.map((r) => r.toNumber())).to.include(strategyIndex);

          // withdraw all
          await clever.connect(alice).withdraw(strategyIndex, alice.address, withdrawAmount, 0, asUnderlying);

          const { _indices: depositedStrategyAfter } = await clever.getUserInfo(alice.address);
          expect(depositedStrategyAfter.map((r) => r.toNumber())).to.not.include(strategyIndex);
        });
      });
    };

    run(0, false);
    run(0, true);
    run(1, false);
    run(1, true);
  });

  context("mint", async () => {
    it("should revert, when mint zero", async () => {
      await expect(clever.mint(alice.address, 0, false)).to.revertedWith("CLever: mint zero amount");
    });

    const mintSingleStrategy = async (strategyIndex: number, depositToFurnace: boolean) => {
      context(`do mint single strategy[${strategyIndex}], depositToFurnace[${depositToFurnace}]`, async () => {
        let underlyingToken: MockERC20;
        let yieldToken: MockYieldToken;
        let decimals: number;

        beforeEach(async () => {
          if (strategyIndex === 0) {
            underlyingToken = underlyingToken06;
            yieldToken = yieldToken06;
            decimals = 6;
          } else {
            underlyingToken = underlyingToken18;
            yieldToken = yieldToken18;
            decimals = 18;
          }
        });

        it("should revert, when account undercollateralized", async () => {
          // turn underlying to yield token
          const underlyingAmount = ethers.utils.parseUnits("500", decimals);
          await underlyingToken.mint(deployer.address, underlyingAmount);
          await underlyingToken.approve(yieldToken.address, underlyingAmount);
          await yieldToken.deposit(underlyingAmount);
          const yieldAmount = await yieldToken.balanceOf(deployer.address);

          // deposit
          await yieldToken.approve(clever.address, yieldAmount);
          await clever.deposit(strategyIndex, alice.address, yieldAmount, 0, false);

          // mint 50% + epsilon
          await expect(
            clever.connect(alice).mint(alice.address, ethers.utils.parseUnits("250", 18).add(1), depositToFurnace)
          ).to.revertedWith("CLever: account undercollateralized");
        });

        it("should succeed, when mint after deposit", async () => {
          // turn underlying to yield token
          const underlyingAmount = ethers.utils.parseUnits("500", decimals);
          await underlyingToken.mint(deployer.address, underlyingAmount);
          await underlyingToken.approve(yieldToken.address, underlyingAmount);
          await yieldToken.deposit(underlyingAmount);
          const yieldAmount = await yieldToken.balanceOf(deployer.address);
          const mintAmount = ethers.utils.parseUnits("250", 18);

          // deposit
          await yieldToken.approve(clever.address, yieldAmount);
          await clever.deposit(strategyIndex, alice.address, yieldAmount, 0, false);

          const { _totalDebt: debtBefore } = await clever.getUserInfo(alice.address);
          const balanceBefore = await clevToken.balanceOf(depositToFurnace ? furnace.address : alice.address);

          // mint, will emit event
          if (depositToFurnace) {
            await expect(clever.connect(alice).mint(alice.address, mintAmount, depositToFurnace))
              .to.emit(clever, "Mint")
              .withArgs(alice.address, alice.address, mintAmount)
              .to.emit(furnace, "Deposit")
              .withArgs(alice.address, mintAmount);
          } else {
            await expect(clever.connect(alice).mint(alice.address, mintAmount, depositToFurnace))
              .to.emit(clever, "Mint")
              .withArgs(alice.address, alice.address, mintAmount);
          }

          const { _totalDebt: debtAfter } = await clever.getUserInfo(alice.address);
          const balanceAfter = await clevToken.balanceOf(depositToFurnace ? furnace.address : alice.address);

          // increase account debt
          expect(debtAfter.sub(debtBefore)).to.eq(mintAmount);

          // transfer token to furnace or recipient
          expect(balanceAfter.sub(balanceBefore)).to.eq(mintAmount);
        });
      });
    };

    mintSingleStrategy(0, false);
    mintSingleStrategy(0, true);
    mintSingleStrategy(1, false);
    mintSingleStrategy(1, true);

    context(`do mint two strategies`, async () => {
      it("should succeed, when mint after two deposits", async () => {
        // turn underlying to yield token
        const underlyingAmount06 = ethers.utils.parseUnits("500", 6);
        const underlyingAmount18 = ethers.utils.parseUnits("500", 18);
        await underlyingToken06.mint(alice.address, underlyingAmount06);
        await underlyingToken18.mint(alice.address, underlyingAmount18);
        await underlyingToken06.connect(alice).approve(yieldToken06.address, underlyingAmount06);
        await underlyingToken18.connect(alice).approve(yieldToken18.address, underlyingAmount18);
        await yieldToken06.connect(alice).deposit(underlyingAmount06);
        await yieldToken18.connect(alice).deposit(underlyingAmount18);
        const yieldAmount06 = await yieldToken06.balanceOf(alice.address);
        const yieldAmount18 = await yieldToken18.balanceOf(alice.address);
        const mintAmount = ethers.utils.parseUnits("500", 18);

        // deposit strategy 0
        await yieldToken06.connect(alice).approve(clever.address, yieldAmount06);
        await clever.connect(alice).deposit(0, alice.address, yieldAmount06, 0, false);
        // deposit strategy 1
        await yieldToken18.connect(alice).approve(clever.address, yieldAmount18);
        await clever.connect(alice).deposit(1, alice.address, yieldAmount18, 0, false);

        const balanceBefore = await clevToken.balanceOf(alice.address);
        // mint, should emit event
        await expect(clever.connect(alice).mint(alice.address, mintAmount, false))
          .to.emit(clever, "Mint")
          .withArgs(alice.address, alice.address, mintAmount);
        const balanceAfter = await clevToken.balanceOf(alice.address);
        expect(balanceAfter.sub(balanceBefore)).to.eq(mintAmount);
      });

      it("should succeed, when mint after harvest", async () => {
        // turn underlying to yield token
        const underlyingAmount06 = ethers.utils.parseUnits("500", 6);
        const underlyingAmount18 = ethers.utils.parseUnits("500", 18);
        await underlyingToken06.mint(alice.address, underlyingAmount06);
        await underlyingToken18.mint(alice.address, underlyingAmount18);
        await underlyingToken06.connect(alice).approve(yieldToken06.address, underlyingAmount06);
        await underlyingToken18.connect(alice).approve(yieldToken18.address, underlyingAmount18);
        await yieldToken06.connect(alice).deposit(underlyingAmount06);
        await yieldToken18.connect(alice).deposit(underlyingAmount18);
        const yieldAmount06 = await yieldToken06.balanceOf(alice.address);
        const yieldAmount18 = await yieldToken18.balanceOf(alice.address);
        const mintAmount = ethers.utils.parseUnits("500", 18);

        // deposit strategy 0
        await yieldToken06.connect(alice).approve(clever.address, yieldAmount06);
        await clever.connect(alice).deposit(0, alice.address, yieldAmount06, 0, false);
        // deposit strategy 1
        await yieldToken18.connect(alice).approve(clever.address, yieldAmount18);
        await clever.connect(alice).deposit(1, alice.address, yieldAmount18, 0, false);

        // add profit
        await underlyingToken06.mint(yieldToken06.address, ethers.utils.parseUnits("50", 6));
        await underlyingToken18.mint(yieldToken18.address, ethers.utils.parseUnits("100", 18));

        // harvest
        await clever.harvest(0, deployer.address, 0);
        await clever.harvest(1, deployer.address, 0);

        // update rewards
        await clever.updateReward(alice.address);
        const infoBefore = await clever.getUserInfo(alice.address);
        const balanceBefore = await clevToken.balanceOf(alice.address);
        await clever.connect(alice).mint(alice.address, mintAmount, false);
        const infoAfter = await clever.getUserInfo(alice.address);
        const balanceAfter = await clevToken.balanceOf(alice.address);

        expect(balanceAfter.sub(balanceBefore)).equal(mintAmount);
        expect(infoAfter._totalDebt.sub(infoBefore._totalDebt)).equal(mintAmount);
      });

      it("preharvests the tokens held by the minter", async () => {
        // turn underlying to yield token
        const underlyingAmount06 = ethers.utils.parseUnits("500", 6);
        const underlyingAmount18 = ethers.utils.parseUnits("500", 18);
        await underlyingToken06.mint(alice.address, underlyingAmount06);
        await underlyingToken18.mint(alice.address, underlyingAmount18);
        await underlyingToken06.connect(alice).approve(yieldToken06.address, underlyingAmount06);
        await underlyingToken18.connect(alice).approve(yieldToken18.address, underlyingAmount18);
        await yieldToken06.connect(alice).deposit(underlyingAmount06);
        await yieldToken18.connect(alice).deposit(underlyingAmount18);
        const yieldAmount18 = await yieldToken18.balanceOf(alice.address);
        const mintAmount = ethers.utils.parseUnits("250", 18);

        // deposit strategy 1
        await yieldToken18.connect(alice).approve(clever.address, yieldAmount18);
        await clever.connect(alice).deposit(1, alice.address, yieldAmount18, 0, false);

        // add profit
        const profit06 = ethers.utils.parseUnits("50", 6);
        await underlyingToken06.mint(yieldToken06.address, profit06);
        const profit18 = ethers.utils.parseUnits("100", 18);
        await underlyingToken18.mint(yieldToken18.address, profit18);

        // update reward info correctly
        const strategyInfo06Before = await clever.yieldStrategies(0);
        const strategyInfo18Before = await clever.yieldStrategies(1);
        await clever.connect(alice).mint(alice.address, mintAmount, false);
        const strategyInfo06After = await clever.yieldStrategies(0);
        const strategyInfo18After = await clever.yieldStrategies(1);

        const price = await strategy18.underlyingPrice();
        expect(
          strategyInfo06After.harvestableYieldTokenAmount.sub(strategyInfo06Before.harvestableYieldTokenAmount)
        ).to.eq(0);
        expect(
          strategyInfo18After.harvestableYieldTokenAmount.sub(strategyInfo18Before.harvestableYieldTokenAmount)
        ).to.eq(profit18.mul(ethers.utils.parseEther("1")).div(price));
      });
    });
  });

  context("burn", async () => {
    const burnAmount = ethers.utils.parseUnits("125", 18);
    const feeAmount = burnAmount.mul(5e7).div(1e9);

    beforeEach(async () => {
      // turn underlying to yield token
      const underlyingAmount06 = ethers.utils.parseUnits("500", 6);
      await underlyingToken06.mint(alice.address, underlyingAmount06);
      await underlyingToken06.connect(alice).approve(yieldToken06.address, underlyingAmount06);
      await yieldToken06.connect(alice).deposit(underlyingAmount06);
      const yieldAmount06 = await yieldToken06.balanceOf(alice.address);
      const mintAmount = ethers.utils.parseUnits("250", 18);

      // deposit strategy 0
      await yieldToken06.connect(alice).approve(clever.address, yieldAmount06);
      await clever.connect(alice).deposit(0, alice.address, yieldAmount06, 0, false);

      await clever.connect(alice).mint(alice.address, mintAmount, false);
      await clevToken.connect(alice).approve(clever.address, burnAmount.add(feeAmount));
    });

    it("should revert, when burn zero", async () => {
      await expect(clever.burn(alice.address, 0)).to.revertedWith("CLever: burn zero amount");
    });

    it("should revert, when no debt to burn", async () => {
      await expect(clever.burn(deployer.address, 1)).to.revertedWith("CLever: no debt to burn");
    });

    it("should succeed", async () => {
      const balanceBefore = await clevToken.balanceOf(alice.address);
      const balancePlatformBefore = await clevToken.balanceOf(platform.address);
      const debtBefore = (await clever.getUserInfo(alice.address))._totalDebt;

      // burn, should emit event
      await expect(clever.connect(alice).burn(alice.address, burnAmount))
        .to.emit(clever, "Burn")
        .withArgs(alice.address, alice.address, burnAmount);

      const balanceAfter = await clevToken.balanceOf(alice.address);
      const balancePlatformAfter = await clevToken.balanceOf(platform.address);
      const debtAfter = (await clever.getUserInfo(alice.address))._totalDebt;

      // transfer from caller
      expect(balanceBefore.sub(balanceAfter)).to.eq(burnAmount.add(feeAmount));
      // fee transfer to platform
      expect(balancePlatformAfter.sub(balancePlatformBefore)).to.eq(feeAmount);
      // decrease debt
      expect(debtBefore.sub(debtAfter)).to.eq(burnAmount);
    });
  });

  context("repay", async () => {
    beforeEach(async () => {
      // turn underlying to yield token
      const underlyingAmount06 = ethers.utils.parseUnits("500", 6);
      await underlyingToken06.mint(alice.address, underlyingAmount06);
      await underlyingToken06.connect(alice).approve(yieldToken06.address, underlyingAmount06);
      await yieldToken06.connect(alice).deposit(underlyingAmount06);
      const yieldAmount06 = await yieldToken06.balanceOf(alice.address);
      const mintAmount = ethers.utils.parseUnits("250", 18);

      // deposit strategy 0
      await yieldToken06.connect(alice).approve(clever.address, yieldAmount06);
      await clever.connect(alice).deposit(0, alice.address, yieldAmount06, 0, false);

      // mint
      await clever.connect(alice).mint(alice.address, mintAmount, false);
    });

    it("should revert, when repay with invalid token", async () => {
      await expect(clever.repay(yieldToken06.address, alice.address, 1)).to.revertedWith(
        "CLever: invalid underlying token"
      );
    });

    const run = async (decimals: number) => {
      let underlyingToken: MockERC20;
      const repayAmount = ethers.utils.parseUnits("125", decimals);
      const feeAmount = repayAmount.mul(5e7).div(1e9);

      context(`repay with decimals[${decimals}]`, async () => {
        beforeEach(async () => {
          if (decimals === 6) underlyingToken = underlyingToken06;
          else underlyingToken = underlyingToken18;
        });

        it("should revert, when repay zero", async () => {
          await expect(clever.repay(underlyingToken.address, alice.address, 0)).to.revertedWith(
            "CLever: repay zero amount"
          );
        });

        it("should revert, when no debt to repay", async () => {
          await expect(clever.repay(underlyingToken.address, deployer.address, 1)).to.revertedWith(
            "CLever: no debt to repay"
          );
        });

        it("should succeed", async () => {
          await underlyingToken.mint(deployer.address, repayAmount.add(feeAmount));
          await underlyingToken.approve(clever.address, repayAmount.add(feeAmount));

          const balanceBefore = await underlyingToken.balanceOf(deployer.address);
          const balancePlatformBefore = await underlyingToken.balanceOf(platform.address);
          const balanceFurnaceBefore = await underlyingToken.balanceOf(furnace.address);
          const debtBefore = (await clever.getUserInfo(alice.address))._totalDebt;

          // burn, should emit event
          await expect(clever.repay(underlyingToken.address, alice.address, repayAmount))
            .to.emit(clever, "Repay")
            .withArgs(alice.address, underlyingToken.address, repayAmount);

          const balanceAfter = await underlyingToken.balanceOf(deployer.address);
          const balancePlatformAfter = await underlyingToken.balanceOf(platform.address);
          const balanceFurnaceAfter = await underlyingToken.balanceOf(furnace.address);
          const debtAfter = (await clever.getUserInfo(alice.address))._totalDebt;

          // transfer from caller
          expect(balanceBefore.sub(balanceAfter)).to.eq(repayAmount.add(feeAmount));
          // transfer to furnace
          expect(balanceFurnaceAfter.sub(balanceFurnaceBefore)).to.eq(repayAmount);
          // fee transfer to platform
          expect(balancePlatformAfter.sub(balancePlatformBefore)).to.eq(feeAmount);
          // decrease debt
          expect(debtBefore.sub(debtAfter)).to.eq(repayAmount.mul(BigNumber.from(10).pow(18 - decimals)));
        });
      });
    };

    run(6);
    run(18);
  });
});
