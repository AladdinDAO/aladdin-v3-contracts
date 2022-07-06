/* eslint-disable camelcase */
/* eslint-disable node/no-missing-import */
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { CLeverCVXLocker, IERC20, Furnace, CLeverToken } from "../../typechain";
import { request_fork } from "../utils";
import { ethers } from "hardhat";
import * as hre from "hardhat";
import { expect } from "chai";
import { BigNumber, constants } from "ethers";
import { ADDRESS, ZAP_ROUTES } from "../../scripts/utils";

const FORK_BLOCK_NUMBER = 14386700;
const DEPLOYER = "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf";
const CVX = "0x4e3FBD56CD56c3e72c1403e103b45Db9da5B9D2B";
const CVX_HOLDER = "0x28C6c06298d514Db089934071355E5743bf21d60";
const PLATFORM = "0xc40549aa1D05C30af23a1C4a5af6bA11FCAFe23F";
const PLATFORM_FEE_PERCENTAGE = 2.5e7; // 2.5%
const HARVEST_BOUNTY_PERCENTAGE = 2.5e7; // 2.5%
const CVXCRV = "0x62B9c7356A2Dc64a1969e19C23e4f579F9810Aa7";
const WETH = ADDRESS.WETH;

describe("CLeverCVXLocker.spec", async () => {
  let deployer: SignerWithAddress;
  let signer: SignerWithAddress;
  let clevCVX: CLeverToken;
  let cvx: IERC20;
  let furnace: Furnace;
  let locker: CLeverCVXLocker;

  beforeEach(async () => {
    request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, CVX_HOLDER]);
    deployer = await ethers.getSigner(DEPLOYER);
    signer = await ethers.getSigner(CVX_HOLDER);

    await deployer.sendTransaction({ to: signer.address, value: ethers.utils.parseEther("10") });

    const CLeverToken = await ethers.getContractFactory("CLeverToken", deployer);
    clevCVX = (await CLeverToken.deploy("CLever CVX", "clevCVX")) as CLeverToken;
    await clevCVX.deployed();

    cvx = await ethers.getContractAt("IERC20", CVX, signer);

    await clevCVX.updateMinters([deployer.address], true);
    await clevCVX.updateCeiling(deployer.address, ethers.utils.parseEther("10000000"));

    const AladdinZap = await ethers.getContractFactory("AladdinZap", deployer);
    const zap = await AladdinZap.deploy();
    await zap.deployed();
    await zap.initialize();

    // 1. cvxcrv ==> crv with CurveFactoryPlainPool
    // 2. crv ==> eth with CurveCryptoPool
    await zap.updateRoute(CVXCRV, WETH, ZAP_ROUTES.cvxCRV.WETH);
    // 2. eth ==> cvx with UniswapV2
    await zap.updateRoute(WETH, CVX, ZAP_ROUTES.WETH.CVX);

    const Furnace = await ethers.getContractFactory("Furnace", deployer);
    furnace = await Furnace.deploy();
    await furnace.deployed();
    await furnace.initialize(
      deployer.address,
      clevCVX.address,
      zap.address,
      PLATFORM,
      PLATFORM_FEE_PERCENTAGE,
      HARVEST_BOUNTY_PERCENTAGE
    );

    const CLeverCVXLocker = await ethers.getContractFactory("CLeverCVXLocker", deployer);
    locker = await CLeverCVXLocker.deploy();
    await locker.deployed();
    await locker.initialize(
      deployer.address,
      clevCVX.address,
      zap.address,
      furnace.address,
      PLATFORM,
      PLATFORM_FEE_PERCENTAGE,
      HARVEST_BOUNTY_PERCENTAGE
    );

    await clevCVX.updateMinters([locker.address], true);
    await clevCVX.updateCeiling(locker.address, ethers.utils.parseEther("10000000"));
    await furnace.updateWhitelists([locker.address], true);
    await locker.updateStakePercentage(500000000);
  });

  context("initialize", async () => {
    it("should revert, when initialize again", async () => {
      await expect(
        locker.initialize(
          constants.AddressZero,
          constants.AddressZero,
          constants.AddressZero,
          constants.AddressZero,
          constants.AddressZero,
          0,
          0
        )
      ).to.revertedWith("Initializable: contract is already initialized");
    });

    it("should initialize correctly", async () => {
      expect(await locker.clevCVX()).to.eq(clevCVX.address);
      expect(await locker.furnace()).to.eq(furnace.address);
      expect(await locker.governor()).to.eq(deployer.address);
      expect(await locker.totalLockedGlobal()).to.eq(constants.Zero);
      expect(await locker.totalUnlockedGlobal()).to.eq(constants.Zero);
      expect(await locker.totalDebtGlobal()).to.eq(constants.Zero);
      expect(await locker.totalLockedGlobal()).to.eq(constants.Zero);
      expect(await locker.stakePercentage()).to.eq(BigNumber.from(500000000));
      expect(await locker.reserveRate()).to.eq(BigNumber.from(500000000));
      expect(await locker.stakeThreshold()).to.eq(constants.Zero);
      expect(await locker.harvestBountyPercentage()).to.eq(HARVEST_BOUNTY_PERCENTAGE);
      expect(await locker.platformFeePercentage()).to.eq(PLATFORM_FEE_PERCENTAGE);
      expect(await locker.platform()).to.eq(PLATFORM);
    });
  });

  context("lock", async () => {
    const depositAmount = ethers.utils.parseEther("100");
    let alice: SignerWithAddress;

    beforeEach(async () => {
      [alice] = await ethers.getSigners();
      await cvx.transfer(alice.address, ethers.utils.parseEther("10000"));
    });

    it("should revert, when lock zero CVX", async () => {
      await expect(locker.connect(alice).deposit(0)).to.revertedWith("CLeverCVXLocker: deposit zero CVX");
    });

    it("should succeed, when lock CVX", async () => {
      await cvx.connect(alice).approve(locker.address, depositAmount);
      await locker.connect(alice).deposit(depositAmount);
      expect(await locker.totalCVXInPool()).to.eq(constants.Zero);
      expect(await locker.totalDebtGlobal()).to.eq(constants.Zero);
      expect(await locker.totalLockedGlobal()).to.eq(depositAmount);
      expect(await locker.totalUnlockedGlobal()).to.eq(constants.Zero);

      const [totalDeposited, totalPendingUnlocked, totalUnlocked, totalBorrowed, totalReward] =
        await locker.getUserInfo(alice.address);
      expect(totalDeposited).to.eq(depositAmount);
      expect(totalPendingUnlocked).to.eq(constants.Zero);
      expect(totalUnlocked).to.eq(constants.Zero);
      expect(totalBorrowed).to.eq(constants.Zero);
      expect(totalReward).to.eq(constants.Zero);
    });

    it("should succeed, when harvest", async () => {
      await cvx.connect(alice).approve(locker.address, depositAmount);
      await locker.connect(alice).deposit(depositAmount);
      expect(await locker.totalCVXInPool()).to.eq(constants.Zero);
      expect(await locker.totalDebtGlobal()).to.eq(constants.Zero);
      expect(await locker.totalLockedGlobal()).to.eq(depositAmount);
      expect(await locker.totalUnlockedGlobal()).to.eq(constants.Zero);

      let [totalDeposited, totalPendingUnlocked, totalUnlocked, totalBorrowed, totalReward] = await locker.getUserInfo(
        alice.address
      );
      expect(totalDeposited).to.eq(depositAmount);
      expect(totalPendingUnlocked).to.eq(constants.Zero);
      expect(totalUnlocked).to.eq(constants.Zero);
      expect(totalBorrowed).to.eq(constants.Zero);
      expect(totalReward).to.eq(constants.Zero);

      await locker.harvest(deployer.address, 0);
      [totalDeposited, totalPendingUnlocked, totalUnlocked, totalBorrowed, totalReward] = await locker.getUserInfo(
        alice.address
      );
      expect(totalDeposited).to.eq(depositAmount);
      expect(totalPendingUnlocked).to.eq(constants.Zero);
      expect(totalUnlocked).to.eq(constants.Zero);
      expect(totalBorrowed).to.eq(constants.Zero);
      expect(totalReward).to.gt(constants.Zero);

      expect(await furnace.totalCVXInPool()).to.gt(constants.Zero);
    });
  });

  context("borrow", async () => {
    const depositAmount = ethers.utils.parseEther("100");
    const borrowAmount = depositAmount.div(2);
    const rewardAmount = ethers.utils.parseEther("10");
    let alice: SignerWithAddress;

    beforeEach(async () => {
      [alice] = await ethers.getSigners();
      await cvx.transfer(alice.address, ethers.utils.parseEther("10000"));
      await cvx.connect(alice).approve(locker.address, depositAmount);
      await locker.connect(alice).deposit(depositAmount);
    });

    it("should revert, when borrow zero amount", async () => {
      await expect(locker.connect(alice).borrow(0, false)).to.revertedWith("CLeverCVXLocker: borrow zero amount");
    });

    it("should revert, when borrow more than limit", async () => {
      await expect(locker.connect(alice).borrow(borrowAmount.add(1), false)).to.revertedWith(
        "CLeverCVXLocker: unlock or borrow exceeds limit"
      );
    });

    it("should revert, when unlock more than limit", async () => {
      await locker.connect(alice).borrow(borrowAmount, false);

      expect(await locker.totalCVXInPool()).to.eq(constants.Zero);
      expect(await locker.totalDebtGlobal()).to.eq(borrowAmount);
      expect(await locker.totalLockedGlobal()).to.eq(depositAmount);
      expect(await locker.totalUnlockedGlobal()).to.eq(constants.Zero);

      const [totalDeposited, totalPendingUnlocked, totalUnlocked, totalBorrowed, totalReward] =
        await locker.getUserInfo(alice.address);
      expect(totalDeposited).to.eq(depositAmount);
      expect(totalPendingUnlocked).to.eq(constants.Zero);
      expect(totalUnlocked).to.eq(constants.Zero);
      expect(totalBorrowed).to.eq(borrowAmount);
      expect(totalReward).to.eq(constants.Zero);

      expect(await clevCVX.balanceOf(alice.address)).to.eq(borrowAmount);

      await expect(locker.connect(alice).unlock(1)).to.revertedWith("CLeverCVXLocker: unlock or borrow exceeds limit");
    });

    it("should succeed, when borrow half", async () => {
      await locker.connect(alice).borrow(borrowAmount, false);

      expect(await locker.totalCVXInPool()).to.eq(constants.Zero);
      expect(await locker.totalDebtGlobal()).to.eq(borrowAmount);
      expect(await locker.totalLockedGlobal()).to.eq(depositAmount);
      expect(await locker.totalUnlockedGlobal()).to.eq(constants.Zero);

      const [totalDeposited, totalPendingUnlocked, totalUnlocked, totalBorrowed, totalReward] =
        await locker.getUserInfo(alice.address);
      expect(totalDeposited).to.eq(depositAmount);
      expect(totalPendingUnlocked).to.eq(constants.Zero);
      expect(totalUnlocked).to.eq(constants.Zero);
      expect(totalBorrowed).to.eq(borrowAmount);
      expect(totalReward).to.eq(constants.Zero);

      expect(await clevCVX.balanceOf(alice.address)).to.eq(borrowAmount);
    });

    it("should succeed, when borrow half and deposit to furnace", async () => {
      await locker.connect(alice).borrow(borrowAmount, true);

      expect(await locker.totalCVXInPool()).to.eq(constants.Zero);
      expect(await locker.totalDebtGlobal()).to.eq(borrowAmount);
      expect(await locker.totalLockedGlobal()).to.eq(depositAmount);
      expect(await locker.totalUnlockedGlobal()).to.eq(constants.Zero);

      const [totalDeposited, totalPendingUnlocked, totalUnlocked, totalBorrowed, totalReward] =
        await locker.getUserInfo(alice.address);
      expect(totalDeposited).to.eq(depositAmount);
      expect(totalPendingUnlocked).to.eq(constants.Zero);
      expect(totalUnlocked).to.eq(constants.Zero);
      expect(totalBorrowed).to.eq(borrowAmount);
      expect(totalReward).to.eq(constants.Zero);

      expect((await furnace.getUserInfo(alice.address)).unrealised).to.eq(borrowAmount);
      expect(await clevCVX.balanceOf(alice.address)).to.eq(constants.Zero);
    });

    it("should succeed, when borrow with donated reward", async () => {
      await cvx.approve(locker.address, rewardAmount);
      await locker.connect(signer).donate(rewardAmount);

      expect(await furnace.totalCVXInPool()).to.eq(rewardAmount);

      let [totalDeposited, totalPendingUnlocked, totalUnlocked, totalBorrowed, totalReward] = await locker.getUserInfo(
        alice.address
      );
      expect(totalDeposited).to.eq(depositAmount);
      expect(totalPendingUnlocked).to.eq(constants.Zero);
      expect(totalUnlocked).to.eq(constants.Zero);
      expect(totalBorrowed).to.eq(constants.Zero);
      expect(totalReward).to.eq(rewardAmount);

      await locker.connect(alice).borrow(borrowAmount, false);

      expect(await locker.totalCVXInPool()).to.eq(constants.Zero);
      expect(await locker.totalDebtGlobal()).to.eq(borrowAmount.sub(rewardAmount));
      expect(await locker.totalLockedGlobal()).to.eq(depositAmount);
      expect(await locker.totalUnlockedGlobal()).to.eq(constants.Zero);

      [totalDeposited, totalPendingUnlocked, totalUnlocked, totalBorrowed, totalReward] = await locker.getUserInfo(
        alice.address
      );
      expect(totalDeposited).to.eq(depositAmount);
      expect(totalPendingUnlocked).to.eq(constants.Zero);
      expect(totalUnlocked).to.eq(constants.Zero);
      expect(totalBorrowed).to.eq(borrowAmount.sub(rewardAmount));
      expect(totalReward).to.eq(constants.Zero);

      expect(await clevCVX.balanceOf(alice.address)).to.eq(borrowAmount);
    });
  });

  context("repay", async () => {
    const depositAmount = ethers.utils.parseEther("100");
    const borrowAmount = depositAmount.div(2);
    const repayAmount = ethers.utils.parseEther("10");
    let alice: SignerWithAddress;

    beforeEach(async () => {
      [alice] = await ethers.getSigners();
      await cvx.transfer(alice.address, ethers.utils.parseEther("10000"));
      await cvx.connect(alice).approve(locker.address, depositAmount);
      await locker.connect(alice).deposit(depositAmount);

      await locker.connect(alice).borrow(borrowAmount, false);
    });

    it("should revert, when borrow more", async () => {
      await expect(locker.connect(alice).borrow(1, false)).to.revertedWith(
        "CLeverCVXLocker: unlock or borrow exceeds limit"
      );
    });

    it("should revert, when pay zero", async () => {
      await expect(locker.connect(alice).repay(0, 0)).to.revertedWith("CLeverCVXLocker: repay zero amount");
    });

    it("should succeed, when repay with CVX", async () => {
      const cvxBefore = await cvx.balanceOf(alice.address);
      await cvx.connect(alice).approve(locker.address, repayAmount);
      await locker.connect(alice).repay(repayAmount, 0);
      const cvxAfter = await cvx.balanceOf(alice.address);
      expect(cvxBefore.sub(cvxAfter)).to.eq(repayAmount);

      expect(await furnace.totalCVXInPool()).to.eq(repayAmount);

      expect(await locker.totalCVXInPool()).to.eq(constants.Zero);
      expect(await locker.totalDebtGlobal()).to.eq(borrowAmount.sub(repayAmount));
      expect(await locker.totalLockedGlobal()).to.eq(depositAmount);
      expect(await locker.totalUnlockedGlobal()).to.eq(constants.Zero);

      const [totalDeposited, totalPendingUnlocked, totalUnlocked, totalBorrowed, totalReward] =
        await locker.getUserInfo(alice.address);
      expect(totalDeposited).to.eq(depositAmount);
      expect(totalPendingUnlocked).to.eq(constants.Zero);
      expect(totalUnlocked).to.eq(constants.Zero);
      expect(totalBorrowed).to.eq(borrowAmount.sub(repayAmount));
      expect(totalReward).to.eq(constants.Zero);
    });

    it("should succeed, when repay with CVX with fee", async () => {
      await locker.updateRepayFeePercentage(10000000); // 1%
      const cvxBefore = await cvx.balanceOf(alice.address);
      await cvx.connect(alice).approve(locker.address, repayAmount.add(repayAmount.div(100)));
      await locker.connect(alice).repay(repayAmount, 0);
      const cvxAfter = await cvx.balanceOf(alice.address);
      expect(cvxBefore.sub(cvxAfter)).to.eq(repayAmount.add(repayAmount.div(100)));

      expect(await furnace.totalCVXInPool()).to.eq(repayAmount);

      expect(await locker.totalCVXInPool()).to.eq(constants.Zero);
      expect(await locker.totalDebtGlobal()).to.eq(borrowAmount.sub(repayAmount));
      expect(await locker.totalLockedGlobal()).to.eq(depositAmount);
      expect(await locker.totalUnlockedGlobal()).to.eq(constants.Zero);

      const [totalDeposited, totalPendingUnlocked, totalUnlocked, totalBorrowed, totalReward] =
        await locker.getUserInfo(alice.address);
      expect(totalDeposited).to.eq(depositAmount);
      expect(totalPendingUnlocked).to.eq(constants.Zero);
      expect(totalUnlocked).to.eq(constants.Zero);
      expect(totalBorrowed).to.eq(borrowAmount.sub(repayAmount));
      expect(totalReward).to.eq(constants.Zero);
    });

    it("should succeed, when repay with clevCVX", async () => {
      const clevCVXBefore = await clevCVX.balanceOf(alice.address);
      await clevCVX.connect(alice).approve(locker.address, repayAmount);
      await locker.connect(alice).repay(0, repayAmount);
      const clevCVXAfter = await clevCVX.balanceOf(alice.address);
      expect(clevCVXBefore.sub(clevCVXAfter)).to.eq(repayAmount);

      expect(await furnace.totalCVXInPool()).to.eq(constants.Zero);

      expect(await locker.totalCVXInPool()).to.eq(constants.Zero);
      expect(await locker.totalDebtGlobal()).to.eq(borrowAmount.sub(repayAmount));
      expect(await locker.totalLockedGlobal()).to.eq(depositAmount);
      expect(await locker.totalUnlockedGlobal()).to.eq(constants.Zero);

      const [totalDeposited, totalPendingUnlocked, totalUnlocked, totalBorrowed, totalReward] =
        await locker.getUserInfo(alice.address);
      expect(totalDeposited).to.eq(depositAmount);
      expect(totalPendingUnlocked).to.eq(constants.Zero);
      expect(totalUnlocked).to.eq(constants.Zero);
      expect(totalBorrowed).to.eq(borrowAmount.sub(repayAmount));
      expect(totalReward).to.eq(constants.Zero);
    });

    it("should succeed, when repay with clevCVX with fee", async () => {
      await locker.updateRepayFeePercentage(10000000); // 1%
      const clevCVXBefore = await clevCVX.balanceOf(alice.address);
      await clevCVX.connect(alice).approve(locker.address, repayAmount.add(repayAmount.div(100)));
      await locker.connect(alice).repay(0, repayAmount);
      const clevCVXAfter = await clevCVX.balanceOf(alice.address);
      expect(clevCVXBefore.sub(clevCVXAfter)).to.eq(repayAmount.add(repayAmount.div(100)));

      expect(await furnace.totalCVXInPool()).to.eq(constants.Zero);

      expect(await locker.totalCVXInPool()).to.eq(constants.Zero);
      expect(await locker.totalDebtGlobal()).to.eq(borrowAmount.sub(repayAmount));
      expect(await locker.totalLockedGlobal()).to.eq(depositAmount);
      expect(await locker.totalUnlockedGlobal()).to.eq(constants.Zero);

      const [totalDeposited, totalPendingUnlocked, totalUnlocked, totalBorrowed, totalReward] =
        await locker.getUserInfo(alice.address);
      expect(totalDeposited).to.eq(depositAmount);
      expect(totalPendingUnlocked).to.eq(constants.Zero);
      expect(totalUnlocked).to.eq(constants.Zero);
      expect(totalBorrowed).to.eq(borrowAmount.sub(repayAmount));
      expect(totalReward).to.eq(constants.Zero);
    });

    it("should succeed, when auto repay not exceed debt", async () => {
      await cvx.approve(locker.address, repayAmount);
      await locker.connect(signer).donate(repayAmount);

      expect(await furnace.totalCVXInPool()).to.eq(repayAmount);

      expect(await locker.totalCVXInPool()).to.eq(constants.Zero);
      // not change until user interacted with contract
      expect(await locker.totalDebtGlobal()).to.eq(borrowAmount);
      expect(await locker.totalLockedGlobal()).to.eq(depositAmount);
      expect(await locker.totalUnlockedGlobal()).to.eq(constants.Zero);

      const [totalDeposited, totalPendingUnlocked, totalUnlocked, totalBorrowed, totalReward] =
        await locker.getUserInfo(alice.address);
      expect(totalDeposited).to.eq(depositAmount);
      expect(totalPendingUnlocked).to.eq(constants.Zero);
      expect(totalUnlocked).to.eq(constants.Zero);
      expect(totalBorrowed).to.eq(borrowAmount.sub(repayAmount));
      expect(totalReward).to.eq(constants.Zero);

      await locker.connect(alice).borrow(10, false);
      expect(await clevCVX.balanceOf(alice.address)).to.eq(borrowAmount.add(10));

      expect(await locker.totalCVXInPool()).to.eq(constants.Zero);
      expect(await locker.totalDebtGlobal()).to.eq(borrowAmount.sub(repayAmount).add(10));
      expect(await locker.totalLockedGlobal()).to.eq(depositAmount);
      expect(await locker.totalUnlockedGlobal()).to.eq(constants.Zero);
    });

    it("should succeed, when auto repay exceed debt", async () => {
      await cvx.approve(locker.address, repayAmount.add(borrowAmount));
      await locker.connect(signer).donate(repayAmount.add(borrowAmount));

      expect(await furnace.totalCVXInPool()).to.eq(repayAmount.add(borrowAmount));

      expect(await locker.totalCVXInPool()).to.eq(constants.Zero);
      // not change until user interacted with contract
      expect(await locker.totalDebtGlobal()).to.eq(borrowAmount);
      expect(await locker.totalLockedGlobal()).to.eq(depositAmount);
      expect(await locker.totalUnlockedGlobal()).to.eq(constants.Zero);

      let [totalDeposited, totalPendingUnlocked, totalUnlocked, totalBorrowed, totalReward] = await locker.getUserInfo(
        alice.address
      );
      expect(totalDeposited).to.eq(depositAmount);
      expect(totalPendingUnlocked).to.eq(constants.Zero);
      expect(totalUnlocked).to.eq(constants.Zero);
      expect(totalBorrowed).to.eq(constants.Zero);
      expect(totalReward).to.eq(repayAmount);

      await locker.connect(alice).borrow(repayAmount.add(10), false);
      expect(await clevCVX.balanceOf(alice.address)).to.eq(borrowAmount.add(repayAmount).add(10));

      expect(await locker.totalCVXInPool()).to.eq(constants.Zero);
      expect(await locker.totalDebtGlobal()).to.eq(10);
      expect(await locker.totalLockedGlobal()).to.eq(depositAmount);
      expect(await locker.totalUnlockedGlobal()).to.eq(constants.Zero);

      [totalDeposited, totalPendingUnlocked, totalUnlocked, totalBorrowed, totalReward] = await locker.getUserInfo(
        alice.address
      );
      expect(totalDeposited).to.eq(depositAmount);
      expect(totalPendingUnlocked).to.eq(constants.Zero);
      expect(totalUnlocked).to.eq(constants.Zero);
      expect(totalBorrowed).to.eq(10);
      expect(totalReward).to.eq(constants.Zero);
    });
  });

  context("lock/unlock/withdraw", async () => {
    // timestamp in forked block is 1647258396, in epoch 2723
    // epoch 2723: [1646870400, 1647475200)
    // epoch 2724: [1647475200, 1648080000)
    // epoch 2725: [1648080000, 1648684800)
    // epoch 2726: [1648684800, 1649289600)
    // epoch 2727: [1649289600, 1649894400)
    // epoch 2728: [1649894400, 1650499200)
    // epoch 2729: [1650499200, 1651104000)
    // epoch 2730: [1651104000, 1651708800)
    // epoch 2731: [1651708800, 1652313600)
    // epoch 2732: [1652313600, 1652918400)
    // epoch 2733: [1652918400, 1653523200)
    // epoch 2734: [1653523200, 1654128000)
    // epoch 2735: [1654128000, 1654732800)
    // epoch 2736: [1654732800, 1655337600)
    // epoch 2737: [1655337600, 1655942400)
    // epoch 2738: [1655942400, 1656547200)
    // epoch 2739: [1656547200, 1657152000)
    // epoch 2740: [1657152000, 1657756800)
    // epoch 2741: [1657756800, 1658361600)
    // epoch 2742: [1658361600, 1658966400)
    // epoch 2743: [1658966400, 1659571200)
    let alice: SignerWithAddress;
    const lockAmount = ethers.utils.parseEther("10");

    beforeEach(async () => {
      [alice] = await ethers.getSigners();
      await cvx.transfer(alice.address, ethers.utils.parseEther("10000"));
      await cvx.connect(alice).approve(locker.address, constants.MaxUint256);
      await locker.updateKeepers([deployer.address], true);
    });

    it("should succeed, when deposit 1 time, unlock after 17 weeks", async () => {
      // lock 10 CVX in epoch 2723
      await hre.network.provider.send("evm_setNextBlockTimestamp", [1647470200]);
      await locker.connect(alice).deposit(lockAmount);

      let [locks, pendings] = await locker.getUserLocks(alice.address);
      expect(locks.length).to.eq(1);
      expect(locks[0].pendingUnlock).to.eq(lockAmount);
      expect(locks[0].unlockEpoch).to.eq(2723 + 17);
      expect(pendings.length).to.eq(0);

      let [totalDeposited, totalPendingUnlocked, totalUnlocked, totalBorrowed, totalReward] = await locker.getUserInfo(
        alice.address
      );
      expect(totalDeposited).to.eq(lockAmount);
      expect(totalPendingUnlocked).to.eq(constants.Zero);
      expect(totalUnlocked).to.eq(constants.Zero);
      expect(totalBorrowed).to.eq(constants.Zero);
      expect(totalReward).to.eq(constants.Zero);

      await locker.connect(alice).unlock(lockAmount);
      [locks, pendings] = await locker.getUserLocks(alice.address);
      expect(locks.length).to.eq(0);
      expect(pendings.length).to.eq(1);
      expect(pendings[0].pendingUnlock).to.eq(lockAmount);
      expect(pendings[0].unlockEpoch).to.eq(2723 + 17);
      expect(await locker.pendingUnlocked(2723 + 17)).to.eq(lockAmount);

      [totalDeposited, totalPendingUnlocked, totalUnlocked, totalBorrowed, totalReward] = await locker.getUserInfo(
        alice.address
      );
      expect(totalDeposited).to.eq(constants.Zero);
      expect(totalPendingUnlocked).to.eq(lockAmount);
      expect(totalUnlocked).to.eq(constants.Zero);
      expect(totalBorrowed).to.eq(constants.Zero);
      expect(totalReward).to.eq(constants.Zero);

      await hre.network.provider.send("evm_setNextBlockTimestamp", [1657152000]);
      await locker.processUnlockableCVX();

      [totalDeposited, totalPendingUnlocked, totalUnlocked, totalBorrowed, totalReward] = await locker.getUserInfo(
        alice.address
      );
      expect(totalDeposited).to.eq(constants.Zero);
      expect(totalPendingUnlocked).to.eq(constants.Zero);
      expect(totalUnlocked).to.eq(lockAmount);
      expect(totalBorrowed).to.eq(constants.Zero);
      expect(totalReward).to.eq(constants.Zero);

      const cvxBefore = await cvx.balanceOf(alice.address);
      await locker.connect(alice).withdrawUnlocked();
      const cvxAfter = await cvx.balanceOf(alice.address);
      expect(cvxAfter.sub(cvxBefore)).to.eq(lockAmount);

      [totalDeposited, totalPendingUnlocked, totalUnlocked, totalBorrowed, totalReward] = await locker.getUserInfo(
        alice.address
      );
      expect(totalDeposited).to.eq(constants.Zero);
      expect(totalPendingUnlocked).to.eq(constants.Zero);
      expect(totalUnlocked).to.eq(constants.Zero);
      expect(totalBorrowed).to.eq(constants.Zero);
      expect(totalReward).to.eq(constants.Zero);
    });

    it("should succeed, when deposit 2 times in the same epoch, unlock after 17 weeks", async () => {
      // lock 10 CVX in epoch 2723
      await hre.network.provider.send("evm_setNextBlockTimestamp", [1647470200]);
      await locker.connect(alice).deposit(lockAmount);

      let [locks, pendings] = await locker.getUserLocks(alice.address);
      expect(locks.length).to.eq(1);
      expect(locks[0].pendingUnlock).to.eq(lockAmount);
      expect(locks[0].unlockEpoch).to.eq(2723 + 17);
      expect(pendings.length).to.eq(0);

      let [totalDeposited, totalPendingUnlocked, totalUnlocked, totalBorrowed, totalReward] = await locker.getUserInfo(
        alice.address
      );
      expect(totalDeposited).to.eq(lockAmount);
      expect(totalPendingUnlocked).to.eq(constants.Zero);
      expect(totalUnlocked).to.eq(constants.Zero);
      expect(totalBorrowed).to.eq(constants.Zero);
      expect(totalReward).to.eq(constants.Zero);

      // lock 10 CVX in epoch 2723 again
      await hre.network.provider.send("evm_setNextBlockTimestamp", [1647471200]);
      await locker.connect(alice).deposit(lockAmount);

      [locks, pendings] = await locker.getUserLocks(alice.address);
      expect(locks.length).to.eq(1);
      expect(locks[0].pendingUnlock).to.eq(lockAmount.mul(2));
      expect(locks[0].unlockEpoch).to.eq(2723 + 17);
      expect(pendings.length).to.eq(0);

      [totalDeposited, totalPendingUnlocked, totalUnlocked, totalBorrowed, totalReward] = await locker.getUserInfo(
        alice.address
      );
      expect(totalDeposited).to.eq(lockAmount.mul(2));
      expect(totalPendingUnlocked).to.eq(constants.Zero);
      expect(totalUnlocked).to.eq(constants.Zero);
      expect(totalBorrowed).to.eq(constants.Zero);
      expect(totalReward).to.eq(constants.Zero);

      // unlock 10 CVX
      await locker.connect(alice).unlock(lockAmount);
      [locks, pendings] = await locker.getUserLocks(alice.address);
      expect(locks.length).to.eq(1);
      expect(locks[0].pendingUnlock).to.eq(lockAmount);
      expect(locks[0].unlockEpoch).to.eq(2723 + 17);
      expect(pendings.length).to.eq(1);
      expect(pendings[0].pendingUnlock).to.eq(lockAmount);
      expect(pendings[0].unlockEpoch).to.eq(2723 + 17);
      expect(await locker.pendingUnlocked(2723 + 17)).to.eq(lockAmount);

      [totalDeposited, totalPendingUnlocked, totalUnlocked, totalBorrowed, totalReward] = await locker.getUserInfo(
        alice.address
      );
      expect(totalDeposited).to.eq(lockAmount);
      expect(totalPendingUnlocked).to.eq(lockAmount);
      expect(totalUnlocked).to.eq(constants.Zero);
      expect(totalBorrowed).to.eq(constants.Zero);
      expect(totalReward).to.eq(constants.Zero);

      // 17 week passed
      await hre.network.provider.send("evm_setNextBlockTimestamp", [1657152000]);
      await locker.processUnlockableCVX();
      expect(await locker.pendingUnlocked(2723 + 17)).to.eq(0);

      [totalDeposited, totalPendingUnlocked, totalUnlocked, totalBorrowed, totalReward] = await locker.getUserInfo(
        alice.address
      );
      expect(totalDeposited).to.eq(lockAmount);
      expect(totalPendingUnlocked).to.eq(constants.Zero);
      expect(totalUnlocked).to.eq(lockAmount);
      expect(totalBorrowed).to.eq(constants.Zero);
      expect(totalReward).to.eq(constants.Zero);

      // withdraw unlocked
      const cvxBefore = await cvx.balanceOf(alice.address);
      await locker.connect(alice).withdrawUnlocked();
      const cvxAfter = await cvx.balanceOf(alice.address);
      expect(cvxAfter.sub(cvxBefore)).to.eq(lockAmount);

      [locks, pendings] = await locker.getUserLocks(alice.address);
      expect(locks.length).to.eq(1);
      expect(locks[0].pendingUnlock).to.eq(lockAmount);
      expect(locks[0].unlockEpoch).to.eq(2723 + 17 + 17);
      expect(pendings.length).to.eq(0);

      [totalDeposited, totalPendingUnlocked, totalUnlocked, totalBorrowed, totalReward] = await locker.getUserInfo(
        alice.address
      );
      expect(totalDeposited).to.eq(lockAmount);
      expect(totalPendingUnlocked).to.eq(constants.Zero);
      expect(totalUnlocked).to.eq(constants.Zero);
      expect(totalBorrowed).to.eq(constants.Zero);
      expect(totalReward).to.eq(constants.Zero);
    });

    it("should succeed, when deposit 3 times in different epoch, unlock after 17 weeks", async () => {
      // lock 10 CVX in epoch 2723
      await hre.network.provider.send("evm_setNextBlockTimestamp", [1647470200]);
      await locker.connect(alice).deposit(lockAmount);
      expect(await locker.totalLockedGlobal()).to.eq(lockAmount);
      expect(await locker.totalUnlockedGlobal()).to.eq(constants.Zero);
      expect(await locker.totalPendingUnlockGlobal()).to.eq(constants.Zero);

      let [locks, pendings] = await locker.getUserLocks(alice.address);
      expect(locks.length).to.eq(1);
      expect(locks[0].pendingUnlock).to.eq(lockAmount);
      expect(locks[0].unlockEpoch).to.eq(2723 + 17);
      expect(pendings.length).to.eq(0);

      let [totalDeposited, totalPendingUnlocked, totalUnlocked, totalBorrowed, totalReward] = await locker.getUserInfo(
        alice.address
      );
      expect(totalDeposited).to.eq(lockAmount);
      expect(totalPendingUnlocked).to.eq(constants.Zero);
      expect(totalUnlocked).to.eq(constants.Zero);
      expect(totalBorrowed).to.eq(constants.Zero);
      expect(totalReward).to.eq(constants.Zero);

      // lock 10 CVX in epoch 2725
      await hre.network.provider.send("evm_setNextBlockTimestamp", [1648680800]);
      await locker.connect(alice).deposit(lockAmount);
      expect(await locker.totalLockedGlobal()).to.eq(lockAmount.mul(2));
      expect(await locker.totalUnlockedGlobal()).to.eq(constants.Zero);
      expect(await locker.totalPendingUnlockGlobal()).to.eq(constants.Zero);

      [totalDeposited, totalPendingUnlocked, totalUnlocked, totalBorrowed, totalReward] = await locker.getUserInfo(
        alice.address
      );
      expect(totalDeposited).to.eq(lockAmount.mul(2));
      expect(totalPendingUnlocked).to.eq(constants.Zero);
      expect(totalUnlocked).to.eq(constants.Zero);
      expect(totalBorrowed).to.eq(constants.Zero);
      expect(totalReward).to.eq(constants.Zero);

      [locks, pendings] = await locker.getUserLocks(alice.address);
      expect(locks.length).to.eq(2);
      expect(locks[0].pendingUnlock).to.eq(lockAmount);
      expect(locks[0].unlockEpoch).to.eq(2723 + 17);
      expect(locks[1].pendingUnlock).to.eq(lockAmount);
      expect(locks[1].unlockEpoch).to.eq(2725 + 17);
      expect(pendings.length).to.eq(0);

      // lock 10 CVX in epoch 2726
      await hre.network.provider.send("evm_setNextBlockTimestamp", [1649280600]);
      await locker.connect(alice).deposit(lockAmount);
      expect(await locker.totalLockedGlobal()).to.eq(lockAmount.mul(3));
      expect(await locker.totalUnlockedGlobal()).to.eq(constants.Zero);
      expect(await locker.totalPendingUnlockGlobal()).to.eq(constants.Zero);

      [totalDeposited, totalPendingUnlocked, totalUnlocked, totalBorrowed, totalReward] = await locker.getUserInfo(
        alice.address
      );
      expect(totalDeposited).to.eq(lockAmount.mul(3));
      expect(totalPendingUnlocked).to.eq(constants.Zero);
      expect(totalUnlocked).to.eq(constants.Zero);
      expect(totalBorrowed).to.eq(constants.Zero);
      expect(totalReward).to.eq(constants.Zero);

      [locks, pendings] = await locker.getUserLocks(alice.address);
      expect(locks.length).to.eq(3);
      expect(locks[0].pendingUnlock).to.eq(lockAmount);
      expect(locks[0].unlockEpoch).to.eq(2723 + 17);
      expect(locks[1].pendingUnlock).to.eq(lockAmount);
      expect(locks[1].unlockEpoch).to.eq(2725 + 17);
      expect(locks[2].pendingUnlock).to.eq(lockAmount);
      expect(locks[2].unlockEpoch).to.eq(2726 + 17);
      expect(pendings.length).to.eq(0);

      // unlock 16 CVX
      const extraUnlockAmount = lockAmount.mul(6).div(10);
      await locker.connect(alice).unlock(lockAmount.add(extraUnlockAmount));
      expect(await locker.totalLockedGlobal()).to.eq(lockAmount.mul(2).sub(extraUnlockAmount));
      expect(await locker.totalUnlockedGlobal()).to.eq(constants.Zero);
      expect(await locker.totalPendingUnlockGlobal()).to.eq(lockAmount.add(extraUnlockAmount));
      expect(await locker.pendingUnlocked(2723 + 17)).to.eq(lockAmount);
      expect(await locker.pendingUnlocked(2725 + 17)).to.eq(extraUnlockAmount);

      [totalDeposited, totalPendingUnlocked, totalUnlocked, totalBorrowed, totalReward] = await locker.getUserInfo(
        alice.address
      );
      expect(totalDeposited).to.eq(lockAmount.mul(2).sub(extraUnlockAmount));
      expect(totalPendingUnlocked).to.eq(lockAmount.add(extraUnlockAmount));
      expect(totalUnlocked).to.eq(constants.Zero);
      expect(totalBorrowed).to.eq(constants.Zero);
      expect(totalReward).to.eq(constants.Zero);

      [locks, pendings] = await locker.getUserLocks(alice.address);
      expect(locks.length).to.eq(2);
      expect(locks[0].pendingUnlock).to.eq(lockAmount.sub(extraUnlockAmount));
      expect(locks[0].unlockEpoch).to.eq(2725 + 17);
      expect(locks[1].pendingUnlock).to.eq(lockAmount);
      expect(locks[1].unlockEpoch).to.eq(2726 + 17);
      expect(pendings.length).to.eq(2);
      expect(pendings[0].pendingUnlock).to.eq(lockAmount);
      expect(pendings[0].unlockEpoch).to.eq(2723 + 17);
      expect(pendings[1].pendingUnlock).to.eq(extraUnlockAmount);
      expect(pendings[1].unlockEpoch).to.eq(2725 + 17);

      // 17 week passed, in epoch 2723 + 17
      await hre.network.provider.send("evm_setNextBlockTimestamp", [1657152000]);
      await locker.processUnlockableCVX();
      expect(await locker.totalLockedGlobal()).to.eq(lockAmount.mul(2).sub(extraUnlockAmount));
      expect(await locker.totalUnlockedGlobal()).to.eq(lockAmount);
      expect(await locker.totalPendingUnlockGlobal()).to.eq(extraUnlockAmount);
      expect(await locker.pendingUnlocked(2723 + 17)).to.eq(0);
      expect(await locker.pendingUnlocked(2725 + 17)).to.eq(extraUnlockAmount);

      [totalDeposited, totalPendingUnlocked, totalUnlocked, totalBorrowed, totalReward] = await locker.getUserInfo(
        alice.address
      );
      expect(totalDeposited).to.eq(lockAmount.mul(2).sub(extraUnlockAmount));
      expect(totalPendingUnlocked).to.eq(extraUnlockAmount);
      expect(totalUnlocked).to.eq(lockAmount);
      expect(totalBorrowed).to.eq(constants.Zero);
      expect(totalReward).to.eq(constants.Zero);

      [locks, pendings] = await locker.getUserLocks(alice.address);
      expect(locks.length).to.eq(2);
      expect(locks[0].pendingUnlock).to.eq(lockAmount.sub(extraUnlockAmount));
      expect(locks[0].unlockEpoch).to.eq(2725 + 17);
      expect(locks[1].pendingUnlock).to.eq(lockAmount);
      expect(locks[1].unlockEpoch).to.eq(2726 + 17);
      expect(pendings.length).to.eq(1);
      expect(pendings[0].pendingUnlock).to.eq(extraUnlockAmount);
      expect(pendings[0].unlockEpoch).to.eq(2725 + 17);

      // withdraw unlocked
      let cvxBefore = await cvx.balanceOf(alice.address);
      await locker.connect(alice).withdrawUnlocked();
      let cvxAfter = await cvx.balanceOf(alice.address);
      expect(cvxAfter.sub(cvxBefore)).to.eq(lockAmount);

      expect(await locker.totalLockedGlobal()).to.eq(lockAmount.mul(2).sub(extraUnlockAmount));
      expect(await locker.totalUnlockedGlobal()).to.eq(constants.Zero);
      expect(await locker.totalPendingUnlockGlobal()).to.eq(extraUnlockAmount);

      [totalDeposited, totalPendingUnlocked, totalUnlocked, totalBorrowed, totalReward] = await locker.getUserInfo(
        alice.address
      );
      expect(totalDeposited).to.eq(lockAmount.mul(2).sub(extraUnlockAmount));
      expect(totalPendingUnlocked).to.eq(extraUnlockAmount);
      expect(totalUnlocked).to.eq(constants.Zero);
      expect(totalBorrowed).to.eq(constants.Zero);
      expect(totalReward).to.eq(constants.Zero);

      [locks, pendings] = await locker.getUserLocks(alice.address);
      expect(locks.length).to.eq(2);
      expect(locks[0].pendingUnlock).to.eq(lockAmount.sub(extraUnlockAmount));
      expect(locks[0].unlockEpoch).to.eq(2725 + 17);
      expect(locks[1].pendingUnlock).to.eq(lockAmount);
      expect(locks[1].unlockEpoch).to.eq(2726 + 17);
      expect(pendings.length).to.eq(1);
      expect(pendings[0].pendingUnlock).to.eq(extraUnlockAmount);
      expect(pendings[0].unlockEpoch).to.eq(2725 + 17);

      // 2 week passed, in epoch 2725 + 17
      await hre.network.provider.send("evm_setNextBlockTimestamp", [1658361600]);
      await locker.processUnlockableCVX();
      expect(await locker.totalLockedGlobal()).to.eq(lockAmount.mul(2).sub(extraUnlockAmount));
      expect(await locker.totalUnlockedGlobal()).to.eq(extraUnlockAmount);
      expect(await locker.totalPendingUnlockGlobal()).to.eq(constants.Zero);
      expect(await locker.pendingUnlocked(2725 + 17)).to.eq(0);

      [totalDeposited, totalPendingUnlocked, totalUnlocked, totalBorrowed, totalReward] = await locker.getUserInfo(
        alice.address
      );
      expect(totalDeposited).to.eq(lockAmount.mul(2).sub(extraUnlockAmount));
      expect(totalPendingUnlocked).to.eq(constants.Zero);
      expect(totalUnlocked).to.eq(extraUnlockAmount);
      expect(totalBorrowed).to.eq(constants.Zero);
      expect(totalReward).to.eq(constants.Zero);

      [locks, pendings] = await locker.getUserLocks(alice.address);
      expect(locks.length).to.eq(2);
      expect(locks[0].pendingUnlock).to.eq(lockAmount);
      expect(locks[0].unlockEpoch).to.eq(2726 + 17);
      expect(locks[1].pendingUnlock).to.eq(lockAmount.sub(extraUnlockAmount));
      expect(locks[1].unlockEpoch).to.eq(2725 + 17 + 17);
      expect(pendings.length).to.eq(0);

      // withdraw unlocked
      cvxBefore = await cvx.balanceOf(alice.address);
      await locker.connect(alice).withdrawUnlocked();
      cvxAfter = await cvx.balanceOf(alice.address);
      expect(cvxAfter.sub(cvxBefore)).to.eq(extraUnlockAmount);

      expect(await locker.totalLockedGlobal()).to.eq(lockAmount.mul(2).sub(extraUnlockAmount));
      expect(await locker.totalUnlockedGlobal()).to.eq(constants.Zero);
      expect(await locker.totalPendingUnlockGlobal()).to.eq(constants.Zero);

      [totalDeposited, totalPendingUnlocked, totalUnlocked, totalBorrowed, totalReward] = await locker.getUserInfo(
        alice.address
      );
      expect(totalDeposited).to.eq(lockAmount.mul(2).sub(extraUnlockAmount));
      expect(totalPendingUnlocked).to.eq(constants.Zero);
      expect(totalUnlocked).to.eq(constants.Zero);
      expect(totalBorrowed).to.eq(constants.Zero);
      expect(totalReward).to.eq(constants.Zero);

      [locks, pendings] = await locker.getUserLocks(alice.address);
      expect(locks.length).to.eq(2);
      expect(locks[0].pendingUnlock).to.eq(lockAmount);
      expect(locks[0].unlockEpoch).to.eq(2726 + 17);
      expect(locks[1].pendingUnlock).to.eq(lockAmount.sub(extraUnlockAmount));
      expect(locks[1].unlockEpoch).to.eq(2725 + 17 + 17);
      expect(pendings.length).to.eq(0);
    });
  });
});
