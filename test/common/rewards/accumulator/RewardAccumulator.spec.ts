import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { MaxUint256, ZeroAddress, ZeroHash, toBigInt } from "ethers";
import { ethers, network } from "hardhat";

import { MockERC20, MockRewardAccumulator } from "@/types/index";

describe("RewardAccumulator.spec", async () => {
  for (const periodLength of [0, 86400, 86400 * 7, 86400 * 14]) {
    let deployer: HardhatEthersSigner;
    let manager: HardhatEthersSigner;
    let receiver: HardhatEthersSigner;

    let token: MockERC20;
    let accumulator: MockRewardAccumulator;

    context(`run with period[${periodLength}]`, async () => {
      beforeEach(async () => {
        [deployer, manager, receiver] = await ethers.getSigners();
        const MockERC20 = await ethers.getContractFactory("MockERC20", deployer);
        const MockRewardAccumulator = await ethers.getContractFactory("MockRewardAccumulator", deployer);

        token = await MockERC20.deploy("R", "R", 18);
        await token.mint(deployer.address, ethers.parseEther("1000000"));
        accumulator = await MockRewardAccumulator.deploy(periodLength);
        await accumulator.initialize(token.getAddress());
        await accumulator.grantRole(await accumulator.REWARD_DEPOSITOR_ROLE(), deployer.address);
        await token.approve(accumulator.getAddress(), MaxUint256);
      });

      context("initialization", async () => {
        it("should initialize correctly", async () => {
          expect(await accumulator.periodLength()).to.eq(periodLength);
          expect(await accumulator.rewardToken()).to.deep.eq(await token.getAddress());
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
      });

      context("#checkpoint", async () => {
        const BaseRewardAmount = ethers.parseEther("2233");
        const TotalPoolShare = ethers.parseEther("1234");
        const UserPoolShare = ethers.parseEther("456");

        beforeEach(async () => {
          await accumulator.setTotalPoolShare(TotalPoolShare);
          await accumulator.setUserPoolShare(UserPoolShare);
          const depositedAmount = BaseRewardAmount;
          await accumulator.depositReward(depositedAmount);
        });

        if (periodLength === 0) {
          it("should update global snapshot", async () => {
            const snapshot = await accumulator.rewardSnapshot();
            const depositedAmount = BaseRewardAmount;
            expect(snapshot.integral).to.eq((depositedAmount * 10n ** 18n) / TotalPoolShare);
          });

          it("should do nothing when deposit zero rewards", async () => {
            {
              const snapshot = await accumulator.rewardSnapshot();
              const depositedAmount = BaseRewardAmount;
              expect(snapshot.integral).to.eq((depositedAmount * 10n ** 18n) / TotalPoolShare);
            }

            await accumulator.depositReward(0n);
            await accumulator.checkpoint(ZeroAddress);
            {
              const snapshot = await accumulator.rewardSnapshot();
              const depositedAmount = BaseRewardAmount;
              expect(snapshot.integral).to.eq((depositedAmount * 10n ** 18n) / TotalPoolShare);
            }
          });

          it("should succeed, when checkpoint normal user", async () => {
            await accumulator.checkpoint(deployer.address);
            let timestamp = (await ethers.provider.getBlock("latest"))!.timestamp;
            {
              const snapshot = await accumulator.rewardSnapshot();
              const depositedAmount = BaseRewardAmount;
              const userSnapshot = await accumulator.userRewardSnapshot(deployer.address);
              expect(userSnapshot.checkpoint.timestamp).to.eq(timestamp + periodLength);
              expect(userSnapshot.checkpoint.integral).to.eq(snapshot.integral);
              expect(userSnapshot.rewards.pending).to.closeTo(
                (depositedAmount * UserPoolShare) / TotalPoolShare,
                userSnapshot.rewards.pending / 1000000n
              ); // error within 0.00001%
            }

            // deposit again
            {
              const depositedAmount = BaseRewardAmount;
              await accumulator.depositReward(depositedAmount);
            }
            await accumulator.checkpoint(deployer.address);
            timestamp = (await ethers.provider.getBlock("latest"))!.timestamp;

            {
              const snapshot = await accumulator.rewardSnapshot();
              const depositedAmount = BaseRewardAmount;
              expect(snapshot.integral).to.eq(((depositedAmount * 10n ** 18n) / TotalPoolShare) * 2n);
              const userSnapshot = await accumulator.userRewardSnapshot(deployer.address);
              expect(userSnapshot.checkpoint.timestamp).to.eq(timestamp + periodLength);
              expect(userSnapshot.checkpoint.integral).to.eq(snapshot.integral);
              expect(userSnapshot.rewards.pending).to.closeTo(
                ((depositedAmount * UserPoolShare) / TotalPoolShare) * 2n,
                userSnapshot.rewards.pending / 1000000n
              ); // error within 0.00001%
            }
          });
        } else {
          it("should succeed when only checkpoint global snapshot", async () => {
            const timestamp = (await ethers.provider.getBlock("latest"))!.timestamp;
            await network.provider.send("evm_setNextBlockTimestamp", [timestamp + periodLength]);
            await accumulator.checkpoint(ZeroAddress);

            {
              const snapshot = await accumulator.rewardSnapshot();
              const depositedAmount = BaseRewardAmount;
              const rate = depositedAmount / toBigInt(periodLength);
              expect(snapshot.integral).to.closeTo((rate * toBigInt(periodLength) * 10n ** 18n) / TotalPoolShare, 100n);
              expect(snapshot.timestamp).to.eq(timestamp + periodLength);
            }
          });

          it("should succeed, when checkpoint normal user", async () => {
            let timestamp = (await ethers.provider.getBlock("latest"))!.timestamp;
            await network.provider.send("evm_setNextBlockTimestamp", [timestamp + periodLength]);
            await accumulator.checkpoint(deployer.address);

            {
              const snapshot = await accumulator.rewardSnapshot();
              const depositedAmount = BaseRewardAmount;
              const rate = depositedAmount / toBigInt(periodLength);
              expect(snapshot.integral).to.closeTo((rate * toBigInt(periodLength) * 10n ** 18n) / TotalPoolShare, 100n);
              expect(snapshot.timestamp).to.eq(timestamp + periodLength);

              const userSnapshot = await accumulator.userRewardSnapshot(deployer.address);
              expect(userSnapshot.checkpoint.timestamp).to.eq(timestamp + periodLength);
              expect(userSnapshot.checkpoint.integral).to.eq(snapshot.integral);
              expect(userSnapshot.rewards.pending).to.closeTo(
                (depositedAmount * UserPoolShare) / TotalPoolShare,
                userSnapshot.rewards.pending / 1000000n
              ); // error within 0.00001%
            }

            // deposit again
            {
              const depositedAmount = BaseRewardAmount;
              await accumulator.depositReward(depositedAmount);
            }
            timestamp = (await ethers.provider.getBlock("latest"))!.timestamp;
            await network.provider.send("evm_setNextBlockTimestamp", [timestamp + periodLength]);
            await accumulator.checkpoint(deployer.address);

            {
              const snapshot = await accumulator.rewardSnapshot();
              const depositedAmount = BaseRewardAmount;
              const rate = depositedAmount / toBigInt(periodLength);
              expect(snapshot.integral).to.closeTo(
                ((rate * toBigInt(periodLength) * 10n ** 18n) / TotalPoolShare) * 2n,
                1000n
              );
              expect(snapshot.timestamp).to.eq(timestamp + periodLength);

              const userSnapshot = await accumulator.userRewardSnapshot(deployer.address);
              expect(userSnapshot.checkpoint.timestamp).to.eq(timestamp + periodLength);
              expect(userSnapshot.checkpoint.integral).to.eq(snapshot.integral);
              expect(userSnapshot.rewards.pending).to.closeTo(
                ((depositedAmount * UserPoolShare) / TotalPoolShare) * 2n,
                userSnapshot.rewards.pending / 1000000n
              ); // error within 0.00001%
            }
          });
        }
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
          await accumulator.setTotalPoolShare(TotalPoolShare);
          await accumulator.setUserPoolShare(UserPoolShare);
          {
            const depositedAmount = BaseRewardAmount;
            await accumulator.depositReward(depositedAmount);
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
          const claimable = await accumulator.claimable(deployer.address);
          const before = await token.balanceOf(deployer.address);
          {
            const snapshot = await accumulator.userRewardSnapshot(deployer.address);
            expect(snapshot.rewards.pending).to.gt(0n);
            expect(snapshot.rewards.claimed).to.eq(0n);
          }
          const tx = accumulator["claim()"]();
          await expect(tx).to.emit(accumulator, "Claim").withArgs(deployer.address, deployer.address, claimable);
          {
            expect(await accumulator.claimable(deployer.address)).to.eq(0n);
            expect(await token.balanceOf(deployer.address)).to.eq(before + claimable);
            const snapshot = await accumulator.userRewardSnapshot(deployer.address);
            expect(snapshot.rewards.pending).to.eq(0n);
            expect(snapshot.rewards.claimed).to.eq(claimable);
            expect(await accumulator.claimed(deployer.address)).to.eq(claimable);
          }
          await expect(accumulator["claim()"]()).to.not.emit(accumulator, "Claim");
          {
            expect(await accumulator.claimable(deployer.address)).to.eq(0n);
            expect(await token.balanceOf(deployer.address)).to.eq(before + claimable);
            const snapshot = await accumulator.userRewardSnapshot(deployer.address);
            expect(snapshot.rewards.pending).to.eq(0n);
            expect(snapshot.rewards.claimed).to.eq(claimable);
            expect(await accumulator.claimed(deployer.address)).to.eq(claimable);
          }
        });

        it("should succeed when claim other", async () => {
          const claimable = await accumulator.claimable(deployer.address);
          const before = await token.balanceOf(deployer.address);
          {
            const snapshot = await accumulator.userRewardSnapshot(deployer.address);
            expect(snapshot.rewards.pending).to.gt(0n);
            expect(snapshot.rewards.claimed).to.eq(0n);
          }
          const tx = accumulator.connect(manager)["claim(address)"](deployer.address);
          await expect(tx).to.emit(accumulator, "Claim").withArgs(deployer.address, deployer.address, claimable);
          {
            expect(await accumulator.claimable(deployer.address)).to.eq(0n);
            expect(await token.balanceOf(deployer.address)).to.eq(before + claimable);
            const snapshot = await accumulator.userRewardSnapshot(deployer.address);
            expect(snapshot.rewards.pending).to.eq(0n);
            expect(snapshot.rewards.claimed).to.eq(claimable);
            expect(await accumulator.claimed(deployer.address)).to.eq(claimable);
          }
          await expect(accumulator.connect(manager)["claim(address)"](deployer.address)).to.not.emit(
            accumulator,
            "Claim"
          );
          {
            expect(await accumulator.claimable(deployer.address)).to.eq(0n);
            expect(await token.balanceOf(deployer.address)).to.eq(before + claimable);
            const snapshot = await accumulator.userRewardSnapshot(deployer.address);
            expect(snapshot.rewards.pending).to.eq(0n);
            expect(snapshot.rewards.claimed).to.eq(claimable);
            expect(await accumulator.claimed(deployer.address)).to.eq(claimable);
          }
        });

        it("should succeed when claim to other", async () => {
          const claimable = await accumulator.claimable(deployer.address);
          const before = await token.balanceOf(manager.address);
          {
            const snapshot = await accumulator.userRewardSnapshot(deployer.address);
            expect(snapshot.rewards.pending).to.gt(0n);
            expect(snapshot.rewards.claimed).to.eq(0n);
          }
          const tx = accumulator["claim(address,address)"](deployer.address, manager.address);
          await expect(tx).to.emit(accumulator, "Claim").withArgs(deployer.address, manager.address, claimable);
          {
            expect(await accumulator.claimable(deployer.address)).to.eq(0n);
            expect(await token.balanceOf(manager.address)).to.eq(before + claimable);
            const snapshot = await accumulator.userRewardSnapshot(deployer.address);
            expect(snapshot.rewards.pending).to.eq(0n);
            expect(snapshot.rewards.claimed).to.eq(claimable);
            expect(await accumulator.claimed(deployer.address)).to.eq(claimable);
          }
          await expect(accumulator["claim(address,address)"](deployer.address, manager.address)).to.not.emit(
            accumulator,
            "Claim"
          );
          {
            expect(await accumulator.claimable(deployer.address)).to.eq(0n);
            expect(await token.balanceOf(manager.address)).to.eq(before + claimable);
            const snapshot = await accumulator.userRewardSnapshot(deployer.address);
            expect(snapshot.rewards.pending).to.eq(0n);
            expect(snapshot.rewards.claimed).to.eq(claimable);
            expect(await accumulator.claimed(deployer.address)).to.eq(claimable);
          }
        });
      });

      context("#claim with setting rewardReceiver", async () => {
        const BaseRewardAmount = ethers.parseEther("2233");
        const TotalPoolShare = ethers.parseEther("1234");
        const UserPoolShare = ethers.parseEther("456");

        beforeEach(async () => {
          await accumulator.setTotalPoolShare(TotalPoolShare);
          await accumulator.setUserPoolShare(UserPoolShare);
          {
            const depositedAmount = BaseRewardAmount;
            await accumulator.depositReward(depositedAmount);
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
          const claimable = await accumulator.claimable(deployer.address);
          const before = await token.balanceOf(receiver.address);
          {
            const snapshot = await accumulator.userRewardSnapshot(deployer.address);
            expect(snapshot.rewards.pending).to.gt(0n);
            expect(snapshot.rewards.claimed).to.eq(0n);
          }
          const tx = accumulator["claim()"]();
          await expect(tx).to.emit(accumulator, "Claim").withArgs(deployer.address, receiver.address, claimable);
          {
            expect(await accumulator.claimable(deployer.address)).to.eq(0n);
            expect(await token.balanceOf(receiver.address)).to.eq(before + claimable);
            const snapshot = await accumulator.userRewardSnapshot(deployer.address);
            expect(snapshot.rewards.pending).to.eq(0n);
            expect(snapshot.rewards.claimed).to.eq(claimable);
            expect(await accumulator.claimed(deployer.address)).to.eq(claimable);
          }
          await expect(accumulator["claim()"]()).to.not.emit(accumulator, "Claim");
          {
            expect(await accumulator.claimable(deployer.address)).to.eq(0n);
            expect(await token.balanceOf(receiver.address)).to.eq(before + claimable);
            const snapshot = await accumulator.userRewardSnapshot(deployer.address);
            expect(snapshot.rewards.pending).to.eq(0n);
            expect(snapshot.rewards.claimed).to.eq(claimable);
            expect(await accumulator.claimed(deployer.address)).to.eq(claimable);
          }
        });

        it("should succeed when claim other", async () => {
          const claimable = await accumulator.claimable(deployer.address);
          const before = await token.balanceOf(receiver.address);
          {
            const snapshot = await accumulator.userRewardSnapshot(deployer.address);
            expect(snapshot.rewards.pending).to.gt(0n);
            expect(snapshot.rewards.claimed).to.eq(0n);
          }
          const tx = accumulator.connect(manager)["claim(address)"](deployer.address);
          await expect(tx).to.emit(accumulator, "Claim").withArgs(deployer.address, receiver.address, claimable);
          {
            expect(await accumulator.claimable(deployer.address)).to.eq(0n);
            expect(await token.balanceOf(receiver.address)).to.eq(before + claimable);
            const snapshot = await accumulator.userRewardSnapshot(deployer.address);
            expect(snapshot.rewards.pending).to.eq(0n);
            expect(snapshot.rewards.claimed).to.eq(claimable);
            expect(await accumulator.claimed(deployer.address)).to.eq(claimable);
          }
          await expect(accumulator.connect(manager)["claim(address)"](deployer.address)).to.not.emit(
            accumulator,
            "Claim"
          );
          {
            expect(await accumulator.claimable(deployer.address)).to.eq(0n);
            expect(await token.balanceOf(receiver.address)).to.eq(before + claimable);
            const snapshot = await accumulator.userRewardSnapshot(deployer.address);
            expect(snapshot.rewards.pending).to.eq(0n);
            expect(snapshot.rewards.claimed).to.eq(claimable);
            expect(await accumulator.claimed(deployer.address)).to.eq(claimable);
          }
        });

        it("should succeed when claim to other", async () => {
          const claimable = await accumulator.claimable(deployer.address);
          const before = await token.balanceOf(manager.address);
          {
            const snapshot = await accumulator.userRewardSnapshot(deployer.address);
            expect(snapshot.rewards.pending).to.gt(0n);
            expect(snapshot.rewards.claimed).to.eq(0n);
          }
          const tx = accumulator["claim(address,address)"](deployer.address, manager.address);
          await expect(tx).to.emit(accumulator, "Claim").withArgs(deployer.address, manager.address, claimable);
          {
            expect(await accumulator.claimable(deployer.address)).to.eq(0n);
            expect(await token.balanceOf(manager.address)).to.eq(before + claimable);
            const snapshot = await accumulator.userRewardSnapshot(deployer.address);
            expect(snapshot.rewards.pending).to.eq(0n);
            expect(snapshot.rewards.claimed).to.eq(claimable);
            expect(await accumulator.claimed(deployer.address)).to.eq(claimable);
          }
          await expect(accumulator["claim(address,address)"](deployer.address, manager.address)).to.not.emit(
            accumulator,
            "Claim"
          );
          {
            expect(await accumulator.claimable(deployer.address)).to.eq(0n);
            expect(await token.balanceOf(manager.address)).to.eq(before + claimable);
            const snapshot = await accumulator.userRewardSnapshot(deployer.address);
            expect(snapshot.rewards.pending).to.eq(0n);
            expect(snapshot.rewards.claimed).to.eq(claimable);
            expect(await accumulator.claimed(deployer.address)).to.eq(claimable);
          }
        });
      });
    });
  }
});
