import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { MockERC20, MockLinearRewardDistributor } from "@typechain/index";
import { expect } from "chai";
import { MaxUint256, ZeroHash, toBigInt } from "ethers";
import { ethers, network } from "hardhat";

describe("LinearRewardDistributor.spec", async () => {
  context("constructor", async () => {
    it("should revert, when period length is invalid", async () => {
      const [deployer] = await ethers.getSigners();
      const MockLinearRewardDistributor = await ethers.getContractFactory("MockLinearRewardDistributor", deployer);

      await expect(MockLinearRewardDistributor.deploy(1)).to.revertedWith("invalid period length");
      await expect(MockLinearRewardDistributor.deploy(86400 - 1)).to.revertedWith("invalid period length");
      await expect(MockLinearRewardDistributor.deploy(86400 * 28 + 1)).to.revertedWith("invalid period length");
    });

    for (const periodLength of [0, 86400, 86400 * 7, 86400 * 14, 86400 * 28]) {
      it(`should succeed with period[${periodLength}]`, async () => {
        const [deployer] = await ethers.getSigners();
        const MockLinearRewardDistributor = await ethers.getContractFactory("MockLinearRewardDistributor", deployer);
        const distributor = await MockLinearRewardDistributor.deploy(periodLength);
        expect(await distributor.periodLength()).to.eq(periodLength);
      });
    }
  });

  for (const periodLength of [0, 86400, 86400 * 7, 86400 * 14, 86400 * 28]) {
    let deployer: HardhatEthersSigner;
    let holder0: HardhatEthersSigner;

    let token0: MockERC20;
    let distributor: MockLinearRewardDistributor;

    context(`run with period[${periodLength}]`, async () => {
      beforeEach(async () => {
        [deployer, holder0] = await ethers.getSigners();
        const MockERC20 = await ethers.getContractFactory("MockERC20", deployer);
        const MockLinearRewardDistributor = await ethers.getContractFactory("MockLinearRewardDistributor", deployer);

        token0 = await MockERC20.deploy("R0", "R0", 18);
        distributor = await MockLinearRewardDistributor.deploy(periodLength);
        await distributor.initialize(await token0.getAddress());
      });

      context("initialization", async () => {
        it("should initialize correctly", async () => {
          expect(await distributor.periodLength()).to.eq(periodLength);
          expect(await distributor.rewardToken()).to.deep.eq(await token0.getAddress());
          expect(await distributor.hasRole(ZeroHash, deployer.address)).to.eq(true);
        });
      });

      context("#depositReward", async () => {
        beforeEach(async () => {
          await distributor.grantRole(await distributor.REWARD_DEPOSITOR_ROLE(), holder0.address);
        });

        it("should revert, when caller is not distributor", async () => {
          const role = await distributor.REWARD_DEPOSITOR_ROLE();
          await expect(distributor.depositReward(0)).to.revertedWith(
            "AccessControl: account " + deployer.address.toLowerCase() + " is missing role " + role
          );
        });

        it("should succeed", async () => {
          await token0.mint(holder0.address, ethers.parseEther("100000"));
          await token0.connect(holder0).approve(await distributor.getAddress(), MaxUint256);
          const depositAmount0 = ethers.parseEther("1000");
          let tx = distributor.connect(holder0).depositReward(depositAmount0);
          await expect(tx).to.emit(distributor, "DepositReward").withArgs(depositAmount0);
          expect(await token0.balanceOf(await distributor.getAddress())).to.eq(depositAmount0);
          if (periodLength === 0) {
            await expect(tx).to.emit(distributor, "AccumulateReward").withArgs(depositAmount0);
          } else {
            const timestamp0 = (await ethers.provider.getBlock("latest"))!.timestamp;
            const rewardData0 = await distributor.rewardData();
            const expectedRate0 = depositAmount0 / toBigInt(periodLength);
            expect(rewardData0.lastUpdate).to.eq(timestamp0);
            expect(rewardData0.finishAt).to.eq(timestamp0 + periodLength);
            expect(rewardData0.rate).to.eq(expectedRate0);
            expect(await distributor.pendingRewards()).to.deep.eq([0n, expectedRate0 * toBigInt(periodLength)]);

            // 1/3 period
            await network.provider.send("evm_setNextBlockTimestamp", [timestamp0 + Math.floor(periodLength / 3)]);
            await network.provider.send("evm_mine", []);
            expect(await distributor.pendingRewards()).to.deep.eq([
              expectedRate0 * toBigInt(Math.floor(periodLength / 3)),
              expectedRate0 * toBigInt(periodLength - Math.floor(periodLength / 3)),
            ]);

            // deposit 89% of expectedRate * toBigInt(Math.floor(periodLength / 3)), should be queued
            const depositAmount1 = (expectedRate0 * toBigInt(Math.floor(periodLength / 3)) * 89n) / 100n;
            tx = distributor.connect(holder0).depositReward(depositAmount1);
            await expect(tx).to.emit(distributor, "DepositReward").withArgs(depositAmount1);

            const timestamp1 = (await ethers.provider.getBlock("latest"))!.timestamp;
            await expect(tx)
              .to.emit(distributor, "AccumulateReward")
              .withArgs(expectedRate0 * toBigInt(timestamp1 - timestamp0));
            const rewardData1 = await distributor.rewardData();
            expect(rewardData1.lastUpdate).to.eq(timestamp1);
            expect(rewardData1.finishAt).to.eq(timestamp0 + periodLength);
            expect(rewardData1.rate).to.eq(expectedRate0);
            expect(rewardData1.queued).to.eq(depositAmount1);

            // deposit another 2% expectedRate * toBigInt(Math.floor(periodLength / 3)), should distribute
            const depositAmount2 = (expectedRate0 * toBigInt(Math.floor(periodLength / 3)) * 2n) / 100n;
            tx = distributor.connect(holder0).depositReward(depositAmount2);
            await expect(tx)
              .to.emit(distributor, "DepositReward")
              .withArgs(depositAmount2)
              .to.emit(distributor, "AccumulateReward");
            const timestamp2 = (await ethers.provider.getBlock("latest"))!.timestamp;
            const rewardData2 = await distributor.rewardData();
            const expectedRate2 =
              (depositAmount1 + depositAmount2 + expectedRate0 * toBigInt(timestamp0 + periodLength - timestamp2)) /
              toBigInt(periodLength);
            expect(rewardData2.lastUpdate).to.eq(timestamp2);
            expect(rewardData2.finishAt).to.eq(timestamp2 + periodLength);
            expect(rewardData2.rate).to.eq(expectedRate2);
            expect(rewardData2.queued).to.eq(0n);
          }
        });
      });
    });
  }
});
