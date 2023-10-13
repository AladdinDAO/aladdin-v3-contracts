/* eslint-disable camelcase */
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { MaxUint256, ZeroAddress } from "ethers";
import { ethers, network } from "hardhat";

import { request_fork } from "@/test/utils";
import {
  ConverterRegistry,
  CvxFxnCompounder,
  CvxFxnStakingStrategy,
  GeneralTokenConverter,
  IConvexFXNDepositor,
} from "@/types/index";
import { CONVERTER_ROUTRS, TOKENS } from "@/utils/index";

const DEPLOYER = "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf";
const CvxFxnStaking = "0xEC60Cd4a5866fb3B0DD317A46d3B474a24e06beF";
const FxnDepositor = "0x56B3c8eF8A095f8637B6A84942aA898326B82b91";
const FxnHolder = "0x26B2ec4E02ebe2F54583af25b647b1D619e67BbF";
const StkCvxFxnHolder = "0xAAc0aa431c237C2C0B5f041c8e59B3f1a43aC78F";
const FORK_HEIGHT = 18343180;

describe("CvxFxnStakingStrategy.spec", async () => {
  let deployer: HardhatEthersSigner;
  let holder: HardhatEthersSigner;
  let holderStkCvxFxn: HardhatEthersSigner;

  let registry: ConverterRegistry;
  let converter: GeneralTokenConverter;

  let depositor: IConvexFXNDepositor;
  let strategy: CvxFxnStakingStrategy;
  let compounder: CvxFxnCompounder;

  beforeEach(async () => {
    request_fork(FORK_HEIGHT, [DEPLOYER, FxnHolder, StkCvxFxnHolder]);
    deployer = await ethers.getSigner(DEPLOYER);
    holder = await ethers.getSigner(FxnHolder);
    holderStkCvxFxn = await ethers.getSigner(StkCvxFxnHolder);

    await deployer.sendTransaction({ to: holder.address, value: ethers.parseEther("10") });
    await deployer.sendTransaction({ to: holderStkCvxFxn.address, value: ethers.parseEther("10") });

    depositor = await ethers.getContractAt("IConvexFXNDepositor", FxnDepositor, deployer);

    const ConverterRegistry = await ethers.getContractFactory("ConverterRegistry", deployer);
    registry = await ConverterRegistry.deploy();

    const GeneralTokenConverter = await ethers.getContractFactory("GeneralTokenConverter", deployer);
    converter = await GeneralTokenConverter.deploy(registry.getAddress());

    const CvxFxnCompounder = await ethers.getContractFactory("CvxFxnCompounder", deployer);
    compounder = await CvxFxnCompounder.deploy(0);

    const CvxFxnStakingStrategy = await ethers.getContractFactory("CvxFxnStakingStrategy", deployer);
    strategy = await CvxFxnStakingStrategy.deploy(compounder.getAddress());

    expect(await strategy.name()).to.eq("CvxFxnStaking");

    const fxn = await ethers.getContractAt("GovernanceToken", TOKENS.FXN.address, holder);
    await fxn.approve(depositor.getAddress(), ethers.parseEther("10000"));
    await depositor.connect(holder).deposit(ethers.parseEther("10000"), false);
    await registry.updateRoute(TOKENS.CVX.address, TOKENS.WETH.address, CONVERTER_ROUTRS.CVX.WETH);
    await registry.updateRoute(TOKENS.WETH.address, TOKENS.FXN.address, CONVERTER_ROUTRS.WETH.FXN);
    await converter.updateSupportedPoolTypes(1023);

    await compounder.initialize(
      "Aladdin cvxFXN",
      "aFXN",
      deployer.address,
      deployer.address,
      converter.getAddress(),
      strategy.getAddress()
    );
  });

  context("constructor", async () => {
    it("should initialize correctly", async () => {
      // from ConcentratorBaseV2
      expect(await compounder.treasury()).to.eq(deployer.address);
      expect(await compounder.harvester()).to.eq(deployer.address);
      expect(await compounder.converter()).to.eq(await converter.getAddress());
      expect(await compounder.getExpenseRatio()).to.eq(0n);
      expect(await compounder.getHarvesterRatio()).to.eq(0n);
      expect(await compounder.getWithdrawFeePercentage()).to.eq(0n);

      // from LinearRewardDistributor
      expect(await compounder.periodLength()).to.eq(0);
      expect(await compounder.rewardData()).to.deep.eq([0n, 0n, 0n, 0n]);
      expect(await compounder.rewardToken()).to.eq(TOKENS.cvxFXN.address);
      expect(await compounder.pendingRewards()).to.deep.eq([0n, 0n]);

      // from ERC20Upgradeable
      expect(await compounder.name()).to.eq("Aladdin cvxFXN");
      expect(await compounder.symbol()).to.eq("aFXN");
      expect(await compounder.decimals()).to.eq(18);
      expect(await compounder.totalSupply()).to.eq(0n);

      // from ConcentratorCompounderBase
      expect(await compounder.totalAssets()).to.eq(0n);
      expect(await compounder.strategy()).to.eq(await strategy.getAddress());
      expect(await compounder.asset()).to.eq(TOKENS.cvxFXN.address);
      expect(await compounder.maxDeposit(ZeroAddress)).to.eq(MaxUint256);
      expect(await compounder.maxMint(ZeroAddress)).to.eq(MaxUint256);
      expect(await compounder.maxRedeem(ZeroAddress)).to.eq(MaxUint256);
      expect(await compounder.maxWithdraw(ZeroAddress)).to.eq(MaxUint256);

      // reinitialize
      await expect(
        compounder.initialize("XX", "YY", ZeroAddress, ZeroAddress, ZeroAddress, ZeroAddress)
      ).to.revertedWith("Initializable: contract is already initialized");
    });
  });

  context("#depositWithFXN", async () => {
    beforeEach(async () => {
      const pool = await ethers.getContractAt("ICurvePlainPool", "0x1062fd8ed633c1f080754c19317cb3912810b5e5", holder);
      const cvxfxn = await ethers.getContractAt("MockERC20", TOKENS.cvxFXN.address, holder);
      const fxnBalance = await pool["balances(uint256)"](0);
      const cvxFxnBalance = await pool["balances(uint256)"](1);
      await cvxfxn.approve(pool.getAddress(), MaxUint256);
      if (cvxFxnBalance < fxnBalance) {
        await pool.exchange(1, 0, (fxnBalance - cvxFxnBalance) * 2n, 0);
      }
      expect(await pool.get_dy(0, 1, ethers.parseEther("1"))).to.gt(ethers.parseEther("1"));
      expect(await pool.get_dy(0, 1, ethers.parseEther("1000"))).to.lt(ethers.parseEther("1000"));
    });

    it("should revert, when insufficient shares", async () => {
      const token = await ethers.getContractAt("MockERC20", TOKENS.FXN.address, holder);
      const staker = await ethers.getContractAt("MockERC20", CvxFxnStaking, holder);
      const amount = ethers.parseEther("1"); // will use curve

      await token.approve(compounder.getAddress(), amount);
      expect(await staker.balanceOf(strategy.getAddress())).to.eq(0n);
      const shares = await compounder.connect(holder).depositWithFXN.staticCall(amount, holder.address, 0);
      await expect(
        compounder.connect(holder).depositWithFXN(amount, holder.address, shares + 1n)
      ).to.revertedWithCustomError(compounder, "InsufficientShares");
    });

    it("should succeed when deposit some to self", async () => {
      const token = await ethers.getContractAt("MockERC20", TOKENS.FXN.address, holder);
      const staker = await ethers.getContractAt("MockERC20", CvxFxnStaking, holder);
      const amount = ethers.parseEther("1"); // will use curve

      await token.approve(compounder.getAddress(), amount);
      expect(await staker.balanceOf(strategy.getAddress())).to.eq(0n);
      const shares = await compounder.connect(holder).depositWithFXN.staticCall(amount, holder.address, 0);
      await expect(compounder.connect(holder).depositWithFXN(amount, holder.address, shares)).to.emit(
        compounder,
        "Deposit"
      );
      expect(await staker.balanceOf(strategy.getAddress())).to.gt(amount);
      expect(await compounder.balanceOf(holder.address)).to.gt(amount);
    });

    it("should succeed when deposit some to other", async () => {
      const token = await ethers.getContractAt("MockERC20", TOKENS.FXN.address, holder);
      const staker = await ethers.getContractAt("MockERC20", CvxFxnStaking, holder);
      const amount = ethers.parseEther("1"); // will use curve

      await token.approve(compounder.getAddress(), amount);
      expect(await staker.balanceOf(strategy.getAddress())).to.eq(0n);
      const shares = await compounder.connect(holder).depositWithFXN.staticCall(amount, holder.address, 0);
      await expect(compounder.connect(holder).depositWithFXN(amount, deployer.address, shares)).to.emit(
        compounder,
        "Deposit"
      );
      expect(await staker.balanceOf(strategy.getAddress())).to.gt(amount);
      expect(await compounder.balanceOf(deployer.address)).to.gt(amount);
    });

    it("should succeed when deposit all to self", async () => {
      const token = await ethers.getContractAt("MockERC20", TOKENS.FXN.address, holder);
      const staker = await ethers.getContractAt("MockERC20", CvxFxnStaking, holder);
      const amount = await token.balanceOf(holder.getAddress()); // use convex

      await token.approve(compounder.getAddress(), amount);
      expect(await staker.balanceOf(strategy.getAddress())).to.eq(0n);
      await expect(compounder.connect(holder).depositWithFXN(MaxUint256, holder.address, 0)).to.emit(
        compounder,
        "Deposit"
      );
      expect(await staker.balanceOf(strategy.getAddress())).to.eq(amount);
      expect(await compounder.balanceOf(holder.address)).to.eq(amount);
    });

    it("should succeed when deposit all to other", async () => {
      const token = await ethers.getContractAt("MockERC20", TOKENS.FXN.address, holder);
      const staker = await ethers.getContractAt("MockERC20", CvxFxnStaking, holder);
      const amount = await token.balanceOf(holder.getAddress()); // use convex

      await token.approve(compounder.getAddress(), amount);
      expect(await staker.balanceOf(strategy.getAddress())).to.eq(0n);
      await expect(compounder.connect(holder).depositWithFXN(MaxUint256, deployer.address, 0)).to.emit(
        compounder,
        "Deposit"
      );
      expect(await staker.balanceOf(strategy.getAddress())).to.eq(amount);
      expect(await compounder.balanceOf(deployer.address)).to.eq(amount);
    });
  });

  context("#depositWithStkCvxFxn", async () => {
    it("should succeed when deposit some to self", async () => {
      const token = await ethers.getContractAt("MockERC20", CvxFxnStaking, holderStkCvxFxn);
      const staker = await ethers.getContractAt("MockERC20", CvxFxnStaking, holder);
      const amount = ethers.parseEther("1");

      await token.approve(compounder.getAddress(), amount);
      expect(await staker.balanceOf(strategy.getAddress())).to.eq(0n);
      const shares = await compounder
        .connect(holderStkCvxFxn)
        .depositWithStkCvxFxn.staticCall(amount, holderStkCvxFxn.address);
      expect(shares).to.eq(amount);
      await expect(compounder.connect(holderStkCvxFxn).depositWithStkCvxFxn(amount, holderStkCvxFxn.address)).to.emit(
        compounder,
        "Deposit"
      );
      expect(await staker.balanceOf(strategy.getAddress())).to.eq(amount);
      expect(await compounder.balanceOf(holderStkCvxFxn.address)).to.eq(amount);
    });

    it("should succeed when deposit some to other", async () => {
      const token = await ethers.getContractAt("MockERC20", CvxFxnStaking, holderStkCvxFxn);
      const staker = await ethers.getContractAt("MockERC20", CvxFxnStaking, holder);
      const amount = ethers.parseEther("1");

      await token.approve(compounder.getAddress(), amount);
      expect(await staker.balanceOf(strategy.getAddress())).to.eq(0n);
      const shares = await compounder
        .connect(holderStkCvxFxn)
        .depositWithStkCvxFxn.staticCall(amount, holderStkCvxFxn.address);
      expect(shares).to.eq(amount);
      await expect(compounder.connect(holderStkCvxFxn).depositWithStkCvxFxn(amount, deployer.address)).to.emit(
        compounder,
        "Deposit"
      );
      expect(await staker.balanceOf(strategy.getAddress())).to.eq(amount);
      expect(await compounder.balanceOf(deployer.address)).to.eq(amount);
    });

    it("should succeed when deposit all to self", async () => {
      const token = await ethers.getContractAt("MockERC20", CvxFxnStaking, holderStkCvxFxn);
      const staker = await ethers.getContractAt("MockERC20", CvxFxnStaking, holder);
      const amount = await token.balanceOf(holderStkCvxFxn.getAddress());

      await token.approve(compounder.getAddress(), amount);
      expect(await staker.balanceOf(strategy.getAddress())).to.eq(0n);
      await expect(
        compounder.connect(holderStkCvxFxn).depositWithStkCvxFxn(MaxUint256, holderStkCvxFxn.address)
      ).to.emit(compounder, "Deposit");
      expect(await staker.balanceOf(strategy.getAddress())).to.eq(amount);
      expect(await compounder.balanceOf(holderStkCvxFxn.address)).to.eq(amount);
    });

    it("should succeed when deposit all to other", async () => {
      const token = await ethers.getContractAt("MockERC20", CvxFxnStaking, holderStkCvxFxn);
      const staker = await ethers.getContractAt("MockERC20", CvxFxnStaking, holder);
      const amount = await token.balanceOf(holderStkCvxFxn.getAddress());

      await token.approve(compounder.getAddress(), amount);
      expect(await staker.balanceOf(strategy.getAddress())).to.eq(0n);
      await expect(compounder.connect(holderStkCvxFxn).depositWithStkCvxFxn(MaxUint256, deployer.address)).to.emit(
        compounder,
        "Deposit"
      );
      expect(await staker.balanceOf(strategy.getAddress())).to.eq(amount);
      expect(await compounder.balanceOf(deployer.address)).to.eq(amount);
    });
  });

  context("#harvest", async () => {
    it("should succeed", async () => {
      const token = await ethers.getContractAt("MockERC20", TOKENS.cvxFXN.address, holder);
      const staker = await ethers.getContractAt("MockERC20", CvxFxnStaking, holder);
      const amount = ethers.parseEther("1000");
      await token.approve(compounder.getAddress(), amount);
      expect(await staker.balanceOf(strategy.getAddress())).to.eq(0n);
      await compounder.connect(holder).deposit(amount, deployer.address);
      expect(await staker.balanceOf(strategy.getAddress())).to.eq(amount);

      const timestamp = (await ethers.provider.getBlock("latest"))!.timestamp;
      // make sure 7 days passed, then the rewards will not increase anymore.
      await network.provider.send("evm_setNextBlockTimestamp", [timestamp + 86400 * 7]);
      await network.provider.send("evm_mine");

      const harvested = await compounder.connect(deployer).harvest.staticCall(deployer.address, 0n);
      expect(harvested).to.gt(0n);
      const before = await staker.balanceOf(strategy.getAddress());
      await compounder.connect(deployer).harvest(deployer.address, 0n);
      const after = await staker.balanceOf(strategy.getAddress());
      expect(after - before).to.eq(harvested);
      console.log("harvested:", ethers.formatUnits(harvested, 18));
    });
  });
});
