import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { MockERC20, MockMultipleRewardCompoundingAccumulator } from "@/types/index";
import { expect } from "chai";
import { MaxUint256, ZeroAddress, ZeroHash, toBigInt } from "ethers";
import { ethers, network } from "hardhat";

describe("MultipleRewardCompoundingAccumulator.spec", async () => {
  for (const rewardCount of [1, 3]) {
    const periodLength = 86400 * 7;
    const precision = 10n ** 18n;

    let deployer: HardhatEthersSigner;
    let manager: HardhatEthersSigner;
    let receiver: HardhatEthersSigner;

    let tokens: MockERC20[];
    let tokenAddresses: string[];
    let accumulator: MockMultipleRewardCompoundingAccumulator;

    context(`run with period[${periodLength}] rewards[${rewardCount}]`, async () => {
      beforeEach(async () => {
        [deployer, manager, receiver] = await ethers.getSigners();
        const MockERC20 = await ethers.getContractFactory("MockERC20", deployer);
        const MockMultipleRewardCompoundingAccumulator = await ethers.getContractFactory(
          "MockMultipleRewardCompoundingAccumulator",
          deployer
        );

        tokens = [];
        tokenAddresses = [];
        for (let i = 0; i < rewardCount; i++) {
          tokens.push(await MockERC20.deploy("R", "R", 18));
          tokenAddresses.push(await tokens[i].getAddress());
          await tokens[i].mint(deployer.address, ethers.parseEther("1000000"));
        }
        accumulator = await MockMultipleRewardCompoundingAccumulator.deploy(periodLength);
        await accumulator.initialize();

        await accumulator.grantRole(await accumulator.REWARD_MANAGER_ROLE(), manager.address);
        for (let i = 0; i < rewardCount; i++) {
          await accumulator.connect(manager).registerRewardToken(await tokens[i].getAddress(), deployer.address);
          await tokens[i].approve(await accumulator.getAddress(), MaxUint256);
        }
      });

      context("initialization", async () => {
        it("should initialize correctly", async () => {
          expect(await accumulator.periodLength()).to.eq(periodLength);
          expect(await accumulator.getActiveRewardTokens()).to.deep.eq(tokenAddresses);
          expect(await accumulator.getHistoricalRewardTokens()).to.deep.eq([]);
          expect(await accumulator.hasRole(ZeroHash, deployer.address)).to.eq(true);
        });
      });

      context("reentrant", async () => {
        it("should prevent reentrant on checkpoint", async () => {
          await expect(
            accumulator.reentrantCall(accumulator.interface.encodeFunctionData("checkpoint", [ZeroAddress]))
          ).to.revertedWith("ReentrancyGuard: reentrant call");
        });

        it("should prevent reentrant on claim", async () => {
          await expect(accumulator.reentrantCall(accumulator.interface.encodeFunctionData("claim()"))).to.revertedWith(
            "ReentrancyGuard: reentrant call"
          );
          await expect(
            accumulator.reentrantCall(accumulator.interface.encodeFunctionData("claim(address)", [ZeroAddress]))
          ).to.revertedWith("ReentrancyGuard: reentrant call");
          await expect(
            accumulator.reentrantCall(
              accumulator.interface.encodeFunctionData("claim(address,address)", [ZeroAddress, ZeroAddress])
            )
          ).to.revertedWith("ReentrancyGuard: reentrant call");
        });
        it("should prevent reentrant on claimHistorical", async () => {
          await expect(
            accumulator.reentrantCall(
              accumulator.interface.encodeFunctionData("claimHistorical(address,address[])", [ZeroAddress, []])
            )
          ).to.revertedWith("ReentrancyGuard: reentrant call");
          await expect(
            accumulator.reentrantCall(accumulator.interface.encodeFunctionData("claimHistorical(address[])", [[]]))
          ).to.revertedWith("ReentrancyGuard: reentrant call");
        });
      });

      context("#checkpoint", async () => {
        const BaseRewardAmount = ethers.parseEther("2233");
        const TotalPoolShare = ethers.parseEther("1234");
        const UserPoolShare = ethers.parseEther("456");

        beforeEach(async () => {
          await accumulator.setTotalPoolShare(TotalPoolShare, 10n ** 18n);
          await accumulator.setUserPoolShare(UserPoolShare, 10n ** 18n);
          for (let i = 0; i < rewardCount; i++) {
            const depositedAmount = BaseRewardAmount * toBigInt(i + 1);
            await accumulator.depositReward(await tokens[i].getAddress(), depositedAmount);
          }
        });

        it("should succeed when only checkpoint global snapshot", async () => {
          const timestamp = (await ethers.provider.getBlock("latest"))!.timestamp;
          await network.provider.send("evm_setNextBlockTimestamp", [timestamp + periodLength]);
          await accumulator.checkpoint(ZeroAddress);

          for (let i = 0; i < rewardCount; i++) {
            const snapshot = await accumulator.epochToExponentToRewardSnapshot(await tokens[i].getAddress(), 0);
            const depositedAmount = BaseRewardAmount * toBigInt(i + 1);
            const rate = depositedAmount / toBigInt(periodLength);
            expect(snapshot.integral).to.closeTo(
              (rate * toBigInt(periodLength) * precision * precision) / TotalPoolShare,
              100n * precision
            );
            expect(snapshot.timestamp).to.eq(timestamp + periodLength);
          }
        });

        it("should succeed, when checkpoint normal user", async () => {
          let timestamp = (await ethers.provider.getBlock("latest"))!.timestamp;
          await network.provider.send("evm_setNextBlockTimestamp", [timestamp + periodLength]);
          await accumulator.checkpoint(deployer.address);

          for (let i = 0; i < rewardCount; i++) {
            const snapshot = await accumulator.epochToExponentToRewardSnapshot(await tokens[i].getAddress(), 0);
            const depositedAmount = BaseRewardAmount * toBigInt(i + 1);
            const rate = depositedAmount / toBigInt(periodLength);
            expect(snapshot.integral).to.closeTo(
              (rate * toBigInt(periodLength) * precision * precision) / TotalPoolShare,
              100n * precision
            );
            expect(snapshot.timestamp).to.eq(timestamp + periodLength);

            const userSnapshot = await accumulator.userRewardSnapshot(deployer.address, await tokens[i].getAddress());
            expect(userSnapshot.checkpoint.timestamp).to.eq(timestamp + periodLength);
            expect(userSnapshot.checkpoint.integral).to.eq(snapshot.integral);
            expect(userSnapshot.rewards.pending).to.closeTo(
              (depositedAmount * UserPoolShare) / TotalPoolShare,
              userSnapshot.rewards.pending / 1000000n
            ); // error within 0.00001%
          }

          // deposit again
          for (let i = 0; i < rewardCount; i++) {
            const depositedAmount = BaseRewardAmount * toBigInt(i + 1);
            await accumulator.depositReward(await tokens[i].getAddress(), depositedAmount);
          }
          timestamp = (await ethers.provider.getBlock("latest"))!.timestamp;
          await network.provider.send("evm_setNextBlockTimestamp", [timestamp + periodLength]);
          await accumulator.checkpoint(deployer.address);

          for (let i = 0; i < rewardCount; i++) {
            const snapshot = await accumulator.epochToExponentToRewardSnapshot(await tokens[i].getAddress(), 0);
            const depositedAmount = BaseRewardAmount * toBigInt(i + 1);
            const rate = depositedAmount / toBigInt(periodLength);
            expect(snapshot.integral).to.closeTo(
              ((rate * toBigInt(periodLength) * precision * precision) / TotalPoolShare) * 2n,
              1000n * precision
            );
            expect(snapshot.timestamp).to.eq(timestamp + periodLength);

            const userSnapshot = await accumulator.userRewardSnapshot(deployer.address, await tokens[i].getAddress());
            expect(userSnapshot.checkpoint.timestamp).to.eq(timestamp + periodLength);
            expect(userSnapshot.checkpoint.integral).to.eq(snapshot.integral);
            expect(userSnapshot.rewards.pending).to.closeTo(
              ((depositedAmount * UserPoolShare) / TotalPoolShare) * 2n,
              userSnapshot.rewards.pending / 1000000n
            ); // error within 0.00001%
          }
        });
      });

      context("#setRewardReceiver", async () => {
        it("should succeed", async () => {
          expect(await accumulator.rewardReceiver(deployer.address)).to.eq(ZeroAddress);
          await expect(accumulator.connect(deployer).setRewardReceiver(receiver.address))
            .to.emit(accumulator, "UpdateRewardReceiver")
            .withArgs(deployer.address, ZeroAddress, receiver.address);
          expect(await accumulator.rewardReceiver(deployer.address)).to.eq(receiver.address);
          await expect(accumulator.connect(deployer).setRewardReceiver(ZeroAddress))
            .to.emit(accumulator, "UpdateRewardReceiver")
            .withArgs(deployer.address, receiver.address, ZeroAddress);
          expect(await accumulator.rewardReceiver(deployer.address)).to.eq(ZeroAddress);
        });
      });

      context("#claim without setting rewardReceiver", async () => {
        const BaseRewardAmount = ethers.parseEther("2233");
        const TotalPoolShare = ethers.parseEther("1234");
        const UserPoolShare = ethers.parseEther("456");

        beforeEach(async () => {
          await accumulator.setTotalPoolShare(TotalPoolShare, 10n ** 18n);
          await accumulator.setUserPoolShare(UserPoolShare, 10n ** 18n);
          for (let i = 0; i < rewardCount; i++) {
            const depositedAmount = BaseRewardAmount * toBigInt(i + 1);
            await accumulator.depositReward(await tokens[i].getAddress(), depositedAmount);
          }
          if (periodLength > 0) {
            const timestamp = (await ethers.provider.getBlock("latest"))!.timestamp;
            await network.provider.send("evm_setNextBlockTimestamp", [timestamp + periodLength]);
          }
          await accumulator.checkpoint(deployer.address);
        });

        it("should revert when claim other to other", async () => {
          await expect(
            accumulator["claim(address,address)"](manager.address, deployer.address)
          ).to.revertedWithCustomError(accumulator, "ClaimOthersRewardToAnother");
        });

        it("should succeed when claim caller", async () => {
          const claimable = [];
          const before = [];
          for (let i = 0; i < rewardCount; i++) {
            claimable.push(await accumulator.claimable(deployer.address, await tokens[i].getAddress()));
            before.push(await tokens[i].balanceOf(deployer.address));
            const snapshot = await accumulator.userRewardSnapshot(deployer.address, await tokens[i].getAddress());
            expect(snapshot.rewards.pending).to.gt(0n);
            expect(snapshot.rewards.claimed).to.eq(0n);
          }
          const tx = accumulator["claim()"]();
          for (let i = 0; i < rewardCount; i++) {
            await expect(tx)
              .to.emit(accumulator, "Claim")
              .withArgs(deployer.address, await tokens[i].getAddress(), deployer.address, claimable[i]);
          }
          for (let i = 0; i < rewardCount; i++) {
            expect(await accumulator.claimable(deployer.address, await tokens[i].getAddress())).to.eq(0n);
            expect(await tokens[i].balanceOf(deployer.address)).to.eq(before[i] + claimable[i]);
            const snapshot = await accumulator.userRewardSnapshot(deployer.address, await tokens[i].getAddress());
            expect(snapshot.rewards.pending).to.eq(0n);
            expect(snapshot.rewards.claimed).to.eq(claimable[i]);
            expect(await accumulator.claimed(deployer.address, await tokens[i].getAddress())).to.eq(claimable[i]);
          }
          await expect(accumulator["claim()"]()).to.not.emit(accumulator, "Claim");
          for (let i = 0; i < rewardCount; i++) {
            expect(await accumulator.claimable(deployer.address, await tokens[i].getAddress())).to.eq(0n);
            expect(await tokens[i].balanceOf(deployer.address)).to.eq(before[i] + claimable[i]);
            const snapshot = await accumulator.userRewardSnapshot(deployer.address, await tokens[i].getAddress());
            expect(snapshot.rewards.pending).to.eq(0n);
            expect(snapshot.rewards.claimed).to.eq(claimable[i]);
            expect(await accumulator.claimed(deployer.address, await tokens[i].getAddress())).to.eq(claimable[i]);
          }
        });

        it("should succeed when claim other", async () => {
          const claimable = [];
          const before = [];
          for (let i = 0; i < rewardCount; i++) {
            claimable.push(await accumulator.claimable(deployer.address, await tokens[i].getAddress()));
            before.push(await tokens[i].balanceOf(deployer.address));
            const snapshot = await accumulator.userRewardSnapshot(deployer.address, await tokens[i].getAddress());
            expect(snapshot.rewards.pending).to.gt(0n);
            expect(snapshot.rewards.claimed).to.eq(0n);
          }
          const tx = accumulator.connect(manager)["claim(address)"](deployer.address);
          for (let i = 0; i < rewardCount; i++) {
            await expect(tx)
              .to.emit(accumulator, "Claim")
              .withArgs(deployer.address, await tokens[i].getAddress(), deployer.address, claimable[i]);
          }
          for (let i = 0; i < rewardCount; i++) {
            expect(await accumulator.claimable(deployer.address, await tokens[i].getAddress())).to.eq(0n);
            expect(await tokens[i].balanceOf(deployer.address)).to.eq(before[i] + claimable[i]);
            const snapshot = await accumulator.userRewardSnapshot(deployer.address, await tokens[i].getAddress());
            expect(snapshot.rewards.pending).to.eq(0n);
            expect(snapshot.rewards.claimed).to.eq(claimable[i]);
            expect(await accumulator.claimed(deployer.address, await tokens[i].getAddress())).to.eq(claimable[i]);
          }
          await expect(accumulator.connect(manager)["claim(address)"](deployer.address)).to.not.emit(
            accumulator,
            "Claim"
          );
          for (let i = 0; i < rewardCount; i++) {
            expect(await accumulator.claimable(deployer.address, await tokens[i].getAddress())).to.eq(0n);
            expect(await tokens[i].balanceOf(deployer.address)).to.eq(before[i] + claimable[i]);
            const snapshot = await accumulator.userRewardSnapshot(deployer.address, await tokens[i].getAddress());
            expect(snapshot.rewards.pending).to.eq(0n);
            expect(snapshot.rewards.claimed).to.eq(claimable[i]);
            expect(await accumulator.claimed(deployer.address, await tokens[i].getAddress())).to.eq(claimable[i]);
          }
        });

        it("should succeed when claim to other", async () => {
          const claimable = [];
          const before = [];
          for (let i = 0; i < rewardCount; i++) {
            claimable.push(await accumulator.claimable(deployer.address, await tokens[i].getAddress()));
            before.push(await tokens[i].balanceOf(manager.address));
            const snapshot = await accumulator.userRewardSnapshot(deployer.address, await tokens[i].getAddress());
            expect(snapshot.rewards.pending).to.gt(0n);
            expect(snapshot.rewards.claimed).to.eq(0n);
          }
          const tx = accumulator["claim(address,address)"](deployer.address, manager.address);
          for (let i = 0; i < rewardCount; i++) {
            await expect(tx)
              .to.emit(accumulator, "Claim")
              .withArgs(deployer.address, await tokens[i].getAddress(), manager.address, claimable[i]);
          }
          for (let i = 0; i < rewardCount; i++) {
            expect(await accumulator.claimable(deployer.address, await tokens[i].getAddress())).to.eq(0n);
            expect(await tokens[i].balanceOf(manager.address)).to.eq(before[i] + claimable[i]);
            const snapshot = await accumulator.userRewardSnapshot(deployer.address, await tokens[i].getAddress());
            expect(snapshot.rewards.pending).to.eq(0n);
            expect(snapshot.rewards.claimed).to.eq(claimable[i]);
            expect(await accumulator.claimed(deployer.address, await tokens[i].getAddress())).to.eq(claimable[i]);
          }
          await expect(accumulator["claim(address,address)"](deployer.address, manager.address)).to.not.emit(
            accumulator,
            "Claim"
          );
          for (let i = 0; i < rewardCount; i++) {
            expect(await accumulator.claimable(deployer.address, await tokens[i].getAddress())).to.eq(0n);
            expect(await tokens[i].balanceOf(manager.address)).to.eq(before[i] + claimable[i]);
            const snapshot = await accumulator.userRewardSnapshot(deployer.address, await tokens[i].getAddress());
            expect(snapshot.rewards.pending).to.eq(0n);
            expect(snapshot.rewards.claimed).to.eq(claimable[i]);
            expect(await accumulator.claimed(deployer.address, await tokens[i].getAddress())).to.eq(claimable[i]);
          }
        });
      });

      context("#claim with setting rewardReceiver", async () => {
        const BaseRewardAmount = ethers.parseEther("2233");
        const TotalPoolShare = ethers.parseEther("1234");
        const UserPoolShare = ethers.parseEther("456");

        beforeEach(async () => {
          await accumulator.setTotalPoolShare(TotalPoolShare, 10n ** 18n);
          await accumulator.setUserPoolShare(UserPoolShare, 10n ** 18n);
          for (let i = 0; i < rewardCount; i++) {
            const depositedAmount = BaseRewardAmount * toBigInt(i + 1);
            await accumulator.depositReward(await tokens[i].getAddress(), depositedAmount);
          }
          if (periodLength > 0) {
            const timestamp = (await ethers.provider.getBlock("latest"))!.timestamp;
            await network.provider.send("evm_setNextBlockTimestamp", [timestamp + periodLength]);
          }
          await accumulator.checkpoint(deployer.address);
          await accumulator.connect(deployer).setRewardReceiver(receiver.address);
        });

        it("should revert when claim other to other", async () => {
          await expect(
            accumulator["claim(address,address)"](manager.address, deployer.address)
          ).to.revertedWithCustomError(accumulator, "ClaimOthersRewardToAnother");
        });

        it("should succeed when claim caller", async () => {
          const claimable = [];
          const before = [];
          for (let i = 0; i < rewardCount; i++) {
            claimable.push(await accumulator.claimable(deployer.address, await tokens[i].getAddress()));
            before.push(await tokens[i].balanceOf(receiver.address));
            const snapshot = await accumulator.userRewardSnapshot(deployer.address, await tokens[i].getAddress());
            expect(snapshot.rewards.pending).to.gt(0n);
            expect(snapshot.rewards.claimed).to.eq(0n);
          }
          const tx = accumulator["claim()"]();
          for (let i = 0; i < rewardCount; i++) {
            await expect(tx)
              .to.emit(accumulator, "Claim")
              .withArgs(deployer.address, await tokens[i].getAddress(), receiver.address, claimable[i]);
          }
          for (let i = 0; i < rewardCount; i++) {
            expect(await accumulator.claimable(deployer.address, await tokens[i].getAddress())).to.eq(0n);
            expect(await tokens[i].balanceOf(receiver.address)).to.eq(before[i] + claimable[i]);
            const snapshot = await accumulator.userRewardSnapshot(deployer.address, await tokens[i].getAddress());
            expect(snapshot.rewards.pending).to.eq(0n);
            expect(snapshot.rewards.claimed).to.eq(claimable[i]);
            expect(await accumulator.claimed(deployer.address, await tokens[i].getAddress())).to.eq(claimable[i]);
          }
          await expect(accumulator["claim()"]()).to.not.emit(accumulator, "Claim");
          for (let i = 0; i < rewardCount; i++) {
            expect(await accumulator.claimable(deployer.address, await tokens[i].getAddress())).to.eq(0n);
            expect(await tokens[i].balanceOf(receiver.address)).to.eq(before[i] + claimable[i]);
            const snapshot = await accumulator.userRewardSnapshot(deployer.address, await tokens[i].getAddress());
            expect(snapshot.rewards.pending).to.eq(0n);
            expect(snapshot.rewards.claimed).to.eq(claimable[i]);
            expect(await accumulator.claimed(deployer.address, await tokens[i].getAddress())).to.eq(claimable[i]);
          }
        });

        it("should succeed when claim other", async () => {
          const claimable = [];
          const before = [];
          for (let i = 0; i < rewardCount; i++) {
            claimable.push(await accumulator.claimable(deployer.address, await tokens[i].getAddress()));
            before.push(await tokens[i].balanceOf(receiver.address));
            const snapshot = await accumulator.userRewardSnapshot(deployer.address, await tokens[i].getAddress());
            expect(snapshot.rewards.pending).to.gt(0n);
            expect(snapshot.rewards.claimed).to.eq(0n);
          }
          const tx = accumulator.connect(manager)["claim(address)"](deployer.address);
          for (let i = 0; i < rewardCount; i++) {
            await expect(tx)
              .to.emit(accumulator, "Claim")
              .withArgs(deployer.address, await tokens[i].getAddress(), receiver.address, claimable[i]);
          }
          for (let i = 0; i < rewardCount; i++) {
            expect(await accumulator.claimable(deployer.address, await tokens[i].getAddress())).to.eq(0n);
            expect(await tokens[i].balanceOf(receiver.address)).to.eq(before[i] + claimable[i]);
            const snapshot = await accumulator.userRewardSnapshot(deployer.address, await tokens[i].getAddress());
            expect(snapshot.rewards.pending).to.eq(0n);
            expect(snapshot.rewards.claimed).to.eq(claimable[i]);
            expect(await accumulator.claimed(deployer.address, await tokens[i].getAddress())).to.eq(claimable[i]);
          }
          await expect(accumulator.connect(manager)["claim(address)"](deployer.address)).to.not.emit(
            accumulator,
            "Claim"
          );
          for (let i = 0; i < rewardCount; i++) {
            expect(await accumulator.claimable(deployer.address, await tokens[i].getAddress())).to.eq(0n);
            expect(await tokens[i].balanceOf(receiver.address)).to.eq(before[i] + claimable[i]);
            const snapshot = await accumulator.userRewardSnapshot(deployer.address, await tokens[i].getAddress());
            expect(snapshot.rewards.pending).to.eq(0n);
            expect(snapshot.rewards.claimed).to.eq(claimable[i]);
            expect(await accumulator.claimed(deployer.address, await tokens[i].getAddress())).to.eq(claimable[i]);
          }
        });

        it("should succeed when claim to other", async () => {
          const claimable = [];
          const before = [];
          for (let i = 0; i < rewardCount; i++) {
            claimable.push(await accumulator.claimable(deployer.address, await tokens[i].getAddress()));
            before.push(await tokens[i].balanceOf(manager.address));
            const snapshot = await accumulator.userRewardSnapshot(deployer.address, await tokens[i].getAddress());
            expect(snapshot.rewards.pending).to.gt(0n);
            expect(snapshot.rewards.claimed).to.eq(0n);
          }
          const tx = accumulator["claim(address,address)"](deployer.address, manager.address);
          for (let i = 0; i < rewardCount; i++) {
            await expect(tx)
              .to.emit(accumulator, "Claim")
              .withArgs(deployer.address, await tokens[i].getAddress(), manager.address, claimable[i]);
          }
          for (let i = 0; i < rewardCount; i++) {
            expect(await accumulator.claimable(deployer.address, await tokens[i].getAddress())).to.eq(0n);
            expect(await tokens[i].balanceOf(manager.address)).to.eq(before[i] + claimable[i]);
            const snapshot = await accumulator.userRewardSnapshot(deployer.address, await tokens[i].getAddress());
            expect(snapshot.rewards.pending).to.eq(0n);
            expect(snapshot.rewards.claimed).to.eq(claimable[i]);
            expect(await accumulator.claimed(deployer.address, await tokens[i].getAddress())).to.eq(claimable[i]);
          }
          await expect(accumulator["claim(address,address)"](deployer.address, manager.address)).to.not.emit(
            accumulator,
            "Claim"
          );
          for (let i = 0; i < rewardCount; i++) {
            expect(await accumulator.claimable(deployer.address, await tokens[i].getAddress())).to.eq(0n);
            expect(await tokens[i].balanceOf(manager.address)).to.eq(before[i] + claimable[i]);
            const snapshot = await accumulator.userRewardSnapshot(deployer.address, await tokens[i].getAddress());
            expect(snapshot.rewards.pending).to.eq(0n);
            expect(snapshot.rewards.claimed).to.eq(claimable[i]);
            expect(await accumulator.claimed(deployer.address, await tokens[i].getAddress())).to.eq(claimable[i]);
          }
        });
      });

      context("#claimHistorical without setting rewardReceiver", async () => {
        const BaseRewardAmount = ethers.parseEther("2233");
        const TotalPoolShare = ethers.parseEther("1234");
        const UserPoolShare = ethers.parseEther("456");

        beforeEach(async () => {
          await accumulator.setTotalPoolShare(TotalPoolShare, 10n ** 18n);
          await accumulator.setUserPoolShare(UserPoolShare, 10n ** 18n);
          for (let i = 0; i < rewardCount; i++) {
            const depositedAmount = BaseRewardAmount * toBigInt(i + 1);
            await accumulator.depositReward(await tokens[i].getAddress(), depositedAmount);
          }
          if (periodLength > 0) {
            const timestamp = (await ethers.provider.getBlock("latest"))!.timestamp;
            await network.provider.send("evm_setNextBlockTimestamp", [timestamp + periodLength]);
          }
          await accumulator.checkpoint(ZeroAddress);
          for (let i = 0; i < rewardCount; i++) {
            await accumulator.connect(manager).unregisterRewardToken(await tokens[i].getAddress());
          }
          await accumulator.checkpoint(deployer.address);
        });

        it("should succeed when claim caller", async () => {
          const claimable = [];
          const before = [];
          for (let i = 0; i < rewardCount; i++) {
            claimable.push(await accumulator.claimable(deployer.address, await tokens[i].getAddress()));
            before.push(await tokens[i].balanceOf(deployer.address));
            const snapshot = await accumulator.userRewardSnapshot(deployer.address, await tokens[i].getAddress());
            expect(snapshot.rewards.pending).to.gt(0n);
            expect(snapshot.rewards.claimed).to.eq(0n);
          }
          await expect(accumulator["claim()"]()).to.not.emit(accumulator, "Claim");
          const tx = accumulator["claimHistorical(address[])"](tokenAddresses);
          for (let i = 0; i < rewardCount; i++) {
            await expect(tx)
              .to.emit(accumulator, "Claim")
              .withArgs(deployer.address, await tokens[i].getAddress(), deployer.address, claimable[i]);
          }
          for (let i = 0; i < rewardCount; i++) {
            expect(await accumulator.claimable(deployer.address, await tokens[i].getAddress())).to.eq(0n);
            expect(await tokens[i].balanceOf(deployer.address)).to.eq(before[i] + claimable[i]);
            const snapshot = await accumulator.userRewardSnapshot(deployer.address, await tokens[i].getAddress());
            expect(snapshot.rewards.pending).to.eq(0n);
            expect(snapshot.rewards.claimed).to.eq(claimable[i]);
            expect(await accumulator.claimed(deployer.address, await tokens[i].getAddress())).to.eq(claimable[i]);
          }
          await expect(accumulator["claimHistorical(address[])"](tokenAddresses)).to.not.emit(accumulator, "Claim");
        });

        it("should succeed when claim other", async () => {
          const claimable = [];
          const before = [];
          for (let i = 0; i < rewardCount; i++) {
            claimable.push(await accumulator.claimable(deployer.address, await tokens[i].getAddress()));
            before.push(await tokens[i].balanceOf(deployer.address));
            const snapshot = await accumulator.userRewardSnapshot(deployer.address, await tokens[i].getAddress());
            expect(snapshot.rewards.pending).to.gt(0n);
            expect(snapshot.rewards.claimed).to.eq(0n);
          }
          await expect(accumulator["claim()"]()).to.not.emit(accumulator, "Claim");
          const tx = accumulator
            .connect(manager)
            ["claimHistorical(address,address[])"](deployer.address, tokenAddresses);
          for (let i = 0; i < rewardCount; i++) {
            await expect(tx)
              .to.emit(accumulator, "Claim")
              .withArgs(deployer.address, await tokens[i].getAddress(), deployer.address, claimable[i]);
          }
          for (let i = 0; i < rewardCount; i++) {
            expect(await accumulator.claimable(deployer.address, await tokens[i].getAddress())).to.eq(0n);
            expect(await tokens[i].balanceOf(deployer.address)).to.eq(before[i] + claimable[i]);
            const snapshot = await accumulator.userRewardSnapshot(deployer.address, await tokens[i].getAddress());
            expect(snapshot.rewards.pending).to.eq(0n);
            expect(snapshot.rewards.claimed).to.eq(claimable[i]);
            expect(await accumulator.claimed(deployer.address, await tokens[i].getAddress())).to.eq(claimable[i]);
          }
          await expect(
            accumulator.connect(manager)["claimHistorical(address,address[])"](deployer.address, tokenAddresses)
          ).to.not.emit(accumulator, "Claim");
        });
      });

      context("#claimHistorical with setting rewardReceiver", async () => {
        const BaseRewardAmount = ethers.parseEther("2233");
        const TotalPoolShare = ethers.parseEther("1234");
        const UserPoolShare = ethers.parseEther("456");

        beforeEach(async () => {
          await accumulator.setTotalPoolShare(TotalPoolShare, 10n ** 18n);
          await accumulator.setUserPoolShare(UserPoolShare, 10n ** 18n);
          for (let i = 0; i < rewardCount; i++) {
            const depositedAmount = BaseRewardAmount * toBigInt(i + 1);
            await accumulator.depositReward(await tokens[i].getAddress(), depositedAmount);
          }
          if (periodLength > 0) {
            const timestamp = (await ethers.provider.getBlock("latest"))!.timestamp;
            await network.provider.send("evm_setNextBlockTimestamp", [timestamp + periodLength]);
          }
          await accumulator.checkpoint(ZeroAddress);
          for (let i = 0; i < rewardCount; i++) {
            await accumulator.connect(manager).unregisterRewardToken(await tokens[i].getAddress());
          }
          await accumulator.checkpoint(deployer.address);
          await accumulator.connect(deployer).setRewardReceiver(receiver.address);
        });

        it("should succeed when claim caller", async () => {
          const claimable = [];
          const before = [];
          for (let i = 0; i < rewardCount; i++) {
            claimable.push(await accumulator.claimable(deployer.address, await tokens[i].getAddress()));
            before.push(await tokens[i].balanceOf(receiver.address));
            const snapshot = await accumulator.userRewardSnapshot(deployer.address, await tokens[i].getAddress());
            expect(snapshot.rewards.pending).to.gt(0n);
            expect(snapshot.rewards.claimed).to.eq(0n);
          }
          await expect(accumulator["claim()"]()).to.not.emit(accumulator, "Claim");
          const tx = accumulator["claimHistorical(address[])"](tokenAddresses);
          for (let i = 0; i < rewardCount; i++) {
            await expect(tx)
              .to.emit(accumulator, "Claim")
              .withArgs(deployer.address, await tokens[i].getAddress(), receiver.address, claimable[i]);
          }
          for (let i = 0; i < rewardCount; i++) {
            expect(await accumulator.claimable(deployer.address, await tokens[i].getAddress())).to.eq(0n);
            expect(await tokens[i].balanceOf(receiver.address)).to.eq(before[i] + claimable[i]);
            const snapshot = await accumulator.userRewardSnapshot(deployer.address, await tokens[i].getAddress());
            expect(snapshot.rewards.pending).to.eq(0n);
            expect(snapshot.rewards.claimed).to.eq(claimable[i]);
            expect(await accumulator.claimed(deployer.address, await tokens[i].getAddress())).to.eq(claimable[i]);
          }
          await expect(accumulator["claimHistorical(address[])"](tokenAddresses)).to.not.emit(accumulator, "Claim");
        });

        it("should succeed when claim other", async () => {
          const claimable = [];
          const before = [];
          for (let i = 0; i < rewardCount; i++) {
            claimable.push(await accumulator.claimable(deployer.address, await tokens[i].getAddress()));
            before.push(await tokens[i].balanceOf(receiver.address));
            const snapshot = await accumulator.userRewardSnapshot(deployer.address, await tokens[i].getAddress());
            expect(snapshot.rewards.pending).to.gt(0n);
            expect(snapshot.rewards.claimed).to.eq(0n);
          }
          await expect(accumulator["claim()"]()).to.not.emit(accumulator, "Claim");
          const tx = accumulator
            .connect(manager)
            ["claimHistorical(address,address[])"](deployer.address, tokenAddresses);
          for (let i = 0; i < rewardCount; i++) {
            await expect(tx)
              .to.emit(accumulator, "Claim")
              .withArgs(deployer.address, await tokens[i].getAddress(), receiver.address, claimable[i]);
          }
          for (let i = 0; i < rewardCount; i++) {
            expect(await accumulator.claimable(deployer.address, await tokens[i].getAddress())).to.eq(0n);
            expect(await tokens[i].balanceOf(receiver.address)).to.eq(before[i] + claimable[i]);
            const snapshot = await accumulator.userRewardSnapshot(deployer.address, await tokens[i].getAddress());
            expect(snapshot.rewards.pending).to.eq(0n);
            expect(snapshot.rewards.claimed).to.eq(claimable[i]);
            expect(await accumulator.claimed(deployer.address, await tokens[i].getAddress())).to.eq(claimable[i]);
          }
          await expect(
            accumulator.connect(manager)["claimHistorical(address,address[])"](deployer.address, tokenAddresses)
          ).to.not.emit(accumulator, "Claim");
        });
      });
    });
  }
});
